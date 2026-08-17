-- Tenant-aware server-side filtering and pagination for notification history.
create or replace function notification_history_search(
  p_from timestamptz,
  p_to timestamptz,
  p_status text default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with tenant_notifications as (
    select n.id, n.created_at, n.sent_at
    from notifications n
    join clients c
      on c.id = n.client_id and c.tenant_id = n.tenant_id
    join announcements a
      on a.id = n.announcement_id and a.tenant_id = n.tenant_id
    where n.tenant_id = current_tenant_id()
      and coalesce(n.sent_at, n.created_at) >= p_from
      and coalesce(n.sent_at, n.created_at) < p_to
      and (nullif(trim(p_status), '') is null or n.status = upper(trim(p_status)))
      and (
        nullif(trim(p_search), '') is null
        or c.name ilike '%' || trim(p_search) || '%'
        or c.email ilike '%' || trim(p_search) || '%'
        or a.title ilike '%' || trim(p_search) || '%'
        or a.description ilike '%' || trim(p_search) || '%'
        or a.raw_payload::text ilike '%' || trim(p_search) || '%'
        or n.error ilike '%' || trim(p_search) || '%'
        or n.status ilike '%' || trim(p_search) || '%'
      )
  ),
  page_rows as (
    select id
    from tenant_notifications
    order by created_at desc, id desc
    limit greatest(1, least(coalesce(p_page_size, 25), 100))
    offset (least(greatest(coalesce(p_page, 1), 1), 10000) - 1)
      * greatest(1, least(coalesce(p_page_size, 25), 100))
  ),
  tenant_minimum as (
    select min(coalesce(n.sent_at, n.created_at)) as min_timestamp
    from notifications n
    where n.tenant_id = current_tenant_id()
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id) from page_rows), '[]'::jsonb),
    'total_count', (select count(*) from tenant_notifications),
    'min_timestamp', (select min_timestamp from tenant_minimum)
  )
$$;

revoke all on function notification_history_search(timestamptz, timestamptz, text, text, integer, integer) from public;
grant execute on function notification_history_search(timestamptz, timestamptz, text, text, integer, integer) to authenticated;
