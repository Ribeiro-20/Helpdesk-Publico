import { createClient } from "@/lib/supabase/server";
import AdminActions from "@/components/AdminActions";

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
    <div className="flex gap-4 text-sm py-2 border-b border-surface-100 last:border-0">
      <span className="text-gray-400 w-32 shrink-0 font-medium">{label}</span>
      <span className={`text-gray-900 ${mono ? "font-mono text-xs bg-surface-50 px-2 py-0.5 rounded" : ""}`}>
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Definições</h1>
        <p className="text-gray-400 text-sm mt-1">
          Informações do sistema e ações de administração
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User info */}
        <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
          <h2 className="font-semibold mb-4 text-xs uppercase tracking-wider text-gray-400">
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
        <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
          <h2 className="font-semibold text-xs uppercase tracking-wider text-gray-400 mb-4">
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
        <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card space-y-4">
          <div>
            <h2 className="font-semibold text-xs uppercase tracking-wider text-gray-400">
              Ações de Administração
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Operações manuais para testes e manutenção.
            </p>
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
                fn: "ingest-contracts",
                label: "Ingerir Contratos",
                variant: "primary",
                body: { dry_run: false },
              },
              {
                fn: "ingest-base",
                label: "Dry Run Anúncios",
                variant: "secondary",
                body: { dry_run: true },
              },
              {
                fn: "ingest-contracts",
                label: "Dry Run Contratos",
                variant: "secondary",
                body: { dry_run: true },
              },
              {
                fn: "ingest-contract-mods",
                label: "Ingerir Modificações",
                variant: "secondary",
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
                label: "Processar CPV Match",
                variant: "secondary",
              },
              {
                fn: "send-emails",
                label: "Enviar Emails Pendentes",
                variant: "secondary",
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
