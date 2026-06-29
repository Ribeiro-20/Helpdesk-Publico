alter table tenants
  add column if not exists system_alert_email text null;