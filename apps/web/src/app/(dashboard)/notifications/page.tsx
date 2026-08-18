import { createClient } from "@/lib/supabase/server";
import NotificationsManager from "@/components/NotificationsManager";
import PageHeader from "@/components/layout/PageHeader";
import { Bell } from "lucide-react";
import {
  notificationPageKey,
  parseNotificationSearchParams,
  type NotificationSearchParams,
} from "@/lib/notifications-navigation";
import { throwIfNotificationQueryError } from "@/lib/notification-history";

const PAGE_SIZE = 30;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<NotificationSearchParams>;
}) {
  const requested = parseNotificationSearchParams(await searchParams);
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  throwIfNotificationQueryError(authError, "Não foi possível autenticar o utilizador das notificações");
  const user = authData.user;
  if (!user) throw new Error("Não foi possível autenticar o utilizador das notificações");

  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();
  throwIfNotificationQueryError(appUserError, "Não foi possível carregar o utilizador das notificações");

  let countQuery = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true });
  if (appUser?.tenant_id) countQuery = countQuery.eq("tenant_id", appUser.tenant_id);
  if (requested.status) countQuery = countQuery.eq("status", requested.status);

  const { count, error: countError } = await countQuery;
  throwIfNotificationQueryError(countError, "Não foi possível contar as notificações");

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(requested.page, totalPages);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let dataQuery = supabase
    .from("notifications")
    .select(
      `id, status, channel, sent_at, error, created_at,
       clients (name, email),
       announcements (title, publication_date)`,
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (appUser?.tenant_id) dataQuery = dataQuery.eq("tenant_id", appUser.tenant_id);
  if (requested.status) dataQuery = dataQuery.eq("status", requested.status);

  const { data: notifications, error: dataError } = await dataQuery;
  throwIfNotificationQueryError(dataError, "Não foi possível carregar as notificações");

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Bell}
        title="Notificações"
        description={`${totalCount} notificações`}
      />
      <NotificationsManager
        key={notificationPageKey(requested.status, page)}
        notifications={(notifications ?? []) as unknown as Parameters<typeof NotificationsManager>[0]["notifications"]}
        statusFilter={requested.status}
        page={page}
        totalPages={totalPages}
        canManage={appUser?.role === "admin" || appUser?.role === "operator"}
      />
    </div>
  );
}
