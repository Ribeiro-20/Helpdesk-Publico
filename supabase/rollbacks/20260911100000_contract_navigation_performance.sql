-- Operational rollback for migration 20260911100000.
-- Regular DROP INDEX is transaction-safe with the repository-pinned CLI.
set lock_timeout = '5s';
set statement_timeout = '5min';

drop index if exists public.idx_contracts_tenant_effective_signing;

reset statement_timeout;
reset lock_timeout;
