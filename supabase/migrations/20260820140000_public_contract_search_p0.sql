begin;

create index if not exists idx_contracts_tenant_base_canonical
  on public.contracts (tenant_id, base_contract_id, updated_at desc, id desc)
  where base_contract_id is not null;

create table if not exists public.contract_base_id_registry (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  base_contract_id text not null,
  registered_at timestamptz not null default now(),
  primary key (tenant_id, base_contract_id)
);

revoke all on table public.contract_base_id_registry from public, anon, authenticated;
alter table public.contract_base_id_registry enable row level security;

insert into public.contract_base_id_registry (tenant_id, base_contract_id)
select distinct c.tenant_id, c.base_contract_id
from public.contracts c
where c.tenant_id is not null
  and c.base_contract_id is not null
on conflict (tenant_id, base_contract_id) do nothing;

create or replace function public.claim_contract_base_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is not distinct from old.tenant_id
       and new.base_contract_id is not distinct from old.base_contract_id then
      return new;
    end if;

    raise exception 'tenant_id and base_contract_id are immutable'
      using errcode = '23514';
  end if;

  if new.base_contract_id is null then
    return new;
  end if;

  insert into public.contract_base_id_registry (tenant_id, base_contract_id)
  values (new.tenant_id, new.base_contract_id)
  on conflict (tenant_id, base_contract_id) do nothing;

  if not found then
    raise exception 'contract BASE identifier already exists for tenant'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke execute on function public.claim_contract_base_id() from public, anon, authenticated;

drop trigger if exists trg_claim_contract_base_id on public.contracts;
create trigger trg_claim_contract_base_id
before insert or update of tenant_id, base_contract_id on public.contracts
for each row
execute function public.claim_contract_base_id();

create or replace function public.search_public_contracts(
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
returns table(rows jsonb, total_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_total_count bigint := 0;
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000000);
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50000);
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_tenant_id is null or not exists (
    select 1 from public.tenants t where t.id = p_tenant_id
  ) then
    raise exception 'invalid tenant' using errcode = '22023';
  end if;

  if p_date_field not in ('publication_date', 'signing_date', 'closing_date') then
    raise exception 'invalid date field' using errcode = '22023';
  end if;

  if p_sort not in ('publication_date', 'signing_date', 'value_desc', 'value_asc') then
    raise exception 'invalid sort field' using errcode = '22023';
  end if;

  if p_min_value is not null and p_max_value is not null and p_min_value > p_max_value then
    raise exception 'minimum value must be before or equal to maximum value' using errcode = '22023';
  end if;

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'from date must be before or equal to to date' using errcode = '22023';
  end if;

  with canonical as materialized (
    select distinct on (c.base_contract_id)
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
    order by c.base_contract_id, c.updated_at desc, c.id desc
  ),
  filtered as materialized (
    select c.*
    from canonical c
    where (p_entity is null or c.contracting_entities::text ilike '%' || p_entity || '%')
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
  ),
  page_rows as (
    select f.*
    from filtered f
    order by
      case when p_sort = 'signing_date' then f.signing_date end desc nulls last,
      case when p_sort = 'publication_date' then f.publication_date end desc nulls last,
      case when p_sort = 'value_desc' then f.contract_price end desc nulls last,
      case when p_sort = 'value_asc' then f.contract_price end asc nulls last,
      f.publication_date desc nulls last,
      f.base_contract_id desc,
      f.id desc
    offset v_offset
    limit v_limit
  )
  select
    coalesce(
      jsonb_agg(
        to_jsonb(p)
        order by
          case when p_sort = 'signing_date' then p.signing_date end desc nulls last,
          case when p_sort = 'publication_date' then p.publication_date end desc nulls last,
          case when p_sort = 'value_desc' then p.contract_price end desc nulls last,
          case when p_sort = 'value_asc' then p.contract_price end asc nulls last,
          p.publication_date desc nulls last,
          p.base_contract_id desc,
          p.id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) from filtered)
  into v_rows, v_total_count
  from page_rows p;

  return query select v_rows, coalesce(v_total_count, 0);
end;
$$;

revoke execute on function public.search_public_contracts(uuid,text,text,text,text[],text[],text,text,text,numeric,numeric,date,date,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.search_public_contracts(uuid,text,text,text,text[],text[],text,text,text,numeric,numeric,date,date,text,text,integer,integer)
  to service_role;

commit;
