import { createClient } from "@/lib/supabase/server";
import AdminActions from "@/components/AdminActions";
import PageHeader from "@/components/layout/PageHeader";
import Link from "next/link";
import { BellRing, Settings } from "lucide-react";

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-2 text-sm border-b border-surface-100 last:border-0 sm:flex-row sm:gap-4">
      <span className="text-gray-400 font-medium sm:w-32 sm:shrink-0">{label}</span>
      <span className={`text-gray-900 min-w-0 ${mono ? "inline-block max-w-full break-all font-mono text-xs bg-surface-50 px-2 py-1 rounded" : "break-words"}`}>
        {value}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id, role, tenants (name)")
    .eq("id", user!.id)
    .maybeSingle();

  const isInitialised = !!appUser;
  const isAdmin = appUser?.role === "admin";
  const tenant = appUser?.tenants as unknown as { name: string } | null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="Definições"
        description="Informações do sistema e ações de administração"
      />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {/* User info */}
        <div className="bg-white border border-surface-200 rounded-xl p-4 sm:p-6 shadow-card">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            Utilizador
          </h2>
          <div>
            <Field label="Email" value={user?.email ?? ""} />
            <Field label="Papel" value={appUser?.role ?? "—"} />
            <Field label="Tenant" value={tenant?.name ?? "—"} />
            <Field label="Tenant ID" value={appUser?.tenant_id ?? "—"} mono />
            <Field label="User ID" value={user?.id ?? "—"} mono />
          </div>
        </div>

        {/* System info */}
        <div className="bg-white border border-surface-200 rounded-xl p-4 sm:p-6 shadow-card">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Ambiente
          </h2>
          <div>
            <Field
              label="Supabase URL"
              value={process.env.NEXT_PUBLIC_SUPABASE_URL ?? "—"}
              mono
            />
            <Field
              label="App URL"
              value={process.env.NEXT_PUBLIC_APP_BASE_URL ?? "—"}
              mono
            />
          </div>
        </div>
      </div>

      {/* Not initialised banner */}
      {!isInitialised && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-amber-900">
            Sistema não inicializado
          </h2>
          <p className="text-amber-700 text-sm">
            Clique no botão abaixo para criar o tenant &ldquo;Default&rdquo; e
            configurar este utilizador como administrador.
          </p>
          <AdminActions isInitialised={false} actions={[]} />
        </div>
      )}

      {/* Admin actions */}
      {isAdmin && (
        <div className="bg-white border border-surface-200 rounded-xl p-4 sm:p-6 shadow-card space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1">
                Ações de Administração
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Operações manuais para testes e manutenção.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:w-auto md:justify-end">
              <Link
                href="/settings/historico-ingestao"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-brand-700 shadow-sm hover:shadow-md sm:w-auto"
              >
                Registo de Sistema
              </Link>
              <Link
                href="/settings/alertas-sistema"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-brand-200 hover:text-brand-700 sm:w-auto"
              >
                <BellRing className="h-4 w-4" />
                Alertas do sistema
              </Link>
            </div>
          </div>
          <AdminActions
            isInitialised={isInitialised}
            actions={[
              {
                fn: "ingest-base",
                label: "Ingerir Anúncios",
                variant: "primary",
                body: { dry_run: false },
              },
              {
                fn: "delete-announcements",
                label: "Apagar Anúncios (intervalo)",
                variant: "primary",
              },
              {
                fn: "delete-announcement-versions",
                label: "Apagar histórico de versões",
                variant: "primary",
              },
              {
                fn: "ingest-contracts",
                label: "Ingerir Contratos",
                variant: "primary",
                body: { dry_run: false },
              },
              {
                fn: "extract-entities",
                label: "Extrair Entidades",
                variant: "primary",
              },
              {
                fn: "extract-companies",
                label: "Extrair Empresas",
                variant: "primary",
              },
              {
                fn: "match-and-queue",
                label: "Processar Correspondência CPV",
                variant: "primary",
              },
              {
                fn: "send-emails",
                label: "Enviar Emails Pendentes",
                variant: "primary",
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
