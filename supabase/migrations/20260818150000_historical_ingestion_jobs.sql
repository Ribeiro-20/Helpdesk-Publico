begin;

create table if not exists public.historical_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('announcements', 'contracts')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  from_date date not null,
  to_date date not null,
  window_days integer not null default 15 check (window_days between 1 and 31),
  current_window integer not null default 0,
  total_windows integer not null,
  fetched_count bigint not null default 0,
  inserted_count bigint not null default 0,
  updated_count bigint not null default 0,
  skipped_count bigint not null default 0,
  last_result jsonb,
  last_error text,
  public_error text,
  worker_id uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_date <= to_date),
  check (total_windows > 0),
  check (current_window between 0 and total_windows),
  check (fetched_count >= 0 and inserted_count >= 0 and updated_count >= 0 and skipped_count >= 0)
);

create unique index if not exists historical_ingestion_jobs_one_active
  on public.historical_ingestion_jobs (tenant_id, kind)
  where status in ('queued', 'running');
create index if not exists historical_ingestion_jobs_queue
  on public.historical_ingestion_jobs (status, lease_expires_at, created_at);

alter table public.historical_ingestion_jobs enable row level security;
revoke all on table public.historical_ingestion_jobs from public, anon, authenticated;
grant select (
  id, tenant_id, kind, status, from_date, to_date, current_window, total_windows,
  fetched_count, inserted_count, updated_count, skipped_count, public_error,
  started_at, finished_at, created_at, updated_at
) on public.historical_ingestion_jobs to authenticated;
grant all on table public.historical_ingestion_jobs to service_role;

drop policy if exists historical_ingestion_jobs_admin_select on public.historical_ingestion_jobs;
create policy historical_ingestion_jobs_admin_select
  on public.historical_ingestion_jobs for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.app_users u
      where u.id = auth.uid()
        and u.tenant_id = historical_ingestion_jobs.tenant_id
        and u.role = 'admin'
    )
  );

create or replace function public.enqueue_historical_ingestion(
  p_kind text,
  p_from_date date,
  p_to_date date,
  p_window_days integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := public.current_tenant_id();
  v_total_windows integer;
  v_job public.historical_ingestion_jobs%rowtype;
begin
  if v_user_id is null or v_tenant_id is null or not exists (
    select 1 from public.app_users u
    where u.id = v_user_id and u.tenant_id = v_tenant_id and u.role = 'admin'
  ) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('announcements', 'contracts') then
    raise exception 'invalid ingestion kind' using errcode = '22023';
  end if;
  if p_from_date is null or p_to_date is null or p_from_date > p_to_date then
    raise exception 'invalid ingestion range' using errcode = '22023';
  end if;
  if p_window_days is null or p_window_days not between 1 and 31 then
    raise exception 'invalid window size' using errcode = '22023';
  end if;

  if p_kind = 'contracts' then
    v_total_windows := extract(year from p_to_date)::integer - extract(year from p_from_date)::integer + 1;
  else
    v_total_windows := ((p_to_date - p_from_date) / p_window_days) + 1;
  end if;
  begin
    insert into public.historical_ingestion_jobs (
      tenant_id, requested_by, kind, from_date, to_date, window_days, total_windows
    ) values (
      v_tenant_id, v_user_id, p_kind, p_from_date, p_to_date, p_window_days, v_total_windows
    ) returning * into v_job;
  exception when unique_violation then
    select * into v_job
      from public.historical_ingestion_jobs
     where tenant_id = v_tenant_id and kind = p_kind and status in ('queued', 'running')
     order by created_at desc limit 1;
  end;
  return to_jsonb(v_job) - array['requested_by','last_result','last_error','worker_id','lease_expires_at'];
end;
$$;
revoke execute on function public.enqueue_historical_ingestion(text,date,date,integer) from public, anon;
grant execute on function public.enqueue_historical_ingestion(text,date,date,integer) to authenticated;

create or replace function public.resume_historical_ingestion(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := public.current_tenant_id();
  v_job public.historical_ingestion_jobs%rowtype;
begin
  if v_user_id is null or v_tenant_id is null or not exists (
    select 1 from public.app_users u
    where u.id = v_user_id and u.tenant_id = v_tenant_id and u.role = 'admin'
  ) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  update public.historical_ingestion_jobs
     set status = 'queued', worker_id = null, lease_expires_at = null,
         last_error = null, public_error = null, finished_at = null, updated_at = now()
   where id = p_job_id and tenant_id = v_tenant_id and status = 'failed'
   returning * into v_job;
  if v_job.id is null then
    raise exception 'failed job not found' using errcode = 'P0002';
  end if;
  return to_jsonb(v_job) - array['requested_by','last_result','last_error','worker_id','lease_expires_at'];
end;
$$;
revoke execute on function public.resume_historical_ingestion(uuid) from public, anon;
grant execute on function public.resume_historical_ingestion(uuid) to authenticated;

create or replace function public.claim_historical_ingestion_job(
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns setof public.historical_ingestion_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or p_lease_seconds is null or p_lease_seconds not between 60 and 900 then
    raise exception 'invalid worker lease' using errcode = '22023';
  end if;
  return query
  with candidate as (
    select j.id
      from public.historical_ingestion_jobs j
     where j.status = 'queued'
        or (j.status = 'running' and (j.lease_expires_at is null or j.lease_expires_at < now()))
     order by j.created_at
     for update skip locked
     limit 1
  )
  update public.historical_ingestion_jobs j
     set status = 'running', worker_id = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         started_at = coalesce(j.started_at, now()), last_error = null,
         public_error = null, updated_at = now()
    from candidate
   where j.id = candidate.id
  returning j.*;
end;
$$;
revoke execute on function public.claim_historical_ingestion_job(uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_historical_ingestion_job(uuid,integer) to service_role;

commit;
