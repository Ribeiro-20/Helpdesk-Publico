-- Schedule notifications for next business day at 10:00 Europe/Lisbon
-- and allow a PROCESSING intermediate state for atomic claiming.

alter table notifications
  add column if not exists scheduled_for timestamptz;

alter table notifications
  drop constraint if exists notifications_status_check;

alter table notifications
  add constraint notifications_status_check
  check (status in (
    'PENDING',
    'PROCESSING',
    'SENT',
    'FAILED',
    'SKIPPED',
    'RATE_LIMITED'
  ));

with base_dates as (
  select
    id,
    (((coalesce(created_at, now()) at time zone 'Europe/Lisbon')::date) + 1) as next_day
  from notifications
  where scheduled_for is null
),
business_dates as (
  select
    id,
    case extract(isodow from next_day)
      when 6 then next_day + 2
      when 7 then next_day + 1
      else next_day
    end as business_day
  from base_dates
)
update notifications n
set scheduled_for = ((b.business_day::timestamp + time '10:00:00') at time zone 'Europe/Lisbon')
from business_dates b
where n.id = b.id
  and n.scheduled_for is null;

alter table notifications
  alter column scheduled_for set not null;

create index if not exists notif_tenant_status_scheduled_idx
  on notifications (tenant_id, status, scheduled_for);

create index if not exists notif_pending_due_idx
  on notifications (tenant_id, scheduled_for)
  where status = 'PENDING';
