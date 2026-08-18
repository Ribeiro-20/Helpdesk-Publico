import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { displayActTypeFilter, normalizeActTypeFilter, reconcileMarketDateEnd } from "./market-filter-state";

test("market act type maps the accented UI label to the BASE value", () => {
  assert.equal(normalizeActTypeFilter("Anúncio de procedimento"), "Anuncio de procedimento");
  assert.equal(displayActTypeFilter("Anuncio de procedimento"), "Anúncio de procedimento");
  assert.equal(normalizeActTypeFilter("Aviso de prorrogação de prazo"), "Aviso de prorrogação de prazo");
});

test("moving market start after the end moves the end with it", () => {
  assert.equal(reconcileMarketDateEnd("2026-08-13", "2026-08-17"), "2026-08-17");
  assert.equal(reconcileMarketDateEnd("2026-08-18", "2026-08-17"), "2026-08-18");
  assert.equal(reconcileMarketDateEnd("2026-08-18", ""), "");
});

test("market date controls share controlled range state", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(
    path.resolve(testDirectory, "../components/market/MarketFiltersForm.tsx"),
    "utf8",
  );
  assert.match(source, /value=\{dateFrom\}/);
  assert.match(source, /onChange=\{handleDateFromChange\}/);
  assert.match(source, /value=\{dateTo\}/);
  assert.match(source, /min=\{dateFrom\s*\|\|\s*undefined\}/);
  assert.match(source, /valueMap=\{actTypeValueMap\}/);
});
