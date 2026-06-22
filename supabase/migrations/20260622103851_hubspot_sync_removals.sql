alter table clients
  add column if not exists hubspot_removed_at timestamptz;

create index if not exists clients_tenant_hubspot_list_idx
  on clients (tenant_id, hubspot_list_id)
  where hubspot_list_id is not null;
