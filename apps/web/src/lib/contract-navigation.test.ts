import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildBaseContractUrl,
  buildContractDetailHref,
  safeContractsReturnHref,
} from "./contract-navigation";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("contract detail links preserve the filtered contracts list", () => {
  const listHref = "/contracts?page=3&from_date=2026-09-08&to_date=2026-09-10&sort=publication_date";
  assert.equal(
    buildContractDetailHref("contract/id", listHref),
    "/contracts/contract%2Fid?return_to=%2Fcontracts%3Fpage%3D3%26from_date%3D2026-09-08%26to_date%3D2026-09-10%26sort%3Dpublication_date",
  );
  assert.equal(safeContractsReturnHref(listHref), listHref);
});

test("contract return links fail closed to the contracts list", () => {
  assert.equal(safeContractsReturnHref("https://evil.invalid/contracts"), "/contracts");
  assert.equal(safeContractsReturnHref("//evil.invalid/contracts"), "/contracts");
  assert.equal(safeContractsReturnHref("/contracts/another-id?x=1"), "/contracts");
  assert.equal(safeContractsReturnHref(null), "/contracts");
});

test("backoffice contract detail points to the published Portal BASE contract", () => {
  assert.equal(
    buildBaseContractUrl("123/ABC"),
    "https://www.base.gov.pt/Base4/pt/detalhe/?type=contratos&id=123%2FABC",
  );
  assert.equal(buildBaseContractUrl(null), null);

  const listPage = read("apps/web/src/app/(dashboard)/contracts/page.tsx");
  const detailPage = read("apps/web/src/app/(dashboard)/contracts/[id]/page.tsx");
  assert.match(listPage, /buildContractDetailHref\(c\.id,\s*buildQs\(\)\)/);
  assert.match(detailPage, /safeContractsReturnHref\(returnTo\)/);
  assert.match(detailPage, /buildBaseContractUrl\(contract\.base_contract_id\)/);
  assert.match(detailPage, /Ver contrato publicado no Portal BASE/);
  assert.doesNotMatch(detailPage, /href=\{contract\.procedure_docs_url\}/);
});
