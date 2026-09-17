import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildSemicolonCsv,
  parseJsonArray,
  PRIVATE_NO_STORE_HEADERS,
  safeSpreadsheetCell,
} from "./export-csv";
import { classifyContractExport, parseContractExportEnvelope } from "./contract-export";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("CSV output prevents spreadsheet formula injection and preserves delimiters", () => {
  assert.equal(safeSpreadsheetCell("=HYPERLINK(\"https://example.invalid\")"), "'=HYPERLINK(\"https://example.invalid\")");
  assert.equal(safeSpreadsheetCell(" normal"), " normal");
  const csv = buildSemicolonCsv(["Nome", "Valor"], [["A; B", 12.5]]);
  assert.ok(csv.startsWith("\ufeffNome;Valor\r\n"));
  assert.match(csv, /"A; B";12,5/);
});

test("export helpers fail closed on malformed RPC rows and disable caching", () => {
  assert.deepEqual(parseJsonArray<{ id: string }>(`[{"id":"1"}]`), [{ id: "1" }]);
  assert.equal(parseJsonArray("{invalid"), null);
  assert.equal(PRIVATE_NO_STORE_HEADERS["Cache-Control"], "private, no-store");
});

test("backoffice export rate limiting is shared, atomic, tenant-aware, and fail closed", () => {
  const helper = read("apps/web/src/lib/server/backoffice-export-rate-limit.ts");
  const migration = read("supabase/migrations/20260911090000_backoffice_export_rate_limit.sql");

  assert.match(helper, /rpc\(["']consume_backoffice_export_rate_limit["']\)/);
  assert.match(helper, /Malformed export rate-limit/);
  assert.match(migration, /primary key \(tenant_id, user_id\)/i);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /current_tenant_id\(\)/);
  assert.match(migration, /on conflict \(tenant_id, user_id\) do update/i);
  assert.match(migration, /allowed := v_request_count <= 3/);
  assert.match(migration, /grant execute .* to authenticated/i);
  assert.match(migration, /revoke all .* from public, anon, authenticated/i);
});

test("announcement and contract exports are private backoffice routes", () => {
  const middleware = read("apps/web/src/middleware.ts");
  const auth = read("apps/web/src/lib/server/backoffice-export-auth.ts");
  const announcementRoute = read("apps/web/src/app/api/announcements/export/route.ts");
  const contractRoute = read("apps/web/src/app/api/contracts/export/route.ts");

  assert.match(middleware, /PRIVATE_EXPORT_PATHS/);
  assert.match(middleware, /\/api\/announcements\/export/);
  assert.match(middleware, /\/api\/contracts\/export/);
  assert.match(auth, /supabase\.auth\.getUser\(\)/);
  assert.match(auth, /\.from\("app_users"\)/);
  assert.match(auth, /tenant_id/);
  assert.doesNotMatch(auth, /appUserError\.message/);
  assert.match(announcementRoute, /requireBackofficeUser/);
  assert.match(contractRoute, /requireBackofficeUser/);
  assert.match(announcementRoute, /dynamic\s*=\s*["']force-dynamic["']/);
  assert.match(contractRoute, /dynamic\s*=\s*["']force-dynamic["']/);
  assert.match(announcementRoute, /consumeBackofficeExportRateLimit/);
  assert.match(contractRoute, /consumeBackofficeExportRateLimit/);
  assert.match(announcementRoute, /Retry-After/);
  assert.match(contractRoute, /Retry-After/);
  assert.match(announcementRoute, /unexpected failure/);
  assert.match(contractRoute, /unexpected failure/);
});

test("announcement export preserves every backoffice list filter and applies a hard limit", () => {
  const route = read("apps/web/src/app/api/announcements/export/route.ts");
  for (const parameter of [
    "cpv",
    "entity",
    "announcement_number",
    "act_type",
    "procedure_type",
    "contract_type",
    "min_value",
    "max_value",
    "from_date",
    "to_date",
    "sort",
    "dir",
  ]) {
    assert.match(route, new RegExp(`(?:get|getAll)\\(\\"${parameter}\\"\\)`));
  }
  assert.match(route, /MAX_EXPORT_ROWS\s*=\s*5000/);
  assert.match(route, /created_at/);
  assert.match(route, /extractProcedurePiecesUrl/);
  assert.doesNotMatch(route, /announcementNumber\.replace/);
  assert.match(route, /Reduza o intervalo ou aplique mais filtros/);
});

test("contract export uses the dedicated bounded RPC and is exposed only in backoffice", () => {
  const route = read("apps/web/src/app/api/contracts/export/route.ts");
  const dashboard = read("apps/web/src/app/(dashboard)/contracts/page.tsx");
  const publicPage = read("apps/web/src/app/mp/contratos-publicos/page.tsx");

  assert.match(route, /rpc\("export_contracts_v1"/);
  assert.match(route, /p_tenant_id:\s*auth\.user\.tenantId/);
  assert.match(route, /MAX_EXPORT_ROWS\s*=\s*5000/);
  assert.match(route, /has_more/);
  assert.match(route, /base_contract_id/);
  assert.match(route, /row\.base_contract_id\s*\?\?\s*""/);
  assert.doesNotMatch(route, /\.from\("contracts"\)/);
  assert.doesNotMatch(route, /BASE ID lookup failed/);
  assert.match(route, /Reduza o intervalo ou aplique mais filtros/);
  assert.match(dashboard, /\/api\/contracts\/export/);
  assert.match(dashboard, /CsvExportButton/);
  assert.match(read("apps/web/src/components/CsvExportButton.tsx"), /Exportar CSV/);
  assert.doesNotMatch(publicPage, /\/api\/contracts\/export|Exportar CSV|download/);
});

test("contract export RPC carries the BASE ID without a second REST lookup", () => {
  const migration = read("supabase/migrations/20260917120000_contract_export_base_id.sql");
  const rollback = read("supabase/rollbacks/20260917120000_contract_export_base_id.sql");

  assert.match(migration, /select c\.id, c\.base_contract_id, c\.object/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke execute .* from public, anon/i);
  assert.match(migration, /grant execute .* to authenticated/i);
  assert.doesNotMatch(rollback, /select c\.id, c\.base_contract_id, c\.object/);
  assert.match(rollback, /select c\.id, c\.object/);
});

test("contract export button blocks rapid duplicate requests immediately", () => {
  const dashboard = read("apps/web/src/app/(dashboard)/contracts/page.tsx");
  const button = read("apps/web/src/components/CsvExportButton.tsx");

  assert.match(dashboard, /<CsvExportButton\s+href=\{exportQs\(\)\}/);
  assert.doesNotMatch(dashboard, /<a[\s\S]*?href=\{exportQs\(\)\}[\s\S]*?download/);
  assert.match(button, /useRef\(false\)/);
  assert.match(button, /if \(inFlight\.current\) return/);
  assert.match(button, /inFlight\.current = true[\s\S]*?await fetch\(href/);
  assert.match(button, /disabled=\{loading\}/);
});

test("contract export button never downloads JSON error responses", () => {
  const button = read("apps/web/src/components/CsvExportButton.tsx");

  assert.match(button, /if \(!response\.ok\)/);
  assert.match(button, /responseError\(response, failureMessage\)/);
  assert.match(button, /Content-Type/);
  assert.match(button, /text\/csv/);
  assert.match(button, /URL\.createObjectURL\(blob\)/);
  assert.match(button, /aria-live="polite"/);
});

test("contract export uses one service-only bounded RPC call", () => {
  const route = read("apps/web/src/app/api/contracts/export/route.ts");
  const migration = read("supabase/migrations/20260917143000_contract_export_single_call.sql");
  const rollback = read("supabase/rollbacks/20260917143000_contract_export_single_call.sql");

  assert.match(route, /RPC_PAGE_SIZE\s*=\s*MAX_EXPORT_ROWS\s*\+\s*1/);
  assert.doesNotMatch(route, /while \(hasMore/);
  assert.match(route, /createAdminClient/);
  assert.match(route, /rpc\("export_contracts_v1"/);
  assert.match(route, /p_tenant_id:\s*auth\.user\.tenantId/);
  assert.match(migration, /v_limit integer := least\(greatest\(coalesce\(p_limit, 5001\), 1\), 5001\)/);
  assert.match(migration, /set plan_cache_mode = 'force_custom_plan'/);
  assert.match(migration, /revoke execute .* from public, anon, authenticated/is);
  assert.match(migration, /grant execute .* to service_role/is);
  assert.match(rollback, /drop function if exists public\.export_contracts_v1/is);
});

test("contract export classifies exact limits and malformed envelopes", () => {
  assert.equal(classifyContractExport(5000, false), "ok");
  assert.equal(classifyContractExport(5001, false), "too_large");
  assert.equal(classifyContractExport(5000, true), "too_large");
  assert.equal(classifyContractExport(100, null), "malformed");
  assert.equal(classifyContractExport(-1, false), "malformed");
  assert.equal(classifyContractExport(10, "false"), "malformed");
});

test("contract export rejects malformed RPC envelopes", () => {
  assert.deepEqual(
    parseContractExportEnvelope([{ rows: [{ id: "one" }], has_more: false }]),
    { rows: [{ id: "one" }], hasMore: false },
  );
  assert.equal(parseContractExportEnvelope([]), null);
  assert.equal(parseContractExportEnvelope([{ rows: [], has_more: false }, { rows: [], has_more: false }]), null);
  assert.equal(parseContractExportEnvelope([{ has_more: false }]), null);
  assert.equal(parseContractExportEnvelope([{ rows: null, has_more: false }]), null);
  assert.equal(parseContractExportEnvelope([{ rows: {}, has_more: false }]), null);
  assert.equal(parseContractExportEnvelope([{ rows: [], has_more: "false" }]), null);
});

test("both backoffice exports use the guarded CSV button", () => {
  const contracts = read("apps/web/src/app/(dashboard)/contracts/page.tsx");
  const announcements = read("apps/web/src/app/(dashboard)/announcements/page.tsx");
  const button = read("apps/web/src/components/CsvExportButton.tsx");

  assert.match(contracts, /<CsvExportButton\s+href=\{exportQs\(\)\}/);
  assert.match(announcements, /<CsvExportButton\s+href=\{exportQs\(\)\}\s+filenamePrefix="anuncios"/);
  assert.doesNotMatch(announcements, /<a[\s\S]*?href=\{exportQs\(\)\}[\s\S]*?download/);
  assert.match(button, /filenamePrefix/);
});

test("download buttons exist only on authenticated backoffice lists", () => {
  const privateAnnouncements = read("apps/web/src/app/(dashboard)/announcements/page.tsx");
  const privateContracts = read("apps/web/src/app/(dashboard)/contracts/page.tsx");
  const publicAnnouncements = read("apps/web/src/app/mp/oportunidades-mercado/page.tsx");
  const publicContracts = read("apps/web/src/app/mp/contratos-publicos/page.tsx");

  assert.match(privateAnnouncements, /\/api\/announcements\/export/);
  assert.match(privateContracts, /\/api\/contracts\/export/);
  assert.doesNotMatch(publicAnnouncements, /\/api\/announcements\/export|Exportar CSV|download/);
  assert.doesNotMatch(publicContracts, /\/api\/contracts\/export|Exportar CSV|download/);
});

test("contract secondary filters reserve compact value fields and keep actions inside the card", () => {
  const dashboard = read("apps/web/src/app/(dashboard)/contracts/page.tsx");

  assert.match(
    dashboard,
    /xl:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(0,1\.15fr\)_minmax\(0,0\.7fr\)_minmax\(0,0\.7fr\)_minmax\(0,1fr\)_auto\]/,
  );
  assert.match(dashboard, /Valor mínimo \(€\)/);
  assert.match(dashboard, /Valor máximo \(€\)/);
  assert.match(dashboard, /xl:flex-nowrap xl:justify-end/);
  const exportButton = read("apps/web/src/components/CsvExportButton.tsx");
  assert.match(dashboard, /<CsvExportButton\s+href=\{exportQs\(\)\}/);
  assert.match(exportButton, /className="[^"]*whitespace-nowrap[^"]*"/);
});
