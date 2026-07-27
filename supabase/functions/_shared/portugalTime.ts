export const PORTUGAL_TIME_ZONE = "Europe/Lisbon";

export type PortugalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

type DateTimePart = "year" | "month" | "day" | "hour" | "minute" | "second";

const portugalDatePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PORTUGAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const portugalDateTimePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PORTUGAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const portugalDateFormatter = new Intl.DateTimeFormat("pt-PT", {
  timeZone: PORTUGAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const portugalDateTimeFormatter = new Intl.DateTimeFormat("pt-PT", {
  timeZone: PORTUGAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function readPart(parts: Intl.DateTimeFormatPart[], type: DateTimePart): number {
  return Number(parts.find((part) => part.type === type)?.value);
}

function getPartsAtInstant(value: Date): Required<Omit<PortugalDateTimeParts, "millisecond">> {
  const parts = portugalDateTimePartsFormatter.formatToParts(value);
  return {
    year: readPart(parts, "year"),
    month: readPart(parts, "month"),
    day: readPart(parts, "day"),
    hour: readPart(parts, "hour"),
    minute: readPart(parts, "minute"),
    second: readPart(parts, "second"),
  };
}

function getPortugalOffsetMs(value: Date): number {
  const parts = getPartsAtInstant(value);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const valueWithoutMilliseconds = Math.trunc(value.getTime() / 1000) * 1000;
  return representedAsUtc - valueWithoutMilliseconds;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day;
}

export function portugalLocalDateTimeToUtc(parts: PortugalDateTimeParts): Date {
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const millisecond = parts.millisecond ?? 0;

  if (
    !isValidCalendarDate(parts.year, parts.month, parts.day) ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59 ||
    second < 0 || second > 59 ||
    millisecond < 0 || millisecond > 999
  ) {
    throw new RangeError("Invalid Portugal date/time");
  }

  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
    second,
    millisecond,
  );

  let resolvedMs = wallClockAsUtc -
    getPortugalOffsetMs(new Date(wallClockAsUtc));

  // A second pass handles dates close to daylight-saving transitions.
  resolvedMs = wallClockAsUtc - getPortugalOffsetMs(new Date(resolvedMs));
  const resolved = new Date(resolvedMs);
  const resolvedParts = getPartsAtInstant(resolved);

  if (
    resolvedParts.year !== parts.year ||
    resolvedParts.month !== parts.month ||
    resolvedParts.day !== parts.day ||
    resolvedParts.hour !== hour ||
    resolvedParts.minute !== minute ||
    resolvedParts.second !== second
  ) {
    throw new RangeError("Portugal date/time does not map to a valid instant");
  }

  return resolved;
}

export function portugalLocalDateTimeToIso(parts: PortugalDateTimeParts): string {
  return portugalLocalDateTimeToUtc(parts).toISOString();
}

export function endOfPortugalDateToIso(dateOnly: string): string | null {
  const match = dateOnly.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  try {
    return portugalLocalDateTimeToIso({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: 23,
      minute: 59,
      second: 59,
    });
  } catch {
    return null;
  }
}

export function addDaysToPortugalDateEnd(
  dateOnly: string,
  days: number,
): string | null {
  const match = dateOnly.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !Number.isInteger(days)) return null;

  const base = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ));
  if (
    base.getUTCFullYear() !== Number(match[1]) ||
    base.getUTCMonth() !== Number(match[2]) - 1 ||
    base.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }

  base.setUTCDate(base.getUTCDate() + days);
  return portugalLocalDateTimeToIso({
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
    hour: 23,
    minute: 59,
    second: 59,
  });
}

export function isDeadlineExpired(
  deadlineAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!deadlineAt) return false;
  const deadlineMs = Date.parse(deadlineAt);
  return Number.isFinite(deadlineMs) && deadlineMs < nowMs;
}

export function portugalDateKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = portugalDatePartsFormatter.formatToParts(date);
  const read = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function calendarDaysUntilDeadlineInPortugal(
  deadlineAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!deadlineAt) return null;
  const deadlineKey = portugalDateKey(deadlineAt);
  const todayKey = portugalDateKey(now);
  if (!deadlineKey || !todayKey) return null;

  const toUtcDay = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };

  return Math.round((toUtcDay(deadlineKey) - toUtcDay(todayKey)) / 86_400_000);
}

export function formatPortugalDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : portugalDateFormatter.format(date);
}

export function formatPortugalDateTime(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : portugalDateTimeFormatter.format(date);
}
