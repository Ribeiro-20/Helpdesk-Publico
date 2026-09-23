import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadFirstPublicContractPage,
  parsePublicContractEnvelope,
  parsePublicContractPage,
} from "./public-contract-search";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("public market home is static and performs no database work", () => {
  const page = read("apps/web/src/app/mp/page.tsx");

  assert.doesNotMatch(page, /createAdminClient|\.from\(|\.rpc\(/);
  assert.doesNotMatch(page, /force-dynamic|resolveTenantId|getCountByTable|HomeStats/);
  assert.match(page, /export default function HomePage\(\)/);
});

test("filtered public contracts use bounded page-only search", () => {
  const page = read("apps/web/src/app/mp/contratos-publicos/page.tsx");
  const table = read("apps/web/src/components/ContractsTable.tsx");
  const search = read("apps/web/src/lib/public-contract-search.ts");
  const migrationPath = path.join(
    root,
    "supabase/migrations/20260917160000_public_contract_page_search.sql",
  );
  const rollbackPath = path.join(
    root,
    "supabase/rollbacks/20260917160000_public_contract_page_search.sql",
  );

  assert.equal(fs.existsSync(migrationPath), true);
  assert.equal(fs.existsSync(rollbackPath), true);
  const migration = fs.readFileSync(migrationPath, "utf8");
  const rollback = fs.readFileSync(rollbackPath, "utf8");

  assert.match(migration, /create or replace function public\.search_public_contract_pages/i);
  assert.match(migration, /returns table\(rows jsonb, total_count bigint, has_more boolean\)/i);
  assert.match(migration, /limit v_limit \+ 1/i);
  assert.match(migration, /auth\.role\(\)\s+is\s+distinct\s+from\s+'service_role'/i);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  assert.match(rollback, /drop function if exists public\.search_public_contract_pages/i);

  assert.match(page, /rpc\("search_public_contract_pages"/);
  assert.match(page, /queryDeadline = Date\.now\(\) \+ 8_000/);
  assert.match(page, /\.abortSignal\(AbortSignal\.timeout/);
  assert.match(search, /record\.has_more/);
  assert.doesNotMatch(search, /while\s*\(/);
  assert.doesNotMatch(page, /select\("procedure_type"\)/);
  assert.doesNotMatch(page, /select\("contract_type"\)/);
  assert.match(table, /hasNextPage/);
});

test("public contract pagination fails closed with one bounded fallback", async () => {
  assert.equal(parsePublicContractPage(undefined), 1);
  assert.equal(parsePublicContractPage(["2", "3"]), 1);
  assert.equal(parsePublicContractPage(null), 1);
  assert.equal(parsePublicContractPage({ page: "2" }), 1);
  assert.equal(parsePublicContractPage("invalid"), 1);
  assert.equal(parsePublicContractPage("2invalid"), 1);
  assert.equal(parsePublicContractPage("1e3"), 1);
  assert.equal(parsePublicContractPage("0"), 1);
  assert.equal(parsePublicContractPage("-2"), 1);
  assert.equal(parsePublicContractPage("999999999"), 100000);

  assert.deepEqual(
    parsePublicContractEnvelope([{ rows: [{ id: "one" }], total_count: null, has_more: true }]),
    { rows: [{ id: "one" }], totalCount: null, hasMore: true },
  );
  assert.equal(parsePublicContractEnvelope([{ rows: "not-json", total_count: null, has_more: false }]), null);
  assert.equal(parsePublicContractEnvelope([{ rows: [], total_count: -1, has_more: false }]), null);
  assert.equal(parsePublicContractEnvelope([{ rows: [], total_count: 1.5, has_more: false }]), null);
  assert.equal(parsePublicContractEnvelope([{ rows: [], total_count: "NaN", has_more: false }]), null);
  assert.equal(parsePublicContractEnvelope([{ rows: [], total_count: "", has_more: false }]), null);
  assert.equal(parsePublicContractEnvelope([{ rows: [], total_count: "  ", has_more: false }]), null);
  assert.equal(parsePublicContractEnvelope([{ rows: [], total_count: false, has_more: false }]), null);
  assert.equal(parsePublicContractEnvelope([{ rows: [], total_count: true, has_more: false }]), null);
  assert.deepEqual(
    parsePublicContractEnvelope([{ rows: [], total_count: "42", has_more: false }]),
    { rows: [], totalCount: 42, hasMore: false },
  );
  assert.equal(parsePublicContractEnvelope([{ rows: [], total_count: 0, has_more: "false" }]), null);

  let fallbackCalls = 0;
  const result = await loadFirstPublicContractPage(async (page) => {
    fallbackCalls += 1;
    return {
      rows: [{ page }],
      totalCount: null,
      hasMore: true,
    };
  });
  assert.equal(fallbackCalls, 1);
  assert.equal(result?.page, 1);
  assert.deepEqual(result?.result.rows, [{ page: 1 }]);

  const empty = await loadFirstPublicContractPage(async () => ({
    rows: [],
    totalCount: null,
    hasMore: false,
  }));
  assert.equal(empty?.page, 1);
});
