-- Performance indexes for Mercado page hot paths
-- Safe, non-functional changes.

create index if not exists cpv_stats_tenant_contracts_idx
  on cpv_stats(tenant_id, total_contracts desc);

create index if not exists contracts_tenant_idx
  on contracts(tenant_id);
