const NOTIFICATION_STATUSES = new Set([
  "",
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "SKIPPED",
  "RATE_LIMITED",
]);

const MAX_NOTIFICATION_PAGE = 10_000;

export type NotificationSearchParams = {
  status?: string;
  page?: string;
};

export function parseNotificationSearchParams(params: NotificationSearchParams) {
  const rawStatus = String(params.status ?? "").trim().toUpperCase();
  const status = NOTIFICATION_STATUSES.has(rawStatus) ? rawStatus : "";
  const rawPage = String(params.page ?? "1").trim();
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Math.min(MAX_NOTIFICATION_PAGE, Math.max(1, Number.isFinite(parsedPage) ? parsedPage : 1));
  return { status, page };
}

export function notificationPageKey(status: string, page: number): string {
  return `${status || "ALL"}:${Math.max(1, page)}`;
}

export function buildNotificationsHref(status: string, page: number): string {
  const params = new URLSearchParams({
    status,
    page: String(Math.max(1, page)),
  });
  return `/notifications?${params.toString()}`;
}
