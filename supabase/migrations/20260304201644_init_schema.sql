-- Enable extensions
create extension if not exists pgcrypto;

-- Tenants (multi-tenant)
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- App users mapped to auth.users
create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  role text not null default 'operator' check (role in ('admin','operator','viewer')),
  created_at timestamptz not null default now()
);

-- Clients
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  email text not null,
  is_active boolean not null default true,
  notify_mode text not null default 'instant' check (notify_mode in ('instant','daily_digest','weekly_digest')),
  max_emails_per_day int not null default 20,
  created_at timestamptz not null default now()
);

create index if not exists clients_tenant_idx on clients(tenant_id);

-- Client CPV rules
create table if not exists client_cpv_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  pattern text not null,
  match_type text not null check (match_type in ('EXACT','PREFIX')),
  is_exclusion boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ccr_tenant_client_idx on client_cpv_rules(tenant_id, client_id);
create index if not exists ccr_tenant_pattern_idx on client_cpv_rules(tenant_id, pattern);

-- Announcements
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null default 'BASE_API',
  base_announcement_id text null,
  dr_announcement_no text null,
  publication_date date not null,
  title text not null,
  description text null,
  entity_name text null,
  entity_nif text null,
  procedure_type text null,
  act_type text null,
  contract_type text null,
  base_price numeric(14,2) null,
  currency text not null default 'EUR',
  cpv_main text null,
  cpv_list jsonb not null default '[]'::jsonb,
  proposal_deadline_days int null,
  proposal_deadline_at timestamptz null,
  detail_url text null,
  raw_payload jsonb not null,
  raw_hash text not null,
  status text not null default 'active' check (status in ('active','cancelled','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedupe indexes
create unique index if not exists ann_unique_base_id
on announcements(tenant_id, base_announcement_id)
where base_announcement_id is not null;

create unique index if not exists ann_unique_dr_no
on announcements(tenant_id, dr_announcement_no)
where dr_announcement_no is not null;

create index if not exists ann_tenant_pubdate_idx on announcements(tenant_id, publication_date desc);
create index if not exists ann_tenant_cpv_main_idx on announcements(tenant_id, cpv_main);
create index if not exists ann_tenant_raw_hash_idx on announcements(tenant_id, raw_hash);
create index if not exists ann_cpv_list_gin_idx on announcements using gin (cpv_list);

-- Version history
create table if not exists announcement_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  announcement_id uuid not null references announcements(id) on delete cascade,
  raw_payload jsonb not null,
  raw_hash text not null,
  changed_at timestamptz not null default now(),
  change_summary jsonb not null default '{}'::jsonb
);

create index if not exists av_tenant_ann_changed_idx
on announcement_versions(tenant_id, announcement_id, changed_at desc);

-- Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  announcement_id uuid not null references announcements(id) on delete cascade,
  channel text not null default 'email',
  status text not null default 'PENDING' check (status in ('PENDING','SENT','FAILED','SKIPPED','RATE_LIMITED')),
  sent_at timestamptz null,
  error text null,
  created_at timestamptz not null default now()
);

create unique index if not exists notif_unique_pair
on notifications(tenant_id, client_id, announcement_id);

create index if not exists notif_tenant_status_idx
on notifications(tenant_id, status);

-- updated_at auto-update
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_announcements_updated_at on announcements;
create trigger trg_announcements_updated_at
before update on announcements
for each row execute function set_updated_at();

-- RLS
alter table tenants enable row level security;
alter table app_users enable row level security;
alter table clients enable row level security;
alter table client_cpv_rules enable row level security;
alter table announcements enable row level security;
alter table announcement_versions enable row level security;
alter table notifications enable row level security;

-- Helper: current tenant_id from app_users (SECURITY DEFINER bypasses RLS to avoid recursion)
create or replace function current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from app_users where id = auth.uid()
$$;

-- Helper: role (SECURITY DEFINER bypasses RLS to avoid recursion)
create or replace function current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from app_users where id = auth.uid()
$$;

-- Policies: app_users
create policy app_users_read_own on app_users
for select using (id = auth.uid());

create policy app_users_admin_manage on app_users
for all using (tenant_id = current_tenant_id() and current_role_name() = 'admin')
with check (tenant_id = current_tenant_id() and current_role_name() = 'admin');

-- Tenants
create policy tenants_read on tenants
for select using (id = current_tenant_id());

-- Clients
create policy clients_read on clients
for select using (tenant_id = current_tenant_id());

create policy clients_write on clients
for insert with check (tenant_id = current_tenant_id() and current_role_name() in ('admin','operator'));

create policy clients_update on clients
for update using (tenant_id = current_tenant_id() and current_role_name() in ('admin','operator'))
with check (tenant_id = current_tenant_id() and current_role_name() in ('admin','operator'));

create policy clients_delete on clients
for delete using (tenant_id = current_tenant_id() and current_role_name() = 'admin');

-- CPV rules
create policy ccr_read on client_cpv_rules
for select using (tenant_id = current_tenant_id());

create policy ccr_write on client_cpv_rules
for insert with check (tenant_id = current_tenant_id() and current_role_name() in ('admin','operator'));

create policy ccr_update on client_cpv_rules
for update using (tenant_id = current_tenant_id() and current_role_name() in ('admin','operator'))
with check (tenant_id = current_tenant_id() and current_role_name() in ('admin','operator'));

create policy ccr_delete on client_cpv_rules
for delete using (tenant_id = current_tenant_id() and current_role_name() = 'admin');

-- Announcements + versions (read for everyone in tenant)
create policy ann_read on announcements
for select using (tenant_id = current_tenant_id());

create policy av_read on announcement_versions
for select using (tenant_id = current_tenant_id());

-- Notifications
create policy notif_read on notifications
for select using (tenant_id = current_tenant_id());
