import { createClient } from "@/lib/supabase/server";
import ClientsManager from "../../../components/ClientsManager";
import PageHeader from "@/components/layout/PageHeader";
import { Users } from "lucide-react";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id, role")
    .maybeSingle();

  const { data: clients } = await supabase
    .from("clients")
    .select(
      "id, name, company_name, cpv_s_alerta_concursos_publicos, notification_regions, contact_name, phone, email, is_active, notify_mode, max_emails_per_day, created_at, client_cpv_rules (id, pattern, match_type, is_exclusion)",
    )
    .order("created_at", { ascending: false });

  const isAdmin =
    appUser?.role === "admin" || appUser?.role === "operator";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title="Clientes"
        description={`${clients?.length ?? 0} cliente${(clients?.length ?? 0) !== 1 ? "s" : ""}`}
      />
      <ClientsManager
        initialClients={(clients ?? []) as Parameters<typeof ClientsManager>[0]["initialClients"]}
        tenantId={appUser?.tenant_id ?? ""}
        isAdmin={isAdmin}
      />
    </div>
  );
}
