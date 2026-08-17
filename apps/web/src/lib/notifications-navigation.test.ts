import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildNotificationsHref,
  notificationPageKey,
  parseNotificationSearchParams,
} from "./notifications-navigation";
import {
  buildHistoryHref,
  formatNotificationTimestamp,
  getHistoryPageRange,
  getLisbonDateBounds,
  historyViewKey,
  parseHistorySearchParams,
  throwIfNotificationQueryError,
} from "./notification-history";
import { handleDatePickerConfirmKey } from "./date-picker-navigation";

test("notification page identity changes when the page changes", () => {
  assert.notEqual(notificationPageKey("", 1), notificationPageKey("", 2));
  assert.notEqual(notificationPageKey("SENT", 1), notificationPageKey("FAILED", 1));
});

test("notification pagination preserves the selected status", () => {
  assert.equal(buildNotificationsHref("SENT", 3), "/notifications?status=SENT&page=3");
});

test("main notifications parser accepts PROCESSING and rejects unknown statuses", () => {
  assert.deepEqual(parseNotificationSearchParams({ status: " processing ", page: "2" }), {
    status: "PROCESSING",
    page: 2,
  });
  assert.equal(parseNotificationSearchParams({ status: "UNKNOWN" }).status, "");
});

test("main notifications parser normalizes invalid and enormous pages", () => {
  assert.equal(parseNotificationSearchParams({ page: "not-a-page" }).page, 1);
  assert.equal(parseNotificationSearchParams({ page: "-12" }).page, 1);
  assert.equal(parseNotificationSearchParams({ page: "999999999999999999999" }).page, 10_000);
});

test("history accepts the requested 25 July to 13 August interval", () => {
  const parsed = parseHistorySearchParams({
    from_date: "2026-07-25",
    to_date: "2026-08-13",
    status: "SENT",
    q: "cliente teste",
    page: "2",
  }, "2026-08-17");

  assert.deepEqual(parsed, {
    fromDate: "2026-07-25",
    toDate: "2026-08-13",
    status: "SENT",
    search: "cliente teste",
    page: 2,
  });
});

test("history parser accepts PROCESSING", () => {
  assert.equal(
    parseHistorySearchParams({ status: "processing" }, "2026-08-17").status,
    "PROCESSING",
  );
});

test("history page ranges are consecutive and do not overlap", () => {
  assert.deepEqual(getHistoryPageRange(1, 25), { from: 0, to: 24 });
  assert.deepEqual(getHistoryPageRange(2, 25), { from: 25, to: 49 });
});

test("history interval covers complete Lisbon calendar days", () => {
  assert.deepEqual(getLisbonDateBounds("2026-07-25", "2026-08-13"), {
    start: "2026-07-24T23:00:00.000Z",
    end: "2026-08-13T23:00:00.000Z",
  });
  assert.deepEqual(getLisbonDateBounds("2026-01-10", "2026-01-10"), {
    start: "2026-01-10T00:00:00.000Z",
    end: "2026-01-11T00:00:00.000Z",
  });
});

test("history pagination preserves all active filters", () => {
  const href = buildHistoryHref({
    fromDate: "2026-07-25",
    toDate: "2026-08-13",
    status: "SENT",
    search: "cliente teste",
    page: 3,
  });

  assert.equal(
    href,
    "/notifications/history?from_date=2026-07-25&to_date=2026-08-13&status=SENT&q=cliente+teste&page=3",
  );
});

test("history view identity changes with server filters and browser navigation", () => {
  const initial = {
    fromDate: "2026-07-25",
    toDate: "2026-08-13",
    status: "SENT",
    search: "cliente",
    page: 1,
  };
  assert.notEqual(historyViewKey(initial), historyViewKey({ ...initial, fromDate: "2026-08-11" }));
  assert.notEqual(historyViewKey(initial), historyViewKey({ ...initial, toDate: "2026-08-17" }));
  assert.notEqual(historyViewKey(initial), historyViewKey({ ...initial, search: "" }));
});

test("date picker Enter prevents form submission before confirming", () => {
  let prevented = false;
  let confirmed = false;
  const handled = handleDatePickerConfirmKey(
    { key: "Enter", preventDefault: () => { prevented = true; } },
    () => { confirmed = true; },
  );
  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.equal(confirmed, true);

  prevented = false;
  confirmed = false;
  assert.equal(handleDatePickerConfirmKey(
    { key: "Escape", preventDefault: () => { prevented = true; } },
    () => { confirmed = true; },
  ), false);
  assert.equal(prevented, false);
  assert.equal(confirmed, false);
});

test("history rejects reversed and future intervals", () => {
  const reversed = parseHistorySearchParams({
    from_date: "2026-08-13",
    to_date: "2026-07-25",
  }, "2026-08-17");
  assert.equal(reversed.fromDate, "2026-07-25");
  assert.equal(reversed.toDate, "2026-08-13");

  const future = parseHistorySearchParams({
    from_date: "2026-08-18",
    to_date: "2026-08-20",
  }, "2026-08-17");
  assert.equal(future.fromDate, "2026-08-17");
  assert.equal(future.toDate, "2026-08-17");
});

test("notification timestamps are formatted in Europe/Lisbon", () => {
  assert.equal(formatNotificationTimestamp("2026-08-18T12:34:00.000Z"), "18/08/2026, 13:34");
});

test("notification query errors are explicit", () => {
  assert.throws(
    () => throwIfNotificationQueryError({ message: "database unavailable" }, "load history"),
    /load history: database unavailable/,
  );
  assert.doesNotThrow(() => throwIfNotificationQueryError(null, "load history"));
});

test("history RPC is tenant-aware and searches raw announcement payload without ID caps", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const migration = fs.readFileSync(
    path.resolve(testDirectory, "../../../../supabase/migrations/20260818000000_notification_history_search.sql"),
    "utf8",
  );
  assert.match(migration, /n\.tenant_id\s*=\s*current_tenant_id\(\)/i);
  assert.match(migration, /a\.raw_payload::text\s+ilike/i);
  assert.match(migration, /a\.title\s+ilike/i);
  assert.match(migration, /a\.description\s+ilike/i);
  assert.match(migration, /coalesce\(n\.sent_at,\s*n\.created_at\)/i);
  assert.match(
    migration,
    /least\(greatest\(coalesce\(p_page,\s*1\),\s*1\),\s*10000\)/i,
  );
  assert.doesNotMatch(migration, /limit\s+1000/i);
});
