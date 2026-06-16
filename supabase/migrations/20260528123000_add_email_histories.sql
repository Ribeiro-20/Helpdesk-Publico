-- Adicionar tabela para armazenar histórico de envios de emails

create table if not exists email_histories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  notification_id uuid null references notifications(id) on delete set null,
  subject text null,
  html text null,
  text text null,
  payload jsonb null,
  status text null,
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists eh_tenant_idx on email_histories(tenant_id);
create index if not exists eh_notification_idx on email_histories(notification_id);

alter table email_histories enable row level security;

create policy eh_read on email_histories
for select using (tenant_id = current_tenant_id());

create policy eh_insert on email_histories
for insert with check (tenant_id = current_tenant_id());
