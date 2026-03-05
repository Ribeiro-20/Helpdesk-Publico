/**
 * Unit tests for CPV matching engine.
 * Run with: deno test supabase/functions/_shared/__tests__/cpvMatcher.test.ts
 */

import {
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  matchesCpv,
  matchClientsForAnnouncement,
  shouldNotifyClient,
} from "../cpvMatcher.ts";
import type { CpvRule } from "../cpvMatcher.ts";

// ---------------------------------------------------------------------------
// matchesCpv
// ---------------------------------------------------------------------------

Deno.test("EXACT: matching code returns true", () => {
  const rule: CpvRule = {
    id: "1",
    client_id: "c1",
    pattern: "71240000-2",
    match_type: "EXACT",
    is_exclusion: false,
  };
  assertEquals(matchesCpv("71240000-2", rule), true);
});

Deno.test("EXACT: non-matching code returns false", () => {
  const rule: CpvRule = {
    id: "1",
    client_id: "c1",
    pattern: "71240000-2",
    match_type: "EXACT",
    is_exclusion: false,
  };
  assertFalse(matchesCpv("71241000-9", rule));
});

Deno.test("PREFIX: star pattern matches prefix", () => {
  const rule: CpvRule = {
    id: "2",
    client_id: "c1",
    pattern: "7124*",
    match_type: "PREFIX",
    is_exclusion: false,
  };
  assertEquals(matchesCpv("71240000-2", rule), true);
  assertEquals(matchesCpv("71241000-9", rule), true);
  assertEquals(matchesCpv("71249999-0", rule), true);
});

Deno.test("PREFIX: non-matching prefix returns false", () => {
  const rule: CpvRule = {
    id: "2",
    client_id: "c1",
    pattern: "7124*",
    match_type: "PREFIX",
    is_exclusion: false,
  };
  assertFalse(matchesCpv("72000000-5", rule));
});

// ---------------------------------------------------------------------------
// shouldNotifyClient
// ---------------------------------------------------------------------------

Deno.test("shouldNotify: returns true when inclusion rule matches", () => {
  const rules: CpvRule[] = [
    {
      id: "r1",
      client_id: "c1",
      pattern: "71240000-2",
      match_type: "EXACT",
      is_exclusion: false,
    },
  ];
  assertEquals(shouldNotifyClient("71240000-2", [], rules), true);
});

Deno.test("shouldNotify: returns false when no inclusion matches", () => {
  const rules: CpvRule[] = [
    {
      id: "r1",
      client_id: "c1",
      pattern: "71240000-2",
      match_type: "EXACT",
      is_exclusion: false,
    },
  ];
  assertFalse(shouldNotifyClient("72000000-5", [], rules));
});

Deno.test("shouldNotify: exclusion cancels notification", () => {
  const rules: CpvRule[] = [
    {
      id: "r1",
      client_id: "c1",
      pattern: "7124*",
      match_type: "PREFIX",
      is_exclusion: false,
    },
    {
      id: "r2",
      client_id: "c1",
      pattern: "71240000-2",
      match_type: "EXACT",
      is_exclusion: true,
    },
  ];
  // Matches PREFIX but is excluded by EXACT exclusion
  assertFalse(shouldNotifyClient("71240000-2", [], rules));
});

Deno.test("shouldNotify: exclusion does not cancel if CPV is different", () => {
  const rules: CpvRule[] = [
    {
      id: "r1",
      client_id: "c1",
      pattern: "7124*",
      match_type: "PREFIX",
      is_exclusion: false,
    },
    {
      id: "r2",
      client_id: "c1",
      pattern: "71240000-2",
      match_type: "EXACT",
      is_exclusion: true,
    },
  ];
  // Matches PREFIX but excluded code is not present
  assertEquals(shouldNotifyClient("71241000-9", [], rules), true);
});

Deno.test("shouldNotify: cpvList is also evaluated", () => {
  const rules: CpvRule[] = [
    {
      id: "r1",
      client_id: "c1",
      pattern: "45000000-7",
      match_type: "EXACT",
      is_exclusion: false,
    },
  ];
  // cpvMain doesn't match but cpvList does
  assertEquals(
    shouldNotifyClient("71240000-2", ["45000000-7", "33000000-0"], rules),
    true,
  );
});

Deno.test("shouldNotify: empty CPV list returns false", () => {
  const rules: CpvRule[] = [
    {
      id: "r1",
      client_id: "c1",
      pattern: "7124*",
      match_type: "PREFIX",
      is_exclusion: false,
    },
  ];
  assertFalse(shouldNotifyClient(null, [], rules));
});

// ---------------------------------------------------------------------------
// matchClientsForAnnouncement
// ---------------------------------------------------------------------------

Deno.test("matchClients: returns only matching client IDs", () => {
  const rules: CpvRule[] = [
    {
      id: "r1",
      client_id: "c1",
      pattern: "7124*",
      match_type: "PREFIX",
      is_exclusion: false,
    },
    {
      id: "r2",
      client_id: "c2",
      pattern: "45000000-7",
      match_type: "EXACT",
      is_exclusion: false,
    },
  ];
  const matched = matchClientsForAnnouncement("71240000-2", [], rules);
  assertEquals(matched, ["c1"]);
});

Deno.test("matchClients: multiple clients can match", () => {
  const rules: CpvRule[] = [
    {
      id: "r1",
      client_id: "c1",
      pattern: "7124*",
      match_type: "PREFIX",
      is_exclusion: false,
    },
    {
      id: "r2",
      client_id: "c2",
      pattern: "71240000-2",
      match_type: "EXACT",
      is_exclusion: false,
    },
  ];
  const matched = matchClientsForAnnouncement("71240000-2", [], rules);
  assertEquals(matched.sort(), ["c1", "c2"].sort());
});

Deno.test("matchClients: no matches returns empty array", () => {
  const rules: CpvRule[] = [
    {
      id: "r1",
      client_id: "c1",
      pattern: "45000000-7",
      match_type: "EXACT",
      is_exclusion: false,
    },
  ];
  const matched = matchClientsForAnnouncement("71240000-2", [], rules);
  assertEquals(matched, []);
});
