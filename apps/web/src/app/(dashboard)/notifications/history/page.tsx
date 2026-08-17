import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import EmailHistoryView from "@/components/EmailHistoryView";
import { Mail } from "lucide-react";
import {
  getLisbonDateBounds,
  historyViewKey,
  parseHistorySearchParams,
  throwIfNotificationQueryError,
  type HistorySearchParams,
} from "@/lib/notification-history";

const TIME_ZONE = "Europe/Lisbon";
const PAGE_SIZE = 25;

type CalendarDate = { year: number; month: number; day: number };
type HistoryRpcResult = {
  ids?: string[];
  total_count?: number;
  min_timestamp?: string | null;
};

function formatCalendarDate(date: CalendarDate): string {
  return [date.year.toString().padStart(4, "0"), date.month.toString().padStart(2, "0"), date.day.toString().padStart(2, "0")].join("-");
}

function getCalendarDate(value: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function getCurrentWeekStart(today: CalendarDate): CalendarDate {
  const todayAsUtc = new Date(Date.UTC(today.year, today.month - 1, today.day));
  return addCalendarDays(today, -((todayAsUtc.getUTCDay() + 6) % 7));
}

export default async function NotificationsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<HistorySearchParams>;
}) {
  const rawParams = await searchParams;
  const supabase = await createClient();
  const todayCalendar = getCalendarDate(new Date(), TIME_ZONE);
  const today = formatCalendarDate(todayCalendar);
  const defaultFromDate = formatCalendarDate(getCurrentWeekStart(todayCalendar));
  const requested = parseHistorySearchParams(rawParams, today, defaultFromDate);
  const bounds = getLisbonDateBounds(requested.fromDate, requested.toDate);

  const searchHistory = (page: number) => supabase.rpc("notification_history_search", {
    p_from: bounds.start,
    p_to: bounds.end,
    p_status: requested.status || null,
    p_search: requested.search || null,
    p_page: page,
    p_page_size: PAGE_SIZE,
  });

  let { data: rpcData, error: rpcError } = await searchHistory(requested.page);
  throwIfNotificationQueryError(rpcError, "Não foi possível pesquisar o histórico de notificações");
  let result = (rpcData ?? {}) as HistoryRpcResult;
  const totalCount = Number(result.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(requested.page, totalPages);

  if (page !== requested.page) {
    ({ data: rpcData, error: rpcError } = await searchHistory(page));
    throwIfNotificationQueryError(rpcError, "Não foi possível carregar a página do histórico de notificações");
    result = (rpcData ?? {}) as HistoryRpcResult;
  }

  const ids = Array.isArray(result.ids) ? result.ids.slice(0, PAGE_SIZE) : [];
  let notifications: unknown[] = [];
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("notifications")
      .select(
        `id, status, channel, sent_at, error, created_at,
         clients (name, email),
         announcements (title, publication_date, description, detail_url, dr_announcement_no, base_announcement_id, raw_payload)`,
      )
      .in("id", ids)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    throwIfNotificationQueryError(error, "Não foi possível carregar os registos do histórico de notificações");
    notifications = data ?? [];
  }

  const minDate = result.min_timestamp
    ? formatCalendarDate(getCalendarDate(new Date(result.min_timestamp), TIME_ZONE))
    : requested.fromDate;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Mail}
        title="Histórico de envios"
        description={`${totalCount} envio(s) entre ${requested.fromDate} e ${requested.toDate}`}
        backHref="/notifications"
        backLabel="Voltar"
        size="detail"
      />
      <EmailHistoryView
        key={historyViewKey({ ...requested, page })}
        notifications={notifications as Parameters<typeof EmailHistoryView>[0]["notifications"]}
        fromDate={requested.fromDate}
        toDate={requested.toDate}
        minDate={minDate}
        maxDate={today}
        statusFilter={requested.status}
        search={requested.search}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
      />
    </div>
  );
}
