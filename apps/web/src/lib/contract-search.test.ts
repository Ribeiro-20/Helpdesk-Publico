import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { throwIfContractQueryError } from "./contract-search";

test("contract query errors are never rendered as zero contracts", () => {
  assert.throws(
    () => throwIfContractQueryError({ message: "canceling statement due to statement timeout" }),
    /Não foi possível carregar os contratos: canceling statement due to statement timeout/,
  );
  assert.doesNotThrow(() => throwIfContractQueryError(null));
});

test("contract search migration caches tenant totals and enforces caller tenancy", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const sql = fs.readFileSync(
    path.resolve(testDirectory, "../../../../supabase/migrations/20260818130000_contract_search_performance_security.sql"),
    "utf8",
  );

  assert.match(sql, /create table[^;]*contract_tenant_counts/is);
  assert.match(sql, /create trigger[^;]*contracts_tenant_count/is);
  assert.match(sql, /current_tenant_id\(\)/i);
  assert.match(sql, /p_tenant_id\s+is\s+distinct\s+from\s+v_tenant_id/i);
  assert.match(sql, /revoke execute on function public\.search_contracts[\s\S]*from public, anon/i);
  assert.match(sql, /grant execute on function public\.search_contracts[\s\S]*to authenticated/i);
  assert.match(sql, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(sql, /drop policy if exists "Permitir leitura total de contratos"/i);
  assert.match(sql, /create or replace function public\.search_contracts_v2/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /returns table\(rows jsonb, total_count bigint, has_more boolean\)/i);
  assert.match(sql, /revoke all on table public\.contracts from anon/i);
  assert.match(sql, /lock table public\.contracts in share row exclusive mode/i);
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
  assert.match(sql, /alter table public\.contracts enable row level security/i);
  assert.match(sql, /create policy contracts_read_own_tenant[\s\S]*tenant_id = public\.current_tenant_id\(\)/i);
  assert.doesNotMatch(sql, /request\.jwt\.claim\.role/i);
  assert.match(sql, /jsonb_agg\([^;]*order by page_ordinal\)/i);
  assert.match(sql, /from \(select \* from filtered order by page_ordinal limit v_limit\) page_rows/i);
});

test("contracts page checks the RPC error before reading data", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(
    path.resolve(testDirectory, "../app/(dashboard)/contracts/page.tsx"),
    "utf8",
  );
  assert.match(source, /data:\s*rpcResult,\s*error:\s*rpcError/);
  assert.match(source, /throwIfContractQueryError\(rpcError\)/);
  assert.match(source, /rpc\("search_contracts_v2"/);
  assert.doesNotMatch(source, /p_tenant_id:/);
  assert.match(source, /has_more:\s*boolean/);
});

test("public contracts use a service-only deduplicated search", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(testDirectory, "../../../..");
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260820140000_public_contract_search_p0.sql"),
    "utf8",
  );
  const page = fs.readFileSync(
    path.join(root, "apps/web/src/app/mp/contratos-publicos/page.tsx"),
    "utf8",
  );

  assert.match(migration, /create or replace function public\.search_public_contracts/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /auth\.role\(\)\s*(?:<>|!=)\s*'service_role'/i);
  assert.match(migration, /distinct on\s*\(c\.base_contract_id\)/i);
  assert.match(migration, /create table if not exists public\.contract_base_id_registry/i);
  assert.match(migration, /primary key\s*\(tenant_id,\s*base_contract_id\)/i);
  assert.match(migration, /create trigger trg_claim_contract_base_id/i);
  assert.match(migration, /errcode\s*=\s*'23505'/i);
  assert.match(migration, /jsonb_array_elements_text/i);
  assert.match(migration, /when 'closing_date' then c\.signing_date \+ c\.execution_deadline_days/i);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migration, /alter table public\.contract_base_id_registry enable row level security/i);
  assert.match(migration, /before insert or update of tenant_id, base_contract_id/i);
  assert.match(migration, /tenant_id and base_contract_id are immutable/i);
  assert.match(page, /rpc\("search_public_contracts"/);
  assert.doesNotMatch(page, /\.limit\(50000\)/);
  assert.doesNotMatch(page, /extrasById/);
  assert.match(page, /countryFilter\.trim\(\)/);
  assert.match(page, /resolvedPage !== page/);
  assert.match(page, /p_country:/);
  assert.match(page, /p_district:/);
  assert.match(page, /p_municipality:/);
  assert.match(page, /rpcResponse\.error/);
  assert.match(page, /queryError=/);
});

