-- Supabase CLI 2.81.3 executes each migration in a transaction, so this
-- deliberately uses regular CREATE INDEX. On failure PostgreSQL rolls back the
-- index atomically, and the missing IF NOT EXISTS makes mismatched/partial
-- operator-created state fail closed instead of being silently accepted.
set lock_timeout = '5s';
set statement_timeout = '15min';

create index idx_contracts_tenant_effective_signing
  on public.contracts (
    tenant_id,
    (coalesce(signing_date, publication_date)) desc nulls last,
    publication_date desc nulls last,
    id desc
  );

reset statement_timeout;
reset lock_timeout;
