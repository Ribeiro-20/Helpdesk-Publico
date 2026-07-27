import assert from "node:assert/strict";
import test from "node:test";
import {
  addDaysToPortugalDateEnd,
  calendarDaysUntilDeadlineInPortugal,
  endOfPortugalDateToIso,
  formatPortugalDateTime,
  isDeadlineExpired,
  portugalLocalDateTimeToIso,
} from "../supabase/functions/_shared/portugalTime.ts";
import { extractDeadlineAtFromDrText } from "./lib/drDeadline.ts";

test("converts a summer deadline from Lisbon time to UTC", () => {
  assert.equal(
    portugalLocalDateTimeToIso({
      year: 2026,
      month: 7,
      day: 23,
      hour: 23,
      minute: 59,
    }),
    "2026-07-23T22:59:00.000Z",
  );
});

test("does not subtract an hour during Portuguese winter time", () => {
  assert.equal(
    portugalLocalDateTimeToIso({
      year: 2026,
      month: 12,
      day: 23,
      hour: 23,
      minute: 59,
    }),
    "2026-12-23T23:59:00.000Z",
  );
});

test("extracts the exact DR deadline hour", () => {
  const text = "Prazo para apresentação das propostas: 23-07-2026 18:00";
  assert.equal(
    extractDeadlineAtFromDrText(text),
    "2026-07-23T17:00:00.000Z",
  );
});

test("keeps announcement 18626/2026 on 23 July in Lisbon", () => {
  const deadline = extractDeadlineAtFromDrText(
    "Prazo para apresentação das propostas: 23-07-2026 23:59",
  );
  assert.equal(deadline, "2026-07-23T22:59:00.000Z");
  assert.match(formatPortugalDateTime(deadline) ?? "", /23\/07\/2026.*23:59/);
  assert.equal(
    isDeadlineExpired(deadline, Date.parse("2026-07-23T22:58:59.999Z")),
    false,
  );
  assert.equal(
    isDeadlineExpired(deadline, Date.parse("2026-07-23T22:59:00.001Z")),
    true,
  );
});

test("uses the end of the Portuguese day when the source has no hour", () => {
  const text = "Prazo para apresentação das propostas: 23-07-2026";
  assert.equal(
    extractDeadlineAtFromDrText(text),
    "2026-07-23T22:59:59.000Z",
  );
  assert.equal(
    endOfPortugalDateToIso("2026-12-23"),
    "2026-12-23T23:59:59.000Z",
  );
});

test("keeps the target civil date when adding days across DST", () => {
  assert.equal(
    addDaysToPortugalDateEnd("2026-03-27", 3),
    "2026-03-30T22:59:59.000Z",
  );
});

test("rejects invalid DR calendar dates", () => {
  assert.equal(
    extractDeadlineAtFromDrText(
      "Prazo para apresentação das propostas: 31-02-2026 23:59",
    ),
    null,
  );
});

test("expiration compares the exact instant", () => {
  const deadline = "2026-07-23T22:59:00.000Z";
  assert.equal(isDeadlineExpired(deadline, Date.parse(deadline) - 1), false);
  assert.equal(isDeadlineExpired(deadline, Date.parse(deadline) + 1), true);
});

test("formats and counts deadlines using the Portugal calendar", () => {
  const deadline = "2026-07-23T22:59:00.000Z";
  assert.match(formatPortugalDateTime(deadline) ?? "", /23\/07\/2026.*23:59/);
  assert.equal(
    calendarDaysUntilDeadlineInPortugal(
      deadline,
      new Date("2026-07-22T23:30:00.000Z"),
    ),
    0,
  );
});
