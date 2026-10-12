import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("public pagination fetches only pages requested by the user", () => {
  const filename = path.join(root, "apps/web/src/components/ContractsTable.tsx");
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let paginationLinks = 0;
  function visit(node: ts.Node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "Link") {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const href = attributes.find((attr) => attr.name.getText(source) === "href");
      if (href?.initializer && href.initializer.getText(source).includes("buildQs(")) {
        paginationLinks += 1;
        const prefetch = attributes.find((attr) => attr.name.getText(source) === "prefetch");
        assert.ok(prefetch?.initializer && ts.isJsxExpression(prefetch.initializer));
        assert.equal(prefetch.initializer.expression?.kind, ts.SyntaxKind.FalseKeyword,
          "pagination must not prefetch costly deep pages or exhaust the shared request budget");
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(paginationLinks, 3, "cover previous, numbered and next controls");
});
