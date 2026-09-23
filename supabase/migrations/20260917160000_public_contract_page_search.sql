begin;

-- Public listings need one bounded page, not an exact filtered count over the
-- 1.7 GB contracts heap. Keep an exact total only for the unfiltered view,
-- where the maintained registry makes it cheap.
create or replace function public.search_public_contract_pages(
  p_tenant_id uuid,
  p_entity text default null,
  p_winner text default null,
  p_cpv text default null,
  p_procedures text[] default null,
  p_contract_types text[] default null,
  p_country text default null,
  p_district text default null,
  p_municipality text default null,
  p_min_value numeric default null,
  p_max_value numeric default null,
  p_from_date date default null,
  p_to_date date default null,
  p_date_field text default 'publication_date',
  p_sort text default 'publication_date',
  p_offset integer default 0,
  p_limit integer default 25
)
returns table(rows jsonb, total_count bigint, has_more boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '5s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000000);
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_total_count bigint := null;
  v_unfiltered boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_tenant_id is null or not exists (
    select 1 from public.tenants t where t.id = p_tenant_id
  ) then
    raise exception 'invalid tenant' using errcode = '22023';
  end if;

  if p_date_field is null
    or p_date_field not in ('publication_date', 'signing_date', 'closing_date') then
    raise exception 'invalid date field' using errcode = '22023';
  end if;

  if p_sort is null
    or p_sort not in ('publication_date', 'signing_date', 'value_desc', 'value_asc') then
    raise exception 'invalid sort field' using errcode = '22023';
  end if;

  if p_min_value is not null and p_max_value is not null and p_min_value > p_max_value then
    raise exception 'minimum value must be before or equal to maximum value' using errcode = '22023';
  end if;

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'from date must be before or equal to to date' using errcode = '22023';
  end if;

  v_unfiltered := p_entity is null
    and p_winner is null
    and p_cpv is null
    and coalesce(cardinality(p_procedures), 0) = 0
    and coalesce(cardinality(p_contract_types), 0) = 0
    and p_country is null
    and p_district is null
    and p_municipality is null
    and p_min_value is null
    and p_max_value is null
    and p_from_date is null
    and p_to_date is null
    and p_date_field <> 'closing_date';

  if v_unfiltered then
    select count(*)
    into v_total_count
    from public.contract_base_id_registry r
    where r.tenant_id = p_tenant_id;
  end if;

  return query
  with candidates as materialized (
    select
      c.id,
      c.base_contract_id,
      c.object,
      c.procedure_type,
      c.contract_type,
      c.publication_date,
      c.signing_date,
      c.cpv_main,
      c.contract_price,
      c.base_price,
      c.effective_price,
      c.currency,
      c.status,
      c.contracting_entities,
      c.winners,
      c.execution_deadline_days,
      c.execution_locations
    from public.contracts c
    where c.tenant_id = p_tenant_id
      and c.base_contract_id is not null
      and (p_entity is null or c.contracting_entities::text ilike '%' || p_entity || '%')
      and (p_winner is null or c.winners::text ilike '%' || p_winner || '%')
      and (p_cpv is null or c.cpv_main ilike p_cpv || '%')
      and (coalesce(cardinality(p_procedures), 0) = 0 or c.procedure_type = any(p_procedures))
      and (coalesce(cardinality(p_contract_types), 0) = 0 or c.contract_type = any(p_contract_types))
      and (p_min_value is null or c.contract_price >= p_min_value)
      and (p_max_value is null or c.contract_price <= p_max_value)
      and (
        (p_country is null and p_district is null and p_municipality is null)
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(c.execution_locations, '[]'::jsonb)) as loc(value)
          where (p_country is null or btrim(split_part(loc.value, ',', 1)) = p_country)
            and (p_district is null or btrim(split_part(loc.value, ',', 2)) = p_district)
            and (
              p_municipality is null
              or btrim(regexp_replace(loc.value, '^[^,]*,[^,]*,', '')) = p_municipality
            )
        )
      )
      and (
        p_date_field <> 'closing_date'
        or (c.signing_date is not null and c.execution_deadline_days > 0)
      )
      and (
        p_from_date is null or
        case p_date_field
          when 'publication_date' then c.publication_date
          when 'signing_date' then c.signing_date
          when 'closing_date' then c.signing_date + c.execution_deadline_days
        end >= p_from_date
      )
      and (
        p_to_date is null or
        case p_date_field
          when 'publication_date' then c.publication_date
          when 'signing_date' then c.signing_date
          when 'closing_date' then c.signing_date + c.execution_deadline_days
        end <= p_to_date
      )
      and not exists (
        select 1
        from public.contracts newer
        where newer.tenant_id = c.tenant_id
          and newer.base_contract_id = c.base_contract_id
          and (
            newer.updated_at > c.updated_at
            or (newer.updated_at is not distinct from c.updated_at and newer.id > c.id)
            or (c.updated_at is null and newer.updated_at is not null)
          )
      )
    order by
      case when p_sort = 'signing_date' then c.signing_date end desc nulls last,
      case when p_sort = 'publication_date' then c.publication_date end desc nulls last,
      case when p_sort = 'value_desc' then c.contract_price end desc nulls last,
      case when p_sort = 'value_asc' then c.contract_price end asc nulls last,
      c.publication_date desc nulls last,
      c.base_contract_id desc,
      c.id desc
    offset v_offset
    limit v_limit + 1
  ),
  numbered as (
    select
      row_number() over (
        order by
          case when p_sort = 'signing_date' then candidates.signing_date end desc nulls last,
          case when p_sort = 'publication_date' then candidates.publication_date end desc nulls last,
          case when p_sort = 'value_desc' then candidates.contract_price end desc nulls last,
          case when p_sort = 'value_asc' then candidates.contract_price end asc nulls last,
          candidates.publication_date desc nulls last,
          candidates.base_contract_id desc,
          candidates.id desc
      ) as page_ordinal,
      candidates.*
    from candidates
  ),
  page_rows as (
    select *
    from numbered
    where page_ordinal <= v_limit
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(page_rows) - 'page_ordinal' order by page_ordinal),
      '[]'::jsonb
    ),
    v_total_count,
    (select count(*) > v_limit from candidates)
  from page_rows;
end;
$$;

revoke execute on function public.search_public_contract_pages(uuid,text,text,text,text[],text[],text,text,text,numeric,numeric,date,date,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.search_public_contract_pages(uuid,text,text,text,text[],text[],text,text,text,numeric,numeric,date,date,text,text,integer,integer)
  to service_role;

commit;
