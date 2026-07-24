import {
  portugalLocalDateTimeToIso,
} from "../../supabase/functions/_shared/portugalTime.ts";

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toPortugalDeadlineIso(
  year: string,
  month: string,
  day: string,
  hour?: string,
  minute?: string,
): string | null {
  try {
    return portugalLocalDateTimeToIso({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: hour === undefined ? 23 : Number(hour),
      minute: minute === undefined ? 59 : Number(minute),
      second: hour === undefined ? 59 : 0,
    });
  } catch {
    return null;
  }
}

export function extractDeadlineAtFromDrText(text: string): string | null {
  const normalized = stripDiacritics(text);
  const pt = normalized.match(
    /Prazo\s*para\s*apresentacao\s*das\s*propostas\s*:\s*(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s+(\d{2}):(\d{2}))?/i,
  );
  if (pt) {
    return toPortugalDeadlineIso(pt[3], pt[2], pt[1], pt[4], pt[5]);
  }

  const iso = normalized.match(
    /Prazo\s*para\s*apresentacao\s*das\s*propostas\s*:\s*(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/i,
  );
  if (iso) {
    return toPortugalDeadlineIso(iso[1], iso[2], iso[3], iso[4], iso[5]);
  }

  return null;
}
