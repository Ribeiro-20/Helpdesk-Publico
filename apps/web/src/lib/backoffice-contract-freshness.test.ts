import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const filename = path.join(root, "apps/web/src/app/(dashboard)/contracts/page.tsx");

// Execute the real server page with fixture authentication and query transport.
// This does not create a login or claim to validate production authentication.
async function renderPage(params: Record<string, string> = {}, empty = false) {
  let rpcArgs: Record<string, unknown> | undefined;
  const fixtures = [
    { id: "00000000-0000-4000-8000-000000000011", object: "Publicado ontem, celebrado antes", publication_date: "2026-10-11", signing_date: "2026-10-09", procedure_type: null, cpv_main: null, contract_price: 100, status: "active", contracting_entities: [], winners: [] },
    { id: "00000000-0000-4000-8000-000000000010", object: "Publicado antes, celebrado depois", publication_date: "2026-10-10", signing_date: "2026-10-10", procedure_type: null, cpv_main: null, contract_price: 200, status: "active", contracting_entities: [], winners: [] },
  ];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "fixture-user" } } }) },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rpcArgs = args;
      const field = args.p_sort === "publication_date" ? "publication_date" : "signing_date";
      const rows = empty ? [] : [...fixtures].sort((a, b) => b[field].localeCompare(a[field]));
      return { data: [{ rows, total_count: rows.length, has_more: false }], error: null };
    },
  };
  const query = {
    select: () => query, eq: () => query, limit: () => query,
    maybeSingle: async () => ({ data: { id: "fixture-tenant", tenant_id: "fixture-tenant" } }),
  };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const emittedModule = { exports: {} as { default?: (props: unknown) => Promise<React.ReactNode> } };
  const fixtureRequire = (id: string) => {
    if (id === "@/lib/supabase/server") return { createClient: async () => client, createAdminClient: async () => ({ from: () => query }) };
    if (id === "@/lib/contract-search") return require("./contract-search");
    if (id === "@/lib/contract-navigation") return require("./contract-navigation");
    if (id === "next/link") return { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) };
    if (id === "@/components/layout/PageHeader") return { __esModule: true, default: ({ title, description }: { title: string; description: string }) => React.createElement("header", {}, title, description) };
    if (id === "@/components/SingleDatePicker") return { __esModule: true, default: (props: React.InputHTMLAttributes<HTMLInputElement>) => React.createElement("input", props) };
    if (id === "@/components/CsvExportButton") return { __esModule: true, default: ({ href }: { href: string }) => React.createElement("a", { href }, "Exportar CSV") };
    return require(id);
  };
  vm.runInNewContext(code, { module: emittedModule, exports: emittedModule.exports, require: fixtureRequire, URLSearchParams }, { filename });
  assert.ok(emittedModule.exports.default);
  const tree = await emittedModule.exports.default({ searchParams: Promise.resolve(params) });
  return { html: renderToStaticMarkup(tree), rpcArgs };
}

test("backoffice opens with the newest publications, not the newest celebrations", async () => {
  const { html, rpcArgs } = await renderPage();
  assert.equal(rpcArgs?.p_sort, "publication_date");
  assert.match(html, /<option value="publication_date"[^>]*selected/);
  assert.ok(html.indexOf("Publicado ontem, celebrado antes") < html.indexOf("Publicado antes, celebrado depois"));
  assert.match(html, /sort=publication_date/);
});

test("backoffice separates publication from celebration in the visible table", async () => {
  const { html } = await renderPage();
  assert.match(html, /Publicação/);
  assert.match(html, /Celebração/);
  assert.match(html, /Mais recentes \(publicação\)/);
  assert.match(html, /Data de celebração/);
  const firstRow = html.match(/<tbody[^>]*>\s*<tr[^>]*>([\s\S]*?)<\/tr>/)?.[1];
  assert.ok(firstRow);
  assert.match(firstRow, />11\/10\/2026<\/td>/);
  assert.match(firstRow, />09\/10\/2026<\/td>/);
  assert.ok(firstRow.indexOf("11/10/2026") < firstRow.indexOf("09/10/2026"));
});

test("backoffice preserves explicit sorts and celebration filters in search, detail and export", async () => {
  for (const sort of ["signing_date", "publication_date", "value_desc", "value_asc"]) {
    const { html, rpcArgs } = await renderPage({ sort, from_date: "2026-09-01", to_date: "2026-10-11" });
    assert.equal(rpcArgs?.p_sort, sort);
    assert.equal(rpcArgs?.p_from_date, "2026-09-01");
    assert.equal(rpcArgs?.p_to_date, "2026-10-11");
    assert.match(html, /Celebração desde/);
    assert.match(html, /Celebração até/);
    const exportHref = html.match(/<a href="([^"]+)">Exportar CSV<\/a>/)?.[1];
    assert.ok(exportHref);
    const exportUrl = new URL(exportHref.replace(/&amp;/g, "&"), "https://fixture.invalid");
    assert.equal(exportUrl.pathname, "/api/contracts/export");
    assert.equal(exportUrl.searchParams.get("sort"), sort);
    assert.equal(exportUrl.searchParams.get("from_date"), "2026-09-01");
    assert.equal(exportUrl.searchParams.get("to_date"), "2026-10-11");
    assert.ok(html.includes(`sort%3D${sort}`));
  }
});

test("backoffice empty results span both date columns without fabricating a date", async () => {
  const { html } = await renderPage({}, true);
  assert.match(html, /colSpan="8"/);
  assert.doesNotMatch(html, /11\/10\/2026/);
});
