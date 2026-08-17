const HISTORY_STATUSES = new Set([
  "",
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "SKIPPED",
  "RATE_LIMITED",
]);

const LISBON_TIME_ZONE = "Europe/Lisbon";

type CalendarDate = { year: number; month: number; day: number };

function parseCalendarDate(value: string): CalendarDate {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function getTimeZoneOffsetMs(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second")) - value.getTime();
}

function localMidnightToUtc(date: CalendarDate): Date {
  const midnightAsUtc = Date.UTC(date.year, date.month - 1, date.day);
  let resolved = midnightAsUtc - getTimeZoneOffsetMs(new Date(midnightAsUtc), LISBON_TIME_ZONE);
  resolved = midnightAsUtc - getTimeZoneOffsetMs(new Date(resolved), LISBON_TIME_ZONE);
  return new Date(resolved);
}

export function getLisbonDateBounds(fromDate: string, toDate: string) {
  const start = localMidnightToUtc(parseCalendarDate(fromDate));
  const end = localMidnightToUtc(addCalendarDays(parseCalendarDate(toDate), 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatNotificationTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: LISBON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

type QueryError = { message?: string } | null | undefined;

export function throwIfNotificationQueryError(error: QueryError, context: string): void {
  if (error) throw new Error(`${context}: ${error.message ?? "erro desconhecido"}`);
}

export type HistorySearchParams = {
  from_date?: string;
  to_date?: string;
  status?: string;
  q?: string;
  page?: string;
};

export type ParsedHistorySearch = {
  fromDate: string;
  toDate: string;
  status: string;
  search: string;
  page: number;
};

function isIsoCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseHistorySearchParams(params: HistorySearchParams, today: string, defaultFromDate = today): ParsedHistorySearch {
  let fromDate = isIsoCalendarDate(params.from_date) ? params.from_date : defaultFromDate;
  let toDate = isIsoCalendarDate(params.to_date) ? params.to_date : today;
  fromDate = fromDate > today ? today : fromDate;
  toDate = toDate > today ? today : toDate;
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];

  const rawStatus = String(params.status ?? "").trim().toUpperCase();
  const status = HISTORY_STATUSES.has(rawStatus) ? rawStatus : "";
  const search = String(params.q ?? "").trim().slice(0, 200);
  const rawPage = String(params.page ?? "1").trim();
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Math.min(10_000, Math.max(1, Number.isFinite(parsedPage) ? parsedPage : 1));
  return { fromDate, toDate, status, search, page };
}

export function getHistoryPageRange(page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  return { from, to: from + safePageSize - 1 };
}

export function historyViewKey(filters: ParsedHistorySearch): string {
  return [
    filters.fromDate,
    filters.toDate,
    filters.status || "ALL",
    filters.search,
    Math.max(1, filters.page),
  ].join(":");
}

export function buildHistoryHref(filters: ParsedHistorySearch): string {
  const params = new URLSearchParams();
  params.set("from_date", filters.fromDate);
  params.set("to_date", filters.toDate);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("q", filters.search);
  params.set("page", String(Math.max(1, filters.page)));
  return `/notifications/history?${params.toString()}`;
}
