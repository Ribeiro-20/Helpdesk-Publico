import { createClient } from "@/lib/supabase/server";
import AdminActions from "@/components/AdminActions";

export const dynamic = "force-dynamic";

function KpiCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number | string;
  variant?: "default" | "warning" | "success" | "danger";
}) {
  const styles = {
    default: "bg-white border-surface-200",
    warning: "bg-amber-50/60 border-amber-200/60",
    success: "bg-brand-50/60 border-brand-200/60",
    danger: "bg-red-50/60 border-red-200/60",
  };

  return (
    <div className={`rounded-xl border p-5 shadow-card ${styles[variant]}`}>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id, role")
    .eq("id", user!.id)
    .maybeSingle();

  const isInitialised = !!appUser;
  const isAdmin = appUser?.role === "admin" || appUser?.role === "operator";
  const tenantId = appUser?.tenant_id;

  let kpis = { ann24h: 0, ann7d: 0, pending: 0, sent: 0, failed: 0 };

  if (tenantId) {
    const now = new Date();
    const toDateStr = (d: Date) => d.toISOString().split("T")[0];
    const minus24h = toDateStr(new Date(now.getTime() - 24 * 3600 * 1000));
    const minus7d = toDateStr(new Date(now.getTime() - 7 * 24 * 3600 * 1000));

    const [a24, a7d, np, ns, nf] = await Promise.all([
      supabase
        .from("announcements")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("publication_date", minus24h),
      supabase
        .from("announcements")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("publication_date", minus7d),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "PENDING"),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "SENT"),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "FAILED"),
    ]);

    kpis = {
      ann24h: a24.count ?? 0,
      ann7d: a7d.count ?? 0,
      pending: np.count ?? 0,
      sent: ns.count ?? 0,
      failed: nf.count ?? 0,
    };
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Visão geral do sistema</p>
        </div>
        {isAdmin && (
          <AdminActions
            isInitialised={isInitialised}
            actions={[
              { fn: "ingest-base", label: "Ingerir Agora", variant: "primary" },
              { fn: "match-and-queue", label: "Processar CPV", variant: "secondary" },
              { fn: "send-emails", label: "Enviar Emails", variant: "secondary" },
            ]}
          />
        )}
      </div>

      {/* Warning when not initialised */}
      {!isInitialised && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
          <strong>Sistema não inicializado.</strong> Clique em{" "}
          <em>&quot;Inicializar Sistema&quot;</em> acima para criar o tenant e configurar
          o utilizador admin.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Anúncios (24h)" value={kpis.ann24h} />
        <KpiCard label="Anúncios (7d)" value={kpis.ann7d} />
        <KpiCard label="Pendentes" value={kpis.pending} variant="warning" />
        <KpiCard label="Enviadas" value={kpis.sent} variant="success" />
        <KpiCard label="Falhadas" value={kpis.failed} variant="danger" />
      </div>

      {isInitialised && (
        <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
          <h2 className="font-semibold text-gray-900 mb-3">
            Como começar
          </h2>
          <ol className="text-sm text-gray-500 space-y-2 list-decimal list-inside">
            <li>Clique <strong className="text-gray-700">Ingerir Agora</strong> para importar anúncios da BASE API</li>
            <li>Vá a <strong className="text-gray-700">Clientes</strong> e adicione um cliente com regras CPV</li>
            <li>Clique <strong className="text-gray-700">Processar CPV</strong> para fazer matching</li>
            <li>Clique <strong className="text-gray-700">Enviar Emails</strong> para notificar os clientes</li>
          </ol>
        </div>
      )}
    </div>
  );
}
