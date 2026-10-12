import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";

const require = createRequire(import.meta.url);
// Next's internals must be bootstrapped before importing patch-fetch.
require("next/dist/server/node-environment");
const { patchFetch } = require("next/dist/server/lib/patch-fetch");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

// Exercise the installed Next fetch implementation, not plain CLI fetch (which
// bypasses the Data Cache without a static-generation async context).
test("public contract searches bypass an existing stale cache and see later imports", async () => {
  const source = fs.readFileSync(path.join(root, "apps/web/src/app/mp/contratos-publicos/page.tsx"), "utf8");
  const fetchCache = source.match(/export const fetchCache = ["']([^"']+)["'];/)?.[1];
  const originalFetch = globalThis.fetch;
  const storage = new AsyncLocalStorage();
  const envelope = (date: string) => [{ rows: [{ id: "fixture-contract", publication_date: date }], total_count: 1, has_more: false }];
  const staleEntry = {
    isStale: false,
    value: {
      kind: "FETCH",
      revalidate: 31536000,
      data: {
        body: Buffer.from(JSON.stringify(envelope("2026-09-22"))).toString("base64"),
        headers: { "content-type": "application/json" },
        status: 200,
        url: "http://fixture.invalid/rest/v1/rpc/search_public_contract_pages",
      },
    },
  };
  let cacheReads = 0;
  let cacheWrites = 0;
  let originCalls = 0;
  let publicationDate = "2026-10-10";
  const incrementalCache = {
    fetchCacheKey: async () => "fixture-rpc-key",
    lock: async () => async () => {},
    get: async () => { cacheReads += 1; return staleEntry; },
    set: async () => { cacheWrites += 1; },
  };

  try {
    globalThis.fetch = async () => {
      originCalls += 1;
      return new Response(JSON.stringify(envelope(publicationDate)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    patchFetch({
      staticGenerationAsyncStorage: storage,
      serverHooks: require("next/dist/client/components/hooks-server-context"),
    });
    const client = createServerClient("http://fixture.invalid", "fixture-service-role", {
      cookies: { get: () => undefined, set: () => {}, remove: () => {} },
    });
    const search = (cacheMode: string | undefined) => storage.run({
      isStaticGeneration: false,
      forceDynamic: true,
      fetchCache: cacheMode,
      pagePath: "/mp/contratos-publicos/page",
      urlPathname: "/mp/contratos-publicos",
      incrementalCache,
    }, async () => {
      const { data, error } = await client.rpc("search_public_contract_pages", {
        p_tenant_id: "00000000-0000-4000-8000-000000000001",
        p_limit: 25,
        p_offset: 0,
      }).abortSignal(AbortSignal.timeout(1000));
      assert.equal(error, null);
      return data[0].rows[0].publication_date;
    });

    const first = await search(fetchCache);
    publicationDate = "2026-10-11";
    const second = await search(fetchCache);
    assert.deepEqual([first, second], ["2026-10-10", "2026-10-11"]);
    assert.equal(originCalls, 2);
    assert.equal(cacheReads, 0, "old snapshots must not be read");
    assert.equal(cacheWrites, 0, "new snapshots must not freeze later imports");

    // Negative control: force-dynamic alone must reproduce the stale result.
    const withoutPolicy = await search(undefined);
    assert.equal(withoutPolicy, "2026-09-22");
    assert.equal(cacheReads, 1);
    assert.equal(originCalls, 2);
    assert.equal(cacheWrites, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
