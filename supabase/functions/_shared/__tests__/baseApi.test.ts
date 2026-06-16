/**
 * Unit tests for BASE API helpers.
 * Run with: deno test supabase/functions/_shared/__tests__/baseApi.test.ts
 */

import { parseNifNome, parseNifNomeList } from "../baseApi.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

Deno.test("parseNifNome accepts spaced separator", () => {
  assertEquals(parseNifNome("504293753 - FRESENIUS KABI PHARMA PORTUGAL, LDA."), {
    nif: "504293753",
    name: "FRESENIUS KABI PHARMA PORTUGAL, LDA.",
  });
});

Deno.test("parseNifNome accepts compact separator", () => {
  assertEquals(parseNifNome("504293753-FRESENIUS KABI PHARMA PORTUGAL, LDA."), {
    nif: "504293753",
    name: "FRESENIUS KABI PHARMA PORTUGAL, LDA.",
  });
});

Deno.test("parseNifNome rejects entries without a NIF", () => {
  assertEquals(parseNifNome("- - CONFIDEX, LTD"), {
    nif: "",
    name: "- - CONFIDEX, LTD",
  });
});

Deno.test("parseNifNomeList extracts multiple compact competitors", () => {
  assertEquals(
    parseNifNomeList("504293753-FRESENIUS KABI PHARMA PORTUGAL, LDA.; 500162166-LAB. PFIZER, LDA."),
    [
      { nif: "504293753", name: "FRESENIUS KABI PHARMA PORTUGAL, LDA." },
      { nif: "500162166", name: "LAB. PFIZER, LDA." },
    ],
  );
});
