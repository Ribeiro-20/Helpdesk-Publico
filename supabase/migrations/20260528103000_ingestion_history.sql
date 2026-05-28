-- ============================================================================
-- 6. INGESTION_HISTORY (Histórico de ingestão por utilizador)
--    Guarda as execuções manuais de ingestão no Supabase para persistência
--    entre sessões e dispositivos, isoladas por tenant e utilizador.
-- ============================================================================

create table if not exists ingestion_history (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  category    text not null check (category in ('announcements','contracts','extraction','processing','other')),
  status      text not null check (status in ('success','error')),
  range       jsonb not null default '{}'::jsonb,
  steps       jsonb not null default '[]'::jsonb,
  note        text null,
  created_at  timestamptz not null default now()
);

create index if not exists ingestion_history_tenant_user_created_idx
  on ingestion_history(tenant_id, user_id, created_at desc);

create index if not exists ingestion_history_tenant_category_idx
  on ingestion_history(tenant_id, category);

alter table ingestion_history enable row level security;

create policy ingestion_history_read_own on ingestion_history
  for select using (tenant_id = current_tenant_id() and user_id = auth.uid());

create policy ingestion_history_insert_own on ingestion_history
  for insert with check (tenant_id = current_tenant_id() and user_id = auth.uid());