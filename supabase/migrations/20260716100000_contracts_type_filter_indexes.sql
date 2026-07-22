-- Indexes to speed up contract_type and procedure_type filters on the market page
-- These support the ilike exact-match OR filters used in market page queries

create index if not exists contracts_tenant_contract_type_idx
  on contracts(tenant_id, contract_type)
  where contract_type is not null;

create index if not exists contracts_tenant_procedure_type_idx
  on contracts(tenant_id, procedure_type)
  where procedure_type is not null;
