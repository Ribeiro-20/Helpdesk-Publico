begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

-- All writers lock contracts before the registry through the existing claim
-- trigger. Acquire the tables in that same order before changing either one.
lock table public.contracts in share row exclusive mode;
lock table public.contract_base_id_registry in share row exclusive mode;

-- Unfiltered value sorts must not sort the full tenant. These indexes match the
-- deterministic public ordering and keep NULL prices at the end in both modes.
create index if not exists idx_contracts_tenant_price_desc
  on public.contracts (
    tenant_id,
    contract_price desc nulls last,
    publication_date desc nulls last,
    base_contract_id desc,
    id desc
  )
  where base_contract_id is not null;

create index if not exists idx_contracts_tenant_price_asc
  on public.contracts (
    tenant_id,
    contract_price asc nulls last,
    publication_date desc nulls last,
    base_contract_id desc,
    id desc
  )
  where base_contract_id is not null;

alter table public.contract_base_id_registry
  add column if not exists reference_count bigint;

do $$
begin
  if exists (
    select tenant_id, base_contract_id
    from public.contract_base_id_registry
    except
    select tenant_id, base_contract_id
    from public.contracts
    where base_contract_id is not null
  ) or exists (
    select tenant_id, base_contract_id
    from public.contracts
    where base_contract_id is not null
    except
    select tenant_id, base_contract_id
    from public.contract_base_id_registry
  ) then
    raise exception 'contract registry is inconsistent with contracts';
  end if;
end;
$$;

with counts as (
  select tenant_id, base_contract_id, count(*)::bigint as physical_count
  from public.contracts
  where base_contract_id is not null
  group by tenant_id, base_contract_id
)
update public.contract_base_id_registry r
set reference_count = counts.physical_count
from counts
where r.tenant_id = counts.tenant_id
  and r.base_contract_id = counts.base_contract_id;

alter table public.contract_base_id_registry
  alter column reference_count set default 1,
  alter column reference_count set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contract_base_id_registry'::regclass
      and conname = 'contract_base_id_registry_reference_count_check'
  ) then
    alter table public.contract_base_id_registry
      add constraint contract_base_id_registry_reference_count_check
      check (reference_count >= 0);
  end if;
end;
$$;

create or replace function public.release_contract_base_ids()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key record;
  v_remaining bigint;
begin
  -- Aggregate every key touched by this statement and lock registry rows in a
  -- deterministic order. This prevents opposing multi-row DELETE statements
  -- from acquiring registry row locks in opposite orders.
  for v_key in
    select tenant_id, base_contract_id, count(*)::bigint as deleted_count
    from deleted_contracts
    where base_contract_id is not null
    group by tenant_id, base_contract_id
    order by tenant_id, base_contract_id
  loop
    update public.contract_base_id_registry
    set reference_count = reference_count - v_key.deleted_count
    where tenant_id = v_key.tenant_id
      and base_contract_id = v_key.base_contract_id
      and reference_count >= v_key.deleted_count
    returning reference_count into v_remaining;

    if not found then
      -- During ON DELETE CASCADE of a tenant, the registry row may already
      -- have been removed by its own foreign key cascade. Any other missing or
      -- under-counted row is an invariant violation and aborts the statement.
      if exists (select 1 from public.tenants where id = v_key.tenant_id) then
        raise exception 'missing or under-counted contract registry entry during delete'
          using errcode = '23514';
      end if;
      continue;
    end if;

    if v_remaining = 0 then
      delete from public.contract_base_id_registry
      where tenant_id = v_key.tenant_id
        and base_contract_id = v_key.base_contract_id
        and reference_count = 0;
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function public.release_contract_base_ids() from public, anon, authenticated;

drop trigger if exists trg_release_contract_base_id on public.contracts;
drop trigger if exists trg_release_contract_base_ids on public.contracts;
drop function if exists public.release_contract_base_id();
create trigger trg_release_contract_base_ids
after delete on public.contracts
referencing old table as deleted_contracts
for each statement
execute function public.release_contract_base_ids();

create or replace function public.reset_contract_base_id_registry_after_truncate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- If the registry is part of the same TRUNCATE/CASCADE command it is already
  -- empty and must not be touched again (PostgreSQL rejects re-truncating an
  -- active relation). Otherwise clear the ledger transactionally. DELETE is
  -- safe here because contracts is already ACCESS EXCLUSIVE locked.
  if exists (select 1 from public.contract_base_id_registry) then
    delete from public.contract_base_id_registry;
  end if;
  return null;
end;
$$;

revoke execute on function public.reset_contract_base_id_registry_after_truncate()
  from public, anon, authenticated;

drop trigger if exists trg_reset_contract_base_id_registry_after_truncate on public.contracts;
create trigger trg_reset_contract_base_id_registry_after_truncate
after truncate on public.contracts
for each statement
execute function public.reset_contract_base_id_registry_after_truncate();

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
set statement_timeout = '5s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_total_count bigint := 0;
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000000);
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50000);
  v_unfiltered boolean;
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
  else
    select count(*)
    into v_total_count
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
          and (newer.updated_at, newer.id) > (c.updated_at, c.id)
      );
  end if;

  select coalesce(
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
  )
  into v_rows
  from (
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
          and (newer.updated_at, newer.id) > (c.updated_at, c.id)
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
    limit v_limit
  ) p;

  return query select v_rows, coalesce(v_total_count, 0);
end;
$$;

revoke execute on function public.search_public_contracts(uuid,text,text,text,text[],text[],text,text,text,numeric,numeric,date,date,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.search_public_contracts(uuid,text,text,text,text[],text[],text,text,text,numeric,numeric,date,date,text,text,integer,integer)
  to service_role;

commit;
