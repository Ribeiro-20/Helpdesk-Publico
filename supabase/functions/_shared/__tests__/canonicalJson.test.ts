/**
 * Unit tests for canonical JSON hashing.
 * Run with: deno test supabase/functions/_shared/__tests__/canonicalJson.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalJson, computeHash } from "../canonicalJson.ts";

// ---------------------------------------------------------------------------
// canonicalJson – key ordering
// ---------------------------------------------------------------------------

Deno.test("canonicalJson: sorts keys alphabetically", () => {
  const obj = { z: 1, a: 2, m: 3 };
  const result = canonicalJson(obj, []);
  assertEquals(result, '{"a":2,"m":3,"z":1}');
});

Deno.test("canonicalJson: sorts nested keys", () => {
  const obj = { b: { z: 1, a: 2 }, a: { y: 10, x: 5 } };
  const result = canonicalJson(obj, []);
  assertEquals(result, '{"a":{"x":5,"y":10},"b":{"a":2,"z":1}}');
});

Deno.test("canonicalJson: handles arrays without sorting elements", () => {
  const obj = { items: [3, 1, 2] };
  const result = canonicalJson(obj, []);
  assertEquals(result, '{"items":[3,1,2]}');
});

Deno.test("canonicalJson: excludes volatile fields by default", () => {
  const obj = { id: "abc", title: "test", updated_at: "2024-01-01", created_at: "2024-01-01", raw_hash: "old" };
  const result = canonicalJson(obj);
  const parsed = JSON.parse(result);
  assertEquals("id" in parsed, true);
  assertEquals("updated_at" in parsed, false);
  assertEquals("created_at" in parsed, false);
  assertEquals("raw_hash" in parsed, false);
});

Deno.test("canonicalJson: custom exclusion list", () => {
  const obj = { id: "abc", secret: "xyz", title: "test" };
  const result = canonicalJson(obj, ["secret"]);
  const parsed = JSON.parse(result);
  assertEquals("secret" in parsed, false);
  assertEquals("id" in parsed, true);
  assertEquals("title" in parsed, true);
});

// ---------------------------------------------------------------------------
// computeHash – stability
// ---------------------------------------------------------------------------

Deno.test("computeHash: same object always produces same hash", async () => {
  const obj = { b: 2, a: 1, c: { z: 3, y: 4 } };
  const h1 = await computeHash(obj, []);
  const h2 = await computeHash(obj, []);
  assertEquals(h1, h2);
});

Deno.test("computeHash: different key order produces same hash", async () => {
  const obj1 = { a: 1, b: 2 };
  const obj2 = { b: 2, a: 1 };
  const h1 = await computeHash(obj1, []);
  const h2 = await computeHash(obj2, []);
  assertEquals(h1, h2);
});

Deno.test("computeHash: different values produce different hash", async () => {
  const h1 = await computeHash({ a: 1 }, []);
  const h2 = await computeHash({ a: 2 }, []);
  assertEquals(h1 === h2, false);
});

Deno.test("computeHash: volatile fields excluded from hash", async () => {
  const obj1 = { id: "x", title: "test", updated_at: "2024-01-01" };
  const obj2 = { id: "x", title: "test", updated_at: "2025-12-31" };
  const h1 = await computeHash(obj1);
  const h2 = await computeHash(obj2);
  // updated_at is excluded by default → same hash
  assertEquals(h1, h2);
});

Deno.test("computeHash: returns 64-char hex string (SHA-256)", async () => {
  const h = await computeHash({ test: true }, []);
  assertEquals(h.length, 64);
  assertEquals(/^[0-9a-f]+$/.test(h), true);
});
