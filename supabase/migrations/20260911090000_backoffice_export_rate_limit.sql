begin;

create table if not exists public.backoffice_export_rate_limits (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 4),
  primary key (tenant_id, user_id)
);

alter table public.backoffice_export_rate_limits enable row level security;
revoke all on table public.backoffice_export_rate_limits from public, anon, authenticated;
grant all on table public.backoffice_export_rate_limits to service_role;

create or replace function public.consume_backoffice_export_rate_limit()
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := public.current_tenant_id();
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if v_user_id is null or v_tenant_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.backoffice_export_rate_limits as limits (
    tenant_id,
    user_id,
    window_started_at,
    request_count
  )
  values (v_tenant_id, v_user_id, v_now, 1)
  on conflict (tenant_id, user_id) do update
  set window_started_at = case
        when limits.window_started_at <= v_now - interval '60 seconds' then v_now
        else limits.window_started_at
      end,
      request_count = case
        when limits.window_started_at <= v_now - interval '60 seconds' then 1
        else least(limits.request_count + 1, 4)
      end
  returning window_started_at, request_count
    into v_window_started_at, v_request_count;

  allowed := v_request_count <= 3;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (v_window_started_at + interval '60 seconds' - v_now)))::integer
    )
  end;
  return next;
end;
$$;

revoke execute on function public.consume_backoffice_export_rate_limit() from public, anon, service_role;
grant execute on function public.consume_backoffice_export_rate_limit() to authenticated;

comment on function public.consume_backoffice_export_rate_limit() is
  'Atomically permits at most three backoffice CSV exports per authenticated tenant user per minute.';

commit;
