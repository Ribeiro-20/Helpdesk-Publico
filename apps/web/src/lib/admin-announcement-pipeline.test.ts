import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hasAnnouncementChanges } from "./admin-announcement-pipeline";
import { validateDrIngestDateRange } from "./dr-ingest-validation";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("an unchanged BASE result is reported as no new announcements", () => {
  assert.equal(
    hasAnnouncementChanges({ fetched: 225, inserted: 0, updated: 0, reconciled: 0, errors: 0 }),
    false,
  );
});

test("insertions, updates and reconciliations each require downstream processing", () => {
  assert.equal(hasAnnouncementChanges({ inserted: 1, updated: 0, reconciled: 0, errors: 0 }), true);
  assert.equal(hasAnnouncementChanges({ inserted: 0, updated: 1, reconciled: 0, errors: 0 }), true);
  assert.equal(hasAnnouncementChanges({ inserted: 0, updated: 0, reconciled: 1, errors: 0 }), true);
});

test("BASE summaries fail closed when counters are invalid or errors occurred", () => {
  assert.throws(
    () => hasAnnouncementChanges({ inserted: 0, updated: 0, reconciled: 0 }),
    /resultado BASE inválido.*errors/i,
  );
  assert.throws(
    () => hasAnnouncementChanges({ inserted: 0, updated: "0", reconciled: 0, errors: 0 }),
    /resultado BASE inválido.*updated/i,
  );
  assert.throws(
    () => hasAnnouncementChanges({ inserted: -1, updated: 0, reconciled: 0, errors: 0 }),
    /resultado BASE inválido.*inserted/i,
  );
  assert.throws(
    () => hasAnnouncementChanges({ inserted: 0, updated: 0, reconciled: 0, errors: 2 }),
    /ingestão BASE terminou com 2 erro/i,
  );
});

test("shared DR validation rejects ranges longer than 15 days", () => {
  assert.equal(validateDrIngestDateRange("2026-09-01", "2026-09-15"), 15);
  assert.throws(
    () => validateDrIngestDateRange("2026-09-01", "2026-09-16"),
    /Só é possível fazer pesquisa por 2 semanas/,
  );
});

test("announcement pipeline avoids recursive HTTP and stops cleanly when BASE has no changes", () => {
  const route = fs.readFileSync(
    path.join(root, "apps/web/src/app/api/admin/run-ingest-pipeline/route.ts"),
    "utf8",
  );
  assert.match(route, /runDrIngest/);
  assert.match(route, /hasAnnouncementChanges/);
  assert.match(route, /no_new_announcements:\s*true/);
  assert.doesNotMatch(route, /new URL\("\/api\/admin\/ingest-dr"/);
  assert.doesNotMatch(route, /callInternalDr/);
});

test("DR API and pipeline share the same validated direct server-side runner", () => {
  const drRoute = fs.readFileSync(
    path.join(root, "apps/web/src/app/api/admin/ingest-dr/route.ts"),
    "utf8",
  );
  const drRunner = fs.readFileSync(
    path.join(root, "apps/web/src/lib/server/ingest-dr.ts"),
    "utf8",
  );
  assert.match(drRoute, /runDrIngest/);
  assert.match(drRoute, /validateDrIngestDateRange/);
  assert.match(drRunner, /validateDrIngestDateRange\(input\.fromDate, input\.toDate\)/);
  assert.doesNotMatch(drRoute, /execFileAsync/);
});

test("admin UI tells the operator when there are no new announcements", () => {
  const adminActions = fs.readFileSync(
    path.join(root, "apps/web/src/components/AdminActions.tsx"),
    "utf8",
  );
  assert.match(adminActions, /pipelineData\.no_new_announcements === true/);
  assert.match(adminActions, /Não foram encontrados anúncios novos/);
});
