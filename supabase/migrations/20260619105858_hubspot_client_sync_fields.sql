alter table clients
  add column if not exists hubspot_contact_id text,
  add column if not exists hubspot_company_id text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists hubspot_service_value text,
  add column if not exists hubspot_list_id text,
  add column if not exists hubspot_added_to_list_at timestamptz,
  add column if not exists hubspot_created_at timestamptz,
  add column if not exists hubspot_updated_at timestamptz,
  add column if not exists hubspot_synced_at timestamptz;

create unique index if not exists clients_tenant_hubspot_contact_idx
  on clients(tenant_id, hubspot_contact_id)
  where hubspot_contact_id is not null;

alter table client_cpv_rules
  add column if not exists source text not null default 'manual';

alter table client_cpv_rules
  drop constraint if exists client_cpv_rules_source_check;

alter table client_cpv_rules
  add constraint client_cpv_rules_source_check
  check (source in ('manual', 'hubspot'));

create unique index if not exists ccr_hubspot_unique_idx
  on client_cpv_rules(tenant_id, client_id, pattern, match_type, is_exclusion)
  where source = 'hubspot';
