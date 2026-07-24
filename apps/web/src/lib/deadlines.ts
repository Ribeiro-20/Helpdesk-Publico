export const PORTUGAL_TIME_ZONE = "Europe/Lisbon";

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  timeZone: PORTUGAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const deadlineFormatter = new Intl.DateTimeFormat("pt-PT", {
  timeZone: PORTUGAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateKeyFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PORTUGAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateInPortugal(value: unknown, fallback = "-"): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

export function formatDeadlineInPortugal(value: unknown, fallback = "-"): string {
  const date = toDate(value);
  return date ? deadlineFormatter.format(date) : fallback;
}

export function isDeadlineExpired(
  deadlineAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const date = toDate(deadlineAt);
  return date ? date.getTime() < nowMs : false;
}

function dateKeyInPortugal(value: string | Date): string | null {
  const date = toDate(value);
  if (!date) return null;

  const parts = dateKeyFormatter.formatToParts(date);
  const read = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function calendarDaysUntilDeadlineInPortugal(
  deadlineAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!deadlineAt) return null;
  const deadlineKey = dateKeyInPortugal(deadlineAt);
  const todayKey = dateKeyInPortugal(now);
  if (!deadlineKey || !todayKey) return null;

  const toUtcDay = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };

  return Math.round((toUtcDay(deadlineKey) - toUtcDay(todayKey)) / 86_400_000);
}
