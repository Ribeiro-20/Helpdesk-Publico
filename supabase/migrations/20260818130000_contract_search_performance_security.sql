begin;

create table if not exists public.contract_tenant_counts (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  total_count bigint not null default 0 check (total_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.contract_tenant_counts enable row level security;

revoke all on table public.contract_tenant_counts from public, anon;
grant select on table public.contract_tenant_counts to authenticated;
grant all on table public.contract_tenant_counts to service_role;

drop policy if exists contract_tenant_counts_read_own on public.contract_tenant_counts;
create policy contract_tenant_counts_read_own
  on public.contract_tenant_counts
  for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

-- Supabase migrations run transactionally. Hold this lock through the
-- backfill and trigger creation so no committed write can escape the cache.
lock table public.contracts in share row exclusive mode;

insert into public.contract_tenant_counts (tenant_id, total_count, updated_at)
select tenant_id, count(*), now()
from public.contracts
group by tenant_id
on conflict (tenant_id) do update
set total_count = excluded.total_count,
    updated_at = excluded.updated_at;

create or replace function public.maintain_contract_tenant_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.contract_tenant_counts (tenant_id, total_count, updated_at)
    values (new.tenant_id, 1, now())
    on conflict (tenant_id) do update
      set total_count = public.contract_tenant_counts.total_count + 1,
          updated_at = now();
    return new;
  elsif tg_op = 'DELETE' then
    update public.contract_tenant_counts
       set total_count = greatest(total_count - 1, 0),
           updated_at = now()
     where tenant_id = old.tenant_id;
    return old;
  elsif new.tenant_id is distinct from old.tenant_id then
    update public.contract_tenant_counts
       set total_count = greatest(total_count - 1, 0),
           updated_at = now()
     where tenant_id = old.tenant_id;
    insert into public.contract_tenant_counts (tenant_id, total_count, updated_at)
    values (new.tenant_id, 1, now())
    on conflict (tenant_id) do update
      set total_count = public.contract_tenant_counts.total_count + 1,
          updated_at = now();
  end if;
  return new;
end;
$$;

revoke execute on function public.maintain_contract_tenant_count() from public, anon, authenticated, service_role;

drop trigger if exists contracts_tenant_count on public.contracts;
create trigger contracts_tenant_count
after insert or delete or update of tenant_id on public.contracts
for each row execute function public.maintain_contract_tenant_count();

create or replace function public.search_contracts(
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
  p_offset integer default 0,
  p_limit integer default 20
)
returns table(rows jsonb, total_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
declare
  v_count bigint;
  v_rows jsonb;
  v_tenant_id uuid;

  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000000);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  v_tenant_id := public.current_tenant_id();
  if auth.uid() is null or v_tenant_id is null or p_tenant_id is distinct from v_tenant_id then
    raise exception 'tenant access denied' using errcode = '42501';
  end if;

  if p_entity_nif is null
     and p_winner_nif is null
     and p_cpv is null
     and p_procedure is null
     and p_min_value is null
     and p_max_value is null
     and p_from_date is null
     and p_to_date is null then
    select c.total_count into v_count
      from public.contract_tenant_counts c
     where c.tenant_id = v_tenant_id;
    v_count := coalesce(v_count, 0);
  else
    select count(*) into v_count
      from public.contracts c
     where c.tenant_id = v_tenant_id
       and (p_entity_nif is null or c.contracting_entities::text ilike '%' || p_entity_nif || '%')
       and (p_winner_nif is null or c.winners::text ilike '%' || p_winner_nif || '%')
       and (p_cpv is null or c.cpv_main ilike '%' || p_cpv || '%')
       and (p_procedure is null or c.procedure_type ilike '%' || p_procedure || '%')
       and (p_min_value is null or c.contract_price >= p_min_value)
       and (p_max_value is null or c.contract_price <= p_max_value)
       and (p_from_date is null or coalesce(c.signing_date, c.publication_date) >= p_from_date)
       and (p_to_date is null or coalesce(c.signing_date, c.publication_date) <= p_to_date);
  end if;

  select coalesce(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb) into v_rows
  from (
    select c.id, c.object, c.procedure_type, c.publication_date, c.signing_date,
           c.cpv_main, c.contract_price, c.base_price, c.effective_price,
           c.currency, c.status, c.contracting_entities, c.winners
      from public.contracts c
     where c.tenant_id = v_tenant_id
       and (p_entity_nif is null or c.contracting_entities::text ilike '%' || p_entity_nif || '%')
       and (p_winner_nif is null or c.winners::text ilike '%' || p_winner_nif || '%')
       and (p_cpv is null or c.cpv_main ilike '%' || p_cpv || '%')
       and (p_procedure is null or c.procedure_type ilike '%' || p_procedure || '%')
       and (p_min_value is null or c.contract_price >= p_min_value)
       and (p_max_value is null or c.contract_price <= p_max_value)
       and (p_from_date is null or coalesce(c.signing_date, c.publication_date) >= p_from_date)
       and (p_to_date is null or coalesce(c.signing_date, c.publication_date) <= p_to_date)
     order by
       case when p_sort = 'signing_date' then coalesce(c.signing_date, c.publication_date) end desc nulls last,
       case when p_sort = 'publication_date' then c.publication_date end desc nulls last,
       case when p_sort = 'value_desc' then c.contract_price end desc nulls last,
       case when p_sort = 'value_asc' then c.contract_price end asc nulls last,
       c.publication_date desc nulls last,
       c.id desc
     offset v_offset
     limit v_limit
  ) sub;

  return query select v_rows, v_count;
end;
$$;

revoke execute on function public.search_contracts(uuid,text,text,text,text,numeric,numeric,date,date,text,integer,integer) from public, anon;
grant execute on function public.search_contracts(uuid,text,text,text,text,numeric,numeric,date,date,text,integer,integer) to authenticated;

-- Remove a legacy permissive policy and excessive table grants before using
-- SECURITY INVOKER for the v2 RPC.
drop policy if exists "Permitir leitura total de contratos" on public.contracts;
alter table public.contracts enable row level security;
drop policy if exists contracts_read_own_tenant on public.contracts;
create policy contracts_read_own_tenant
on public.contracts for select to authenticated
using (tenant_id = public.current_tenant_id());
revoke all on table public.contracts from anon;
revoke insert, update, delete, truncate, references, trigger on table public.contracts from authenticated;
grant select on table public.contracts to authenticated;
grant all on table public.contracts to service_role;

create or replace function public.search_contracts_v2(
  p_entity text default null,
  p_winner text default null,
  p_cpv text default null,
  p_procedure text default null,
  p_min_value numeric default null,
  p_max_value numeric default null,
  p_from_date date default null,
  p_to_date date default null,
  p_sort text default 'signing_date',
  p_offset integer default 0,
  p_limit integer default 20
)
returns table(rows jsonb, total_count bigint, has_more boolean)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_total_count bigint := null;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000000);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_has_filters boolean :=
    p_entity is not null or p_winner is not null or p_cpv is not null or
    p_procedure is not null or p_min_value is not null or p_max_value is not null or
    p_from_date is not null or p_to_date is not null;
begin
  if auth.uid() is null or v_tenant_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not v_has_filters then
    select c.total_count into v_total_count
      from public.contract_tenant_counts c
     where c.tenant_id = v_tenant_id;
    v_total_count := coalesce(v_total_count, 0);
  end if;

  with filtered as materialized (
    select c.id, c.object, c.procedure_type, c.publication_date, c.signing_date,
           c.cpv_main, c.contract_price, c.base_price, c.effective_price,
           c.currency, c.status, c.contracting_entities, c.winners,
           row_number() over (order by
             case when p_sort = 'signing_date' then coalesce(c.signing_date, c.publication_date) end desc nulls last,
             case when p_sort = 'publication_date' then c.publication_date end desc nulls last,
             case when p_sort = 'value_desc' then c.contract_price end desc nulls last,
             case when p_sort = 'value_asc' then c.contract_price end asc nulls last,
             c.publication_date desc nulls last,
             c.id desc
           ) as page_ordinal
      from public.contracts c
     where c.tenant_id = v_tenant_id
       and (
         p_entity is null or
         case when p_entity ~ '^\d{9}$'
           then c.contracting_entities @> jsonb_build_array(jsonb_build_object('nif', p_entity))
           else c.contracting_entities::text ilike '%' || p_entity || '%'
         end
       )
       and (
         p_winner is null or
         case when p_winner ~ '^\d{9}$'
           then c.winners @> jsonb_build_array(jsonb_build_object('nif', p_winner))
           else c.winners::text ilike '%' || p_winner || '%'
         end
       )
       and (p_cpv is null or c.cpv_main like p_cpv || '%')
       and (p_procedure is null or c.procedure_type ilike '%' || p_procedure || '%')
       and (p_min_value is null or c.contract_price >= p_min_value)
       and (p_max_value is null or c.contract_price <= p_max_value)
       and (p_from_date is null or coalesce(c.signing_date, c.publication_date) >= p_from_date)
       and (p_to_date is null or coalesce(c.signing_date, c.publication_date) <= p_to_date)
     order by
       case when p_sort = 'signing_date' then coalesce(c.signing_date, c.publication_date) end desc nulls last,
       case when p_sort = 'publication_date' then c.publication_date end desc nulls last,
       case when p_sort = 'value_desc' then c.contract_price end desc nulls last,
       case when p_sort = 'value_asc' then c.contract_price end asc nulls last,
       c.publication_date desc nulls last,
       c.id desc
     offset v_offset
     limit v_limit + 1
  )
  select
    coalesce(jsonb_agg(to_jsonb(page_rows) - 'page_ordinal' order by page_ordinal), '[]'::jsonb),
    (select count(*) > v_limit from filtered)
  into v_rows, v_has_more
  from (select * from filtered order by page_ordinal limit v_limit) page_rows;

  return query select v_rows, v_total_count, v_has_more;
end;
$$;

revoke execute on function public.search_contracts_v2(text,text,text,text,numeric,numeric,date,date,text,integer,integer) from public, anon;
grant execute on function public.search_contracts_v2(text,text,text,text,numeric,numeric,date,date,text,integer,integer) to authenticated;

create or replace function public.contracts_by_entity_nif(p_tenant_id uuid, p_nif text, p_limit integer default 20)
returns setof public.contracts
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select c.* from public.contracts c
   where auth.uid() is not null
     and p_tenant_id = public.current_tenant_id()
     and c.tenant_id = public.current_tenant_id()
     and c.contracting_entities @> jsonb_build_array(jsonb_build_object('nif', p_nif))
   order by c.signing_date desc nulls last, c.publication_date desc nulls last, c.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create or replace function public.contracts_by_winner_nif(p_tenant_id uuid, p_nif text, p_limit integer default 20)
returns setof public.contracts
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select c.* from public.contracts c
   where auth.uid() is not null
     and p_tenant_id = public.current_tenant_id()
     and c.tenant_id = public.current_tenant_id()
     and c.winners @> jsonb_build_array(jsonb_build_object('nif', p_nif))
   order by c.signing_date desc nulls last, c.publication_date desc nulls last, c.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create or replace function public.count_contracts_by_entity_nif(p_tenant_id uuid, p_nif text)
returns bigint
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select count(*) from public.contracts c
   where auth.uid() is not null
     and p_tenant_id = public.current_tenant_id()
     and c.tenant_id = public.current_tenant_id()
     and c.contracting_entities @> jsonb_build_array(jsonb_build_object('nif', p_nif));
$$;

create or replace function public.count_contracts_by_winner_nif(p_tenant_id uuid, p_nif text)
returns bigint
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select count(*) from public.contracts c
   where auth.uid() is not null
     and p_tenant_id = public.current_tenant_id()
     and c.tenant_id = public.current_tenant_id()
     and c.winners @> jsonb_build_array(jsonb_build_object('nif', p_nif));
$$;

revoke execute on function public.contracts_by_entity_nif(uuid,text,integer) from public, anon;
revoke execute on function public.contracts_by_winner_nif(uuid,text,integer) from public, anon;
revoke execute on function public.count_contracts_by_entity_nif(uuid,text) from public, anon;
revoke execute on function public.count_contracts_by_winner_nif(uuid,text) from public, anon;
grant execute on function public.contracts_by_entity_nif(uuid,text,integer) to authenticated;
grant execute on function public.contracts_by_winner_nif(uuid,text,integer) to authenticated;
grant execute on function public.count_contracts_by_entity_nif(uuid,text) to authenticated;
grant execute on function public.count_contracts_by_winner_nif(uuid,text) to authenticated;

commit;
