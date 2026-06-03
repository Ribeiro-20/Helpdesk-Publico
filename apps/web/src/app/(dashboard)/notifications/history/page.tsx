import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import EmailHistoryView from "@/components/EmailHistoryView";
import { Mail } from "lucide-react";

const PAGE_SIZE = 200;

export default async function NotificationsHistoryPage() {
  const supabase = await createClient();

  const { data: appUser } = await supabase.from("app_users").select("tenant_id").maybeSingle();

  let query = supabase
    .from("notifications")
    .select(`id, status, channel, sent_at, error, created_at, clients (name, email), announcements (title, publication_date, description, detail_url, raw_payload)`)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (appUser?.tenant_id) query = query.eq("tenant_id", appUser.tenant_id);

  const { data: notifications } = await query;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Mail}
        title="Histórico de envios"
        description={`Últimos ${notifications?.length ?? 0} envios`}
        backHref="/notifications"
        backLabel="Voltar"
        size="detail"
      />
      <EmailHistoryView notifications={(notifications ?? []) as any} />
    </div>
  );
}
