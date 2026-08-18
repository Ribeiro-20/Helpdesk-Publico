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
