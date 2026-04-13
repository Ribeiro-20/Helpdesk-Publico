import { createClient } from "@/lib/supabase/server";
import NotificationsManager from "@/components/NotificationsManager";
import PageHeader from "@/components/layout/PageHeader";
import { Bell } from "lucide-react";

const PAGE_SIZE = 30;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id")
    .maybeSingle();

  let query = supabase
    .from("notifications")
    .select(
      `id, status, channel, sent_at, error, created_at,
       clients (name, email),
       announcements (title, publication_date)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (appUser?.tenant_id) query = query.eq("tenant_id", appUser.tenant_id);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: notifications, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Bell}
        title="Notificações"
        description={`${count ?? 0} notificações`}
      />
      <NotificationsManager
        notifications={(notifications ?? []) as unknown as Parameters<typeof NotificationsManager>[0]["notifications"]}
        statusFilter={statusFilter}
        page={page}
        totalPages={totalPages}
      />
    </div>
  );
}
