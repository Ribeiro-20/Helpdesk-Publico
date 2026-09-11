import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("contracts ingestion uses the active Node runtime directly", () => {
  const route = fs.readFileSync(
    path.join(root, "apps/web/src/app/api/admin/ingest-contracts/route.ts"),
    "utf8",
  );

  assert.match(route, /execFileAsync\(\s*process\.execPath,/);
  assert.match(route, /\[\s*"ingest-direct\.js",/);
  assert.doesNotMatch(route, /const npmCmd/);
  assert.doesNotMatch(route, /"ingest-contracts:direct"/);
});
