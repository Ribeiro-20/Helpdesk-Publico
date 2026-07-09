-- RPC para recalcular todas as empresas (adjudicatárias) a partir dos contratos.
-- Corre inteiramente no PostgreSQL — sem tráfego de rede — suporta milhões de contratos.

create or replace function refresh_companies_from_contracts(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upserted int;
  v_start    timestamptz := clock_timestamp();
begin

  with

  -- ── 1. Expandir vencedores de todos os contratos ──────────────────────────
  winner_rows as (
    select
      c.contract_price,
      c.publication_date,
      c.cpv_main,
      c.execution_locations,
      c.contracting_entities,
      w.elem
    from contracts c
    cross join lateral jsonb_array_elements(coalesce(c.winners, '[]'::jsonb)) as w(elem)
    where c.tenant_id = p_tenant_id
  ),

  -- ── 2. Extrair NIF e nome de cada entrada (string "NIF - Nome" ou objeto) ─
  winner_parsed as (
    select
      contract_price,
      publication_date,
      cpv_main,
      execution_locations,
      contracting_entities,
      case
        when jsonb_typeof(elem) = 'object' then nullif(trim(elem->>'nif'), '')
        when elem#>>'{}' like '% - %'      then nullif(trim(split_part(elem#>>'{}', ' - ', 1)), '')
        else                                    nullif(trim(elem#>>'{}'), '')
      end as nif,
      case
        when jsonb_typeof(elem) = 'object' then
          coalesce(nullif(trim(elem->>'name'), ''), nullif(trim(elem->>'value'), ''), nullif(trim(elem->>'nif'), ''))
        when elem#>>'{}' like '% - %'      then nullif(trim(split_part(elem#>>'{}', ' - ', 2)), '')
        else                                    nullif(trim(elem#>>'{}'), '')
      end as name
    from winner_rows
  ),

  winners as (
    select * from winner_parsed where nif is not null and nif <> '' and nif ~ '^\d'
  ),

  -- ── 3. Agregar por vencedor ───────────────────────────────────────────────
  won_agg as (
    select
      nif,
      (array_agg(name order by name nulls last) filter (where name is not null and name <> ''))[1] as name,
      count(*)::int                       as contracts_won,
      coalesce(sum(contract_price), 0)    as total_value_won,
      max(publication_date)               as last_win_date
    from winners
    group by nif
  ),

  -- ── 4. Expandir concorrentes (campo texto: "NIF - Nome" separados por ;|\n)
  competitor_chunks as (
    select regexp_split_to_table(coalesce(c.competitors, ''), '[;\n|]+') as chunk
    from contracts c
    where c.tenant_id = p_tenant_id and c.competitors is not null
  ),
  competitor_parsed as (
    select
      case when trim(chunk) like '% - %'
        then nullif(trim(split_part(trim(chunk), ' - ', 1)), '')
        else nullif(trim(chunk), '')
      end as nif,
      case when trim(chunk) like '% - %'
        then nullif(trim(split_part(trim(chunk), ' - ', 2)), '')
        else null
      end as name
    from competitor_chunks
    where trim(chunk) ~ '^\d{5,}'
  ),
  competitor_agg as (
    select
      nif,
      (array_agg(name) filter (where name is not null and name <> ''))[1] as name,
      count(*)::int as extra_participated
    from competitor_parsed
    where nif is not null and nif <> ''
    group by nif
  ),

  -- ── 5. Todos os NIFs (vencedores ∪ concorrentes) ─────────────────────────
  all_nifs as (
    select nif from won_agg
    union
    select nif from competitor_agg
  ),
  all_names as (
    select an.nif, coalesce(wa.name, ca.name, an.nif) as name
    from all_nifs an
    left join won_agg wa on wa.nif = an.nif
    left join competitor_agg ca on ca.nif = an.nif
  ),

  participated_agg as (
    select
      an.nif,
      coalesce(wa.contracts_won, 0) + coalesce(ca.extra_participated, 0) as contracts_participated
    from all_nifs an
    left join won_agg wa on wa.nif = an.nif
    left join competitor_agg ca on ca.nif = an.nif
  ),

  -- ── 6. Top 10 CPVs por vencedor ───────────────────────────────────────────
  cpv_counts as (
    select
      nif, cpv_main,
      count(*)::int                                            as cnt,
      round(coalesce(sum(contract_price), 0)::numeric, 2)     as val
    from winners where cpv_main is not null
    group by nif, cpv_main
  ),
  cpv_ranked as (
    select *, row_number() over (partition by nif order by cnt desc) as rn from cpv_counts
  ),
  cpv_agg as (
    select nif,
      jsonb_agg(jsonb_build_object('code', cpv_main, 'count', cnt, 'value', val) order by cnt desc) as cpv_spec
    from cpv_ranked where rn <= 10
    group by nif
  ),

  -- ── 7. Top 10 entidades por vencedor ──────────────────────────────────────
  ent_rows as (
    select w.nif as winner_nif, w.contract_price, e.elem as ent_elem
    from winners w
    cross join lateral jsonb_array_elements(coalesce(w.contracting_entities, '[]'::jsonb)) as e(elem)
  ),
  ent_parsed as (
    select
      winner_nif, contract_price,
      case
        when jsonb_typeof(ent_elem) = 'object' then nullif(trim(ent_elem->>'nif'), '')
        when ent_elem#>>'{}' like '% - %'      then nullif(trim(split_part(ent_elem#>>'{}', ' - ', 1)), '')
        else                                        nullif(trim(ent_elem#>>'{}'), '')
      end as ent_nif,
      case
        when jsonb_typeof(ent_elem) = 'object' then
          coalesce(nullif(trim(ent_elem->>'name'), ''), nullif(trim(ent_elem->>'value'), ''))
        when ent_elem#>>'{}' like '% - %'      then nullif(trim(split_part(ent_elem#>>'{}', ' - ', 2)), '')
        else null
      end as ent_name
    from ent_rows
  ),
  ent_counts as (
    select
      winner_nif, ent_nif,
      max(ent_name) as ent_name,
      count(*)::int as cnt,
      round(coalesce(sum(contract_price), 0)::numeric, 2) as val
    from ent_parsed where ent_nif is not null and ent_nif <> ''
    group by winner_nif, ent_nif
  ),
  ent_ranked as (
    select *, row_number() over (partition by winner_nif order by cnt desc) as rn from ent_counts
  ),
  ent_agg as (
    select winner_nif as nif,
      jsonb_agg(jsonb_build_object('nif', ent_nif, 'name', ent_name, 'count', cnt, 'value', val) order by cnt desc) as top_ents
    from ent_ranked where rn <= 10
    group by winner_nif
  ),

  -- ── 8. Localização mais frequente por vencedor ────────────────────────────
  loc_rows as (
    select w.nif, l.elem#>>'{}' as loc_str
    from winners w
    cross join lateral jsonb_array_elements(coalesce(w.execution_locations, '[]'::jsonb)) as l(elem)
  ),
  loc_parsed as (
    select nif,
      case
        when array_length(string_to_array(trim(loc_str), ','), 1) >= 3
          then trim(split_part(trim(loc_str), ',', 2)) || ', ' || trim(split_part(trim(loc_str), ',', 3))
        when array_length(string_to_array(trim(loc_str), ','), 1) >= 2
          then trim(split_part(trim(loc_str), ',', 2))
        else trim(loc_str)
      end as loc_key
    from loc_rows where loc_str is not null and trim(loc_str) <> ''
  ),
  loc_counts as (select nif, loc_key, count(*) as freq from loc_parsed group by nif, loc_key),
  loc_agg as (
    select distinct on (nif) nif, loc_key as location
    from loc_counts order by nif, freq desc
  )

  -- ── 9. Upsert final ───────────────────────────────────────────────────────
  insert into companies (
    tenant_id, nif, name, location,
    contracts_won, contracts_participated, total_value_won,
    avg_contract_value, win_rate, last_win_at,
    cpv_specialization, top_entities
  )
  select
    p_tenant_id,
    an.nif,
    na.name,
    la.location,
    coalesce(wa.contracts_won, 0),
    coalesce(pa.contracts_participated, 0),
    coalesce(wa.total_value_won, 0),
    case when coalesce(wa.contracts_won, 0) > 0
      then round((wa.total_value_won / wa.contracts_won)::numeric, 2) else null end,
    case when coalesce(pa.contracts_participated, 0) > 0
      then round((coalesce(wa.contracts_won, 0)::numeric / pa.contracts_participated * 100), 2) else null end,
    wa.last_win_date::timestamptz,
    coalesce(ca.cpv_spec, '[]'::jsonb),
    coalesce(ea.top_ents, '[]'::jsonb)
  from all_nifs an
  left join all_names    na on na.nif = an.nif
  left join won_agg      wa on wa.nif = an.nif
  left join participated_agg pa on pa.nif = an.nif
  left join cpv_agg      ca on ca.nif = an.nif
  left join ent_agg      ea on ea.nif = an.nif
  left join loc_agg      la on la.nif = an.nif
  on conflict (tenant_id, nif) do update set
    name                  = excluded.name,
    location              = coalesce(companies.location, excluded.location),
    contracts_won         = excluded.contracts_won,
    contracts_participated = excluded.contracts_participated,
    total_value_won       = excluded.total_value_won,
    avg_contract_value    = excluded.avg_contract_value,
    win_rate              = excluded.win_rate,
    last_win_at           = excluded.last_win_at,
    cpv_specialization    = excluded.cpv_specialization,
    top_entities          = excluded.top_entities;

  get diagnostics v_upserted = row_count;

  return jsonb_build_object(
    'companies_upserted', v_upserted,
    'elapsed_ms', round(extract(epoch from clock_timestamp() - v_start) * 1000)::int
  );
end;
$$;

grant execute on function refresh_companies_from_contracts(uuid) to service_role;
