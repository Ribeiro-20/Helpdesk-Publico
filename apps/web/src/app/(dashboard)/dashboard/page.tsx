import { createClient } from "@/lib/supabase/server";
import AdminActions from "@/components/AdminActions";
import PageHeader from "@/components/layout/PageHeader";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

export const dynamic = "force-dynamic";

function KpiCard({
  label,
  value,
  variant = "default",
  href,
}: {
  label: string;
  value: number | string;
  variant?: "default" | "warning" | "success" | "danger" | "brand";
  href?: string;
}) {
  const styles = {
    default: "bg-white border-surface-200",
    warning: "bg-amber-50/60 border-amber-200/60",
    success: "bg-brand-50/60 border-brand-200/60",
    danger: "bg-red-50/60 border-red-200/60",
    brand: "bg-brand-50/60 border-brand-200/60",
  };

  const inner = (
    <>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`block rounded-xl border p-5 shadow-card hover:shadow-md transition-shadow ${styles[variant]}`}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={`rounded-xl border p-5 shadow-card ${styles[variant]}`}>
      {inner}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="text-xs text-gray-400 mt-0.5">{description}</p>
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

  let announcements = { last24h: 0, last7d: 0, total: 0 };
  let contracts = { last7d: 0, last30d: 0, total: 0 };
  let notifications = { pending: 0, sent: 0, failed: 0 };
  let entities = { total: 0, municipios: 0 };
  let companies = { total: 0, withContracts: 0 };

  if (tenantId) {
    const now = new Date();
    const toDateStr = (d: Date) => d.toISOString().split("T")[0];
    const minus24h = toDateStr(new Date(now.getTime() - 24 * 3600 * 1000));
    const minus7d = toDateStr(new Date(now.getTime() - 7 * 24 * 3600 * 1000));
    const minus30d = toDateStr(new Date(now.getTime() - 30 * 24 * 3600 * 1000));

    const [a24, a7d, aTotal, c7d, c30d, cTotal, np, ns, nf, eTotal, eMunicipios, coTotal, coWithContracts] = await Promise.all([
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
        .from("announcements")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabase
        .from("contracts")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("publication_date", minus7d),
      supabase
        .from("contracts")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("publication_date", minus30d),
      supabase
        .from("contracts")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
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
      // Entity & company counts
      supabase
        .from("entities")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabase
        .from("entities")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("entity_type", "município"),
      supabase
        .from("companies")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabase
        .from("companies")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gt("contracts_won", 0),
    ]);

    announcements = {
      last24h: a24.count ?? 0,
      last7d: a7d.count ?? 0,
      total: aTotal.count ?? 0,
    };

    contracts = {
      last7d: c7d.count ?? 0,
      last30d: c30d.count ?? 0,
      total: cTotal.count ?? 0,
    };

    notifications = {
      pending: np.count ?? 0,
      sent: ns.count ?? 0,
      failed: nf.count ?? 0,
    };

    entities = {
      total: eTotal.count ?? 0,
      municipios: eMunicipios.count ?? 0,
    };

    companies = {
      total: coTotal.count ?? 0,
      withContracts: coWithContracts.count ?? 0,
    };
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Visão geral do sistema"
      />

      {/* Warning when not initialised */}
      {!isInitialised && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-amber-900">
              Sistema não inicializado
            </h2>
            <p className="text-amber-700 text-sm mt-1">
              Clique no botão abaixo para criar o tenant &ldquo;Default&rdquo; e
              configurar este utilizador como administrador.
            </p>
          </div>
          <AdminActions isInitialised={false} actions={[]} />
        </div>
      )}

      {isInitialised && (
        <>
          {/* Anúncios section */}
          <div className="space-y-3">
            <SectionHeader
              title="Anúncios"
              description="Procedimentos publicados no portal BASE (concursos, ajustes directos, etc.)"
            />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard label="Últimas 24h" value={announcements.last24h} href="/announcements" />
              <KpiCard label="Últimos 7 dias" value={announcements.last7d} href="/announcements" />
              <KpiCard label="Total" value={announcements.total.toLocaleString("pt-PT")} href="/announcements" />
            </div>
          </div>

          {/* Contratos section */}
          <div className="space-y-3">
            <SectionHeader
              title="Contratos"
              description="Contratos celebrados com vencedores e preços finais"
            />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard label="Últimos 7 dias" value={contracts.last7d} href="/contracts" />
              <KpiCard label="Últimos 30 dias" value={contracts.last30d} href="/contracts" />
              <KpiCard label="Total" value={contracts.total.toLocaleString("pt-PT")} href="/contracts" />
            </div>
          </div>

          {/* Entidades & Empresas section */}
          <div className="space-y-3">
            <SectionHeader
              title="Entidades & Empresas"
              description="Entidades públicas adjudicantes e empresas fornecedoras"
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Entidades" value={entities.total.toLocaleString("pt-PT")} href="/entities" />
              <KpiCard label="Municípios" value={entities.municipios.toLocaleString("pt-PT")} href="/entities" />
              <KpiCard label="Empresas" value={companies.total.toLocaleString("pt-PT")} href="/companies" />
              <KpiCard label="Com contratos" value={companies.withContracts.toLocaleString("pt-PT")} href="/companies" />
            </div>
          </div>

          {/* Notificacoes section */}
          <div className="space-y-3">
            <SectionHeader
              title="Notificações"
              description="Estado do envio de emails aos clientes"
            />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard label="Pendentes" value={notifications.pending} variant="warning" />
              <KpiCard label="Enviadas" value={notifications.sent} variant="success" />
              <KpiCard label="Falhadas" value={notifications.failed} variant="danger" />
            </div>
          </div>

          {/* Administração */}
          {isAdmin && (
            <div className="space-y-3">
              <SectionHeader
                title="Administração"
                description="Executar ingestão de dados e processos manuais"
              />
              <AdminActions
                isInitialised={isInitialised}
                actions={[
                  { fn: "ingest-base", label: "Ingerir Anúncios", variant: "primary" },
                  { fn: "ingest-contracts", label: "Ingerir Contratos", variant: "primary" },
                  { fn: "extract-entities", label: "Extrair Entidades", variant: "secondary" },
                  { fn: "extract-companies", label: "Extrair Empresas", variant: "secondary" },
                  { fn: "match-and-queue", label: "Processar CPV", variant: "secondary" },
                  { fn: "send-emails", label: "Enviar Emails", variant: "secondary" },
                ]}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
