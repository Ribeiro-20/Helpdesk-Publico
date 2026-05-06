-- ============================================================================
-- RPC: contracts_by_entity_nif / contracts_by_winner_nif
-- Busca contratos por NIF dentro dos arrays JSONB (contracting_entities, winners)
-- Necessário porque o Supabase JS não suporta LIKE/ILIKE em colunas JSONB
-- ============================================================================

-- Contratos onde a entidade adjudicante tem o NIF dado
create or replace function contracts_by_entity_nif(
  p_tenant_id uuid,
  p_nif text,
  p_limit int default 20
)
returns setof contracts
language sql
stable
security definer
as $$
  select c.*
  from contracts c
  where c.tenant_id = p_tenant_id
    and exists (
      select 1 from jsonb_array_elements_text(c.contracting_entities) as elem
      where elem like p_nif || ' - %'
         or elem = p_nif
    )
  order by c.signing_date desc nulls last, c.publication_date desc nulls last
  limit p_limit;
$$;

-- Contratos onde a empresa vencedora tem o NIF dado
create or replace function contracts_by_winner_nif(
  p_tenant_id uuid,
  p_nif text,
  p_limit int default 20
)
returns setof contracts
language sql
stable
security definer
as $$
  select c.*
  from contracts c
  where c.tenant_id = p_tenant_id
    and exists (
      select 1 from jsonb_array_elements_text(c.winners) as elem
      where elem like p_nif || ' - %'
         or elem = p_nif
    )
  order by c.signing_date desc nulls last, c.publication_date desc nulls last
  limit p_limit;
$$;

-- Contar contratos por NIF de entidade (para KPIs live)
create or replace function count_contracts_by_entity_nif(
  p_tenant_id uuid,
  p_nif text
)
returns bigint
language sql
stable
security definer
as $$
  select count(*)
  from contracts c
  where c.tenant_id = p_tenant_id
    and exists (
      select 1 from jsonb_array_elements_text(c.contracting_entities) as elem
      where elem like p_nif || ' - %'
         or elem = p_nif
    );
$$;

-- Contar contratos por NIF de empresa vencedora (para KPIs live)
create or replace function count_contracts_by_winner_nif(
  p_tenant_id uuid,
  p_nif text
)
returns bigint
language sql
stable
security definer
as $$
  select count(*)
  from contracts c
  where c.tenant_id = p_tenant_id
    and exists (
      select 1 from jsonb_array_elements_text(c.winners) as elem
      where elem like p_nif || ' - %'
         or elem = p_nif
    );
$$;

-- Pesquisa de contratos com filtros JSONB (para a página de listagem)
-- Suporta filtro por NIF de entidade e/ou NIF de vencedor via text cast
create or replace function search_contracts(
  p_tenant_id uuid,
  p_entity_nif text default null,
  p_winner_nif text default null,
  p_cpv text default null,
  p_procedure text default null,
  p_min_value numeric default null,
  p_max_value numeric default null,
  p_from_date date default null,
  p_to_date date default null,
  p_sort text default 'signing_date',
  p_offset int default 0,
  p_limit int default 20
)
returns table (
  rows jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
as $$
declare
  v_count bigint;
  v_rows jsonb;
begin
  -- Count
  select count(*) into v_count
  from contracts c
  where c.tenant_id = p_tenant_id
    and (p_entity_nif is null or c.contracting_entities::text ilike '%' || p_entity_nif || '%')
    and (p_winner_nif is null or c.winners::text ilike '%' || p_winner_nif || '%')
    and (p_cpv is null or c.cpv_main ilike '%' || p_cpv || '%')
    and (p_procedure is null or c.procedure_type ilike '%' || p_procedure || '%')
    and (p_min_value is null or c.contract_price >= p_min_value)
    and (p_max_value is null or c.contract_price <= p_max_value)
    and (p_from_date is null or c.signing_date >= p_from_date)
    and (p_to_date is null or c.signing_date <= p_to_date);

  -- Rows
  select coalesce(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb) into v_rows
  from (
    select c.id, c.object, c.procedure_type, c.publication_date, c.signing_date,
           c.cpv_main, c.contract_price, c.base_price, c.effective_price,
           c.currency, c.status, c.contracting_entities, c.winners
    from contracts c
    where c.tenant_id = p_tenant_id
      and (p_entity_nif is null or c.contracting_entities::text ilike '%' || p_entity_nif || '%')
      and (p_winner_nif is null or c.winners::text ilike '%' || p_winner_nif || '%')
      and (p_cpv is null or c.cpv_main ilike '%' || p_cpv || '%')
      and (p_procedure is null or c.procedure_type ilike '%' || p_procedure || '%')
      and (p_min_value is null or c.contract_price >= p_min_value)
      and (p_max_value is null or c.contract_price <= p_max_value)
      and (p_from_date is null or c.signing_date >= p_from_date)
      and (p_to_date is null or c.signing_date <= p_to_date)
    order by
      case when p_sort = 'signing_date' then c.signing_date end desc nulls last,
      case when p_sort = 'publication_date' then c.publication_date end desc nulls last,
      case when p_sort = 'value_desc' then c.contract_price end desc nulls last,
      case when p_sort = 'value_asc' then c.contract_price end asc nulls last,
      c.publication_date desc nulls last
    offset p_offset
    limit p_limit
  ) sub;

  return query select v_rows, v_count;
end;
$$;
