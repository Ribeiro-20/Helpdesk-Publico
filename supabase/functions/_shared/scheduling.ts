const LISBON_TIMEZONE = "Europe/Lisbon";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getDatePartsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const valueOf = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: valueOf("year"),
    month: valueOf("month"),
    day: valueOf("day"),
    hour: valueOf("hour"),
    minute: valueOf("minute"),
    second: valueOf("second"),
  };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);

  // Iterate to account for timezone offsets and DST transitions.
  for (let i = 0; i < 4; i++) {
    const observed = getDatePartsInTimeZone(new Date(utcMillis), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = targetAsUtc - observedAsUtc;
    if (diff === 0) break;
    utcMillis += diff;
  }

  return new Date(utcMillis);
}

export function getNextBusinessDay10am(baseDate: Date = new Date()): string {
  const dateOnly = getDatePartsInTimeZone(baseDate, LISBON_TIMEZONE);
  const nextDayUtcNoon = new Date(Date.UTC(dateOnly.year, dateOnly.month - 1, dateOnly.day + 1, 12, 0, 0));

  let candidate = getDatePartsInTimeZone(nextDayUtcNoon, LISBON_TIMEZONE);
  while (true) {
    const weekday = new Date(Date.UTC(candidate.year, candidate.month - 1, candidate.day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) break;
    const advancedUtcNoon = new Date(Date.UTC(candidate.year, candidate.month - 1, candidate.day + 1, 12, 0, 0));
    candidate = getDatePartsInTimeZone(advancedUtcNoon, LISBON_TIMEZONE);
  }

  const scheduled = zonedDateTimeToUtc(
    candidate.year,
    candidate.month,
    candidate.day,
    8,
    30,
    0,
    LISBON_TIMEZONE,
  );

  return scheduled.toISOString();
}

export function getLisbonDayRangeUtc(baseDate: Date = new Date()): {
  startIso: string;
  endIso: string;
} {
  const parts = getDatePartsInTimeZone(baseDate, LISBON_TIMEZONE);
  const start = zonedDateTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    0,
    0,
    0,
    LISBON_TIMEZONE,
  );
  const end = zonedDateTimeToUtc(
    parts.year,
    parts.month,
    parts.day + 1,
    0,
    0,
    0,
    LISBON_TIMEZONE,
  );

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
