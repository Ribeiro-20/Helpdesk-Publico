alter table clients
  add column if not exists notification_regions text[] not null default array['todos']::text[];

update clients
set notification_regions = array['todos']::text[]
where notification_regions is null or array_length(notification_regions, 1) is null;
