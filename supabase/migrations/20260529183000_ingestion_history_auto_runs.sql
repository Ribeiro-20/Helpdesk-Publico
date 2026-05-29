-- Allow automatic cron runs to be stored at tenant level without personal ownership.
-- Manual entries still use the existing per-user RLS policy.

alter table ingestion_history
  alter column user_id drop not null;