test("public contract search avoids auth refreshes and wide canonical materialization", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(testDirectory, "../../../..");
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260905172000_public_contract_search_performance.sql"),
    "utf8",
  );
  const page = fs.readFileSync(
    path.join(root, "apps/web/src/app/mp/contratos-publicos/page.tsx"),
    "utf8",
  );

  assert.doesNotMatch(page, /createAdminClient,\s*createClient/);
  assert.doesNotMatch(page, /auth\.getUser\(\)/);
  assert.doesNotMatch(page, /from\("app_users"\)/);
  assert.match(page, /from\("tenants"\)/);

  assert.match(migration, /^begin;/i);
  assert.match(migration, /set local lock_timeout\s*=\s*'10s'/i);
  assert.match(migration, /set local statement_timeout\s*=\s*'180s'/i);
  const contractsLockOffset = migration.indexOf("lock table public.contracts in share row exclusive mode;");
  const registryLockOffset = migration.indexOf("lock table public.contract_base_id_registry in share row exclusive mode;");
  const registryAlterOffset = migration.indexOf("alter table public.contract_base_id_registry");
  assert.ok(contractsLockOffset >= 0 && contractsLockOffset < registryLockOffset);
  assert.ok(registryLockOffset < registryAlterOffset);
  assert.match(migration, /create or replace function public\.search_public_contracts/i);
  assert.doesNotMatch(migration, /distinct on\s*\(c\.base_contract_id\)/i);
  assert.doesNotMatch(migration, /canonical\s+as\s+materialized/i);
  assert.match(migration, /not exists\s*\([\s\S]*newer\.updated_at,\s*newer\.id[\s\S]*c\.updated_at,\s*c\.id/i);
  assert.match(migration, /contract_base_id_registry[\s\S]*count\(\*\)/i);
  assert.match(migration, /alter table public\.contract_base_id_registry[\s\S]*add column if not exists reference_count bigint/i);
  assert.match(migration, /set reference_count\s*=\s*counts\.physical_count/i);
  assert.match(migration, /check\s*\(reference_count\s*>=\s*0\)/i);
  assert.match(migration, /create or replace function public\.release_contract_base_ids\(\)/i);
  assert.match(migration, /referencing old table as deleted_contracts[\s\S]*for each statement/i);
  assert.match(migration, /from deleted_contracts[\s\S]*group by tenant_id,\s*base_contract_id[\s\S]*order by tenant_id,\s*base_contract_id/i);
  assert.match(migration, /create trigger trg_release_contract_base_ids[\s\S]*after delete/i);
  assert.match(migration, /create or replace function public\.reset_contract_base_id_registry_after_truncate\(\)/i);
  assert.match(migration, /if exists\s*\(select 1 from public\.contract_base_id_registry\)[\s\S]*delete from public\.contract_base_id_registry/i);
  assert.match(migration, /create trigger trg_reset_contract_base_id_registry_after_truncate[\s\S]*after truncate on public\.contracts/i);
  assert.match(migration, /update public\.contract_base_id_registry[\s\S]*reference_count\s*=\s*reference_count\s*-\s*v_key\.deleted_count[\s\S]*returning reference_count into v_remaining/i);
  assert.match(migration, /delete from public\.contract_base_id_registry[\s\S]*reference_count\s*=\s*0/i);
  assert.match(migration, /set statement_timeout\s*=\s*'5s'/i);
  assert.match(migration, /create index if not exists idx_contracts_tenant_price_desc[\s\S]*contract_price desc nulls last/i);
  assert.match(migration, /create index if not exists idx_contracts_tenant_price_asc[\s\S]*contract_price asc nulls last/i);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  assert.match(migration, /commit;\s*$/i);
});

test("public contracts default to publication date and render distinct empty and error states", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(testDirectory, "../../../..");
  const page = fs.readFileSync(
    path.join(root, "apps/web/src/app/mp/contratos-publicos/page.tsx"),
    "utf8",
  );
  const table = fs.readFileSync(
    path.join(root, "apps/web/src/components/ContractsTable.tsx"),
    "utf8",
  );

  assert.match(page, /:\s*"publication_date";/);
  assert.match(page, /Data de publicação do contrato/);
  assert.match(page, /dateField=\{selectedDateField\}/);
  assert.match(table, /Não foi possível consultar os contratos neste momento/);
  assert.match(table, /Sem contratos a apresentar\. Selecione ou ajuste os filtros/);
  assert.doesNotMatch(table, /Execute a ingestão de contratos no Dashboard/);
  assert.match(table, /dateField:\s*"publication_date"\s*\|\s*"signing_date"\s*\|\s*"closing_date"/);
});
