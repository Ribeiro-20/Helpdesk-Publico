alter table clients
  add column if not exists entity_nipc text,
  add column if not exists distrito text,
  add column if not exists pais text,
  add column if not exists position_title text,
  add column if not exists department text,
  add column if not exists classification text[] not null default '{}'::text[],
  add column if not exists subscription_type text;

-- No backfill is performed: new fields will be populated on next update/insert from the app
