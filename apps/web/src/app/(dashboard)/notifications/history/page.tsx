import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import EmailHistoryView from "@/components/EmailHistoryView";
import { Mail } from "lucide-react";

const TIME_ZONE = "Europe/Lisbon";
const FETCH_BATCH_SIZE = 1000;

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

function formatCalendarDate(date: CalendarDate): string {
  return [
    date.year,
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  ].join("-");
}

function getCalendarDate(value: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
  };
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

  const representedAsUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );

  return representedAsUtc - value.getTime();
}

function localMidnightToUtc(date: CalendarDate, timeZone: string): Date {
  const midnightAsUtc = Date.UTC(date.year, date.month - 1, date.day);
  let resolved = midnightAsUtc - getTimeZoneOffsetMs(new Date(midnightAsUtc), timeZone);

  // Recalculate once using the resolved instant to cover daylight-saving changes.
  resolved = midnightAsUtc - getTimeZoneOffsetMs(new Date(resolved), timeZone);
  return new Date(resolved);
}

function getCurrentWeekBounds(now = new Date()) {
  const today = getCalendarDate(now, TIME_ZONE);
  const todayAsUtc = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const daysSinceMonday = (todayAsUtc.getUTCDay() + 6) % 7;

  const mondayAsUtc = new Date(todayAsUtc);
  mondayAsUtc.setUTCDate(todayAsUtc.getUTCDate() - daysSinceMonday);

  const nextMondayAsUtc = new Date(mondayAsUtc);
  nextMondayAsUtc.setUTCDate(mondayAsUtc.getUTCDate() + 7);

  const monday = {
    year: mondayAsUtc.getUTCFullYear(),
    month: mondayAsUtc.getUTCMonth() + 1,
    day: mondayAsUtc.getUTCDate(),
  };
  const nextMonday = {
    year: nextMondayAsUtc.getUTCFullYear(),
    month: nextMondayAsUtc.getUTCMonth() + 1,
    day: nextMondayAsUtc.getUTCDate(),
  };

  return {
    start: localMidnightToUtc(monday, TIME_ZONE).toISOString(),
    end: localMidnightToUtc(nextMonday, TIME_ZONE).toISOString(),
    startDate: formatCalendarDate(monday),
    currentDate: formatCalendarDate(today),
  };
}

export default async function NotificationsHistoryPage() {
  const supabase = await createClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id")
    .maybeSingle();

  const week = getCurrentWeekBounds();
  const notifications: unknown[] = [];

  for (let from = 0; ; from += FETCH_BATCH_SIZE) {
    let query = supabase
      .from("notifications")
      .select(
        `id, status, channel, sent_at, error, created_at,
         clients (name, email),
         announcements (title, publication_date, description, detail_url, dr_announcement_no, base_announcement_id, raw_payload)`,
      )
      .or(
        `and(sent_at.gte.${week.start},sent_at.lt.${week.end}),and(sent_at.is.null,created_at.gte.${week.start},created_at.lt.${week.end})`,
      )
      .order("created_at", { ascending: false })
      .range(from, from + FETCH_BATCH_SIZE - 1);

    if (appUser?.tenant_id) {
      query = query.eq("tenant_id", appUser.tenant_id);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[notifications-history] Failed to load current week:", error);
      break;
    }

    notifications.push(...(data ?? []));
    if ((data?.length ?? 0) < FETCH_BATCH_SIZE) break;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Mail}
        title="Histórico de envios"
        description={`${notifications.length} envio(s) esta semana`}
        backHref="/notifications"
        backLabel="Voltar"
        size="detail"
      />
      <EmailHistoryView
        notifications={notifications as any}
        weekStart={week.startDate}
        weekEnd={week.currentDate}
      />
    </div>
  );
}
