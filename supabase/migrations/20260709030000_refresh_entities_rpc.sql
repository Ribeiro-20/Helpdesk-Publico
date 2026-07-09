-- RPC para recalcular todas as entidades adjudicantes a partir de anúncios e contratos.
-- Corre inteiramente no PostgreSQL — sem tráfego de rede — suporta milhões de contratos.

create or replace function refresh_entities_from_contracts(p_tenant_id uuid)
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

  -- ── 1. NIFs de entidades nos anúncios ────────────────────────────────────
  ann_agg as (
    select
      entity_nif                as nif,
      max(entity_name)          as name,
      count(*)::int             as total_announcements
    from announcements
    where tenant_id = p_tenant_id and entity_nif is not null
    group by entity_nif
  ),

  -- ── 2. Expandir contracting_entities dos contratos ────────────────────────
  entity_rows as (
    select
      c.contract_price,
      c.publication_date,
      c.cpv_main,
      c.execution_locations,
      c.winners,
      e.elem
    from contracts c
    cross join lateral jsonb_array_elements(coalesce(c.contracting_entities, '[]'::jsonb)) as e(elem)
    where c.tenant_id = p_tenant_id
  ),
  entity_parsed as (
    select
      contract_price, publication_date, cpv_main, execution_locations, winners,
      case
        when jsonb_typeof(elem) = 'object' then nullif(trim(elem->>'nif'), '')
        when elem#>>'{}' like '% - %'      then nullif(trim(split_part(elem#>>'{}', ' - ', 1)), '')
        else                                    nullif(trim(elem#>>'{}'), '')
      end as nif,
      case
        when jsonb_typeof(elem) = 'object' then
          coalesce(nullif(trim(elem->>'name'), ''), nullif(trim(elem->>'value'), ''))
        when elem#>>'{}' like '% - %'      then nullif(trim(split_part(elem#>>'{}', ' - ', 2)), '')
        else null
      end as name
    from entity_rows
  ),
  entities as (
    select * from entity_parsed where nif is not null and nif <> ''
  ),

  -- ── 3. Agregar contratos por entidade ────────────────────────────────────
  contract_agg as (
    select
      nif,
      (array_agg(name) filter (where name is not null and name <> ''))[1] as name,
      count(*)::int                       as total_contracts,
      coalesce(sum(contract_price), 0)    as total_value,
      max(publication_date)               as last_date
    from entities
    group by nif
  ),

  -- ── 4. Top 10 CPVs por entidade ───────────────────────────────────────────
  cpv_counts as (
    select nif, cpv_main, count(*)::int as cnt
    from entities where cpv_main is not null
    group by nif, cpv_main
  ),
  cpv_ranked as (
    select *, row_number() over (partition by nif order by cnt desc) as rn from cpv_counts
  ),
  cpv_agg as (
    select nif,
      jsonb_agg(jsonb_build_object('code', cpv_main, 'count', cnt) order by cnt desc) as top_cpvs
    from cpv_ranked where rn <= 10
    group by nif
  ),

  -- ── 5. Top 10 empresas por entidade ──────────────────────────────────────
  winner_rows as (
    select e.nif as entity_nif, e.contract_price, w.elem
    from entities e
    cross join lateral jsonb_array_elements(coalesce(e.winners, '[]'::jsonb)) as w(elem)
  ),
  winner_parsed as (
    select
      entity_nif, contract_price,
      case
        when jsonb_typeof(elem) = 'object' then nullif(trim(elem->>'nif'), '')
        when elem#>>'{}' like '% - %'      then nullif(trim(split_part(elem#>>'{}', ' - ', 1)), '')
        else                                    nullif(trim(elem#>>'{}'), '')
      end as winner_nif,
      case
        when jsonb_typeof(elem) = 'object' then
          coalesce(nullif(trim(elem->>'name'), ''), nullif(trim(elem->>'value'), ''))
        when elem#>>'{}' like '% - %'      then nullif(trim(split_part(elem#>>'{}', ' - ', 2)), '')
        else null
      end as winner_name
    from winner_rows
  ),
  company_counts as (
    select
      entity_nif, winner_nif,
      max(winner_name) as winner_name,
      count(*)::int    as cnt,
      round(coalesce(sum(contract_price), 0)::numeric, 2) as val
    from winner_parsed
    where winner_nif is not null and winner_nif <> '' and winner_nif ~ '^\d'
    group by entity_nif, winner_nif
  ),
  company_ranked as (
    select *, row_number() over (partition by entity_nif order by cnt desc) as rn from company_counts
  ),
  company_agg as (
    select entity_nif as nif,
      jsonb_agg(jsonb_build_object('nif', winner_nif, 'name', winner_name, 'count', cnt, 'value', val) order by cnt desc) as top_companies
    from company_ranked where rn <= 10
    group by entity_nif
  ),

  -- ── 6. Localização mais frequente por entidade ────────────────────────────
  loc_rows as (
    select e.nif, l.elem#>>'{}' as loc_str
    from entities e
    cross join lateral jsonb_array_elements(coalesce(e.execution_locations, '[]'::jsonb)) as l(elem)
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
  ),

  -- ── 7. Inferir tipo de entidade pelo nome ────────────────────────────────
  all_nifs as (
    select nif from ann_agg union select nif from contract_agg
  ),
  all_names as (
    select an.nif, coalesce(ca.name, aa.name, an.nif) as name
    from all_nifs an
    left join contract_agg ca on ca.nif = an.nif
    left join ann_agg aa on aa.nif = an.nif
  ),
  inferred as (
    select
      nif, name,
      case
        when lower(name) like '%câmara municipal%' or lower(name) like '%município%' or lower(name) like '%municipio%' then 'município'
        when lower(name) like '%junta de freguesia%' or lower(name) like '%união de freguesias%' or lower(name) like '%uniao de freguesias%' then 'freguesia'
        when lower(name) like '%ministério%' or lower(name) like '%ministerio%' then 'ministério'
        when lower(name) like '%hospital%' or lower(name) like '%centro hospitalar%' or lower(name) like '%ars %' or lower(name) like '%aces %' or lower(name) like '%administração regional de saúde%' or lower(name) like '%unidade local de saúde%' or lower(name) like '%uls %' then 'saúde'
        when lower(name) like '%universidade%' or lower(name) like '%politécnico%' or lower(name) like '%politecnico%' or lower(name) like '%escola superior%' or lower(name) like '%instituto superior%' or lower(name) like '%agrupamento de escolas%' then 'ensino'
        when lower(name) like '%instituto%' and lower(name) not like '%instituto superior%' then 'instituto'
        when lower(name) like '%, e.p.' or lower(name) like '%, ep' or lower(name) like '%, e.p.e.' or lower(name) like '%, epe' or lower(name) like '%, s.a.' or lower(name) like '%, sa' or lower(name) like '%empresa municipal%' or lower(name) like '%empresa pública%' then 'empresa_publica'
        when lower(name) like '%autoridade%' or lower(name) like '%regulador%' then 'autoridade'
        when lower(name) like '%guarda nacional%' or lower(name) like '%forças armadas%' or lower(name) like '%polícia%' then 'defesa'
        else null
      end as entity_type
    from all_names
  )

  -- ── 8. Upsert final ───────────────────────────────────────────────────────
  insert into entities (
    tenant_id, nif, name, entity_type, location,
    total_announcements, total_contracts, total_value, avg_contract_value,
    top_cpvs, top_companies, last_activity_at
  )
  select
    p_tenant_id,
    inf.nif,
    inf.name,
    inf.entity_type,
    la.location,
    coalesce(aa.total_announcements, 0),
    coalesce(ca.total_contracts, 0),
    coalesce(ca.total_value, 0),
    case when coalesce(ca.total_contracts, 0) > 0
      then round((ca.total_value / ca.total_contracts)::numeric, 2) else null end,
    coalesce(cpv.top_cpvs, '[]'::jsonb),
    coalesce(cmp.top_companies, '[]'::jsonb),
    ca.last_date::timestamptz
  from inferred inf
  left join ann_agg       aa  on aa.nif  = inf.nif
  left join contract_agg  ca  on ca.nif  = inf.nif
  left join cpv_agg       cpv on cpv.nif = inf.nif
  left join company_agg   cmp on cmp.nif = inf.nif
  left join loc_agg       la  on la.nif  = inf.nif
  on conflict (tenant_id, nif) do update set
    name                = excluded.name,
    entity_type         = coalesce(entities.entity_type, excluded.entity_type),
    location            = coalesce(entities.location, excluded.location),
    total_announcements = excluded.total_announcements,
    total_contracts     = excluded.total_contracts,
    total_value         = excluded.total_value,
    avg_contract_value  = excluded.avg_contract_value,
    top_cpvs            = excluded.top_cpvs,
    top_companies       = excluded.top_companies,
    last_activity_at    = excluded.last_activity_at;

  get diagnostics v_upserted = row_count;

  return jsonb_build_object(
    'entities_upserted', v_upserted,
    'elapsed_ms', round(extract(epoch from clock_timestamp() - v_start) * 1000)::int
  );
end;
$$;

grant execute on function refresh_entities_from_contracts(uuid) to service_role;
