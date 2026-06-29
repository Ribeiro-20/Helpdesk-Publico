import Link from "next/link";
import { BellRing, ShieldAlert } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type SearchParams = {
  saved?: string;
  error?: string;
};

type TenantUserRow = {
  id: string;
  role: string;
};

type UserOption = {
  id: string;
  email: string;
  role: string;
};

function decodeMessage(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function SystemAlertsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : (searchParams ?? {});
  const supabase = await createClient();
  const admin = await createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id, role")
    .eq("id", user!.id)
    .maybeSingle();

  const tenantId = appUser?.tenant_id ?? null;
  const isAdmin = appUser?.role === "admin";

  let tenantName = "—";
  let currentAlertEmail = "";
  const userOptions: UserOption[] = [];

  if (tenantId) {
    const { data: tenant } = await admin
      .from("tenants")
      .select("name, system_alert_email")
      .eq("id", tenantId)
      .maybeSingle();

    tenantName = tenant?.name ?? "—";
    currentAlertEmail = tenant?.system_alert_email ?? "";

    const { data: tenantUsers } = await admin
      .from("app_users")
      .select("id, role")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    const { data: authUsersPage } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    const authUserEmailById = new Map(
      (authUsersPage.users ?? [])
        .filter((authUser) => authUser.email)
        .map((authUser) => [authUser.id, authUser.email as string]),
    );

    for (const tenantUser of (tenantUsers ?? []) as TenantUserRow[]) {
      const email = authUserEmailById.get(tenantUser.id);
      if (!email) continue;
      userOptions.push({
        id: tenantUser.id,
        email,
        role: tenantUser.role,
      });
    }

    userOptions.sort((left, right) => left.email.localeCompare(right.email, "pt-PT"));

    if (currentAlertEmail && !userOptions.some((option) => option.email === currentAlertEmail)) {
      userOptions.unshift({
        id: "configured-email",
        email: currentAlertEmail,
        role: "configurado",
      });
    }
  }

  const successMessage = resolvedSearchParams.saved === "1"
    ? "Email de alerta do sistema atualizado com sucesso."
    : null;
  const errorMessage = decodeMessage(resolvedSearchParams.error);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BellRing}
        title="Alertas do sistema"
        description="Define quem recebe os emails automáticos quando houver falhas ou ingestões sem novos registos."
        backHref="/settings"
      />

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-surface-200 bg-white p-6 shadow-card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Destino dos alertas</h2>
            <p className="mt-1 text-sm text-gray-500">
              Configurado para: <span className="font-medium text-gray-700">{currentAlertEmail || "sem destinatário configurado"}</span>
            </p>
          </div>

          {isAdmin ? (
            <form action="/api/admin/system-alert-email" method="post" className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="system_alert_email" className="block text-sm font-medium text-gray-700">
                  Email que recebe os alertas
                </label>
                <input
                  id="system_alert_email"
                  name="system_alert_email"
                  defaultValue={currentAlertEmail}
                  type="email"
                  list="system-alert-email-options"
                  placeholder="nome@empresa.pt"
                  className="h-11 w-full rounded-xl border border-surface-200 bg-white px-3 text-sm text-gray-900 outline-none transition-all focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                />
                <datalist id="system-alert-email-options">
                  {userOptions.map((option) => (
                    <option key={`${option.id}:${option.email}`} value={option.email}>
                      {option.email} {option.role ? `(${option.role})` : ""}
                    </option>
                  ))}
                </datalist>
                <p className="text-xs text-gray-500">
                  Podes escrever qualquer email manualmente ou escolher um dos utilizadores sugeridos. Deixa vazio para desativar alertas por email.
                </p>
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-brand-700"
              >
                Guardar destino
              </button>
            </form>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Só administradores podem alterar este destino. O email atual é:
              <div className="mt-2 font-medium text-amber-900">{currentAlertEmail || "sem destinatário configurado"}</div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-surface-200 bg-white p-6 shadow-card space-y-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-brand-700" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Quando dispara</h2>
              <p className="mt-1 text-sm text-gray-500">
                O sistema envia email automático nestes casos.
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-sm text-gray-700">
            <li>Erro na ingestão automática, no envio automático de emails ou na sincronização HubSpot.</li>
            <li>Ingestão automática concluída com sucesso mas sem inserir novos registos na base de dados.</li>
          </ul>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            O destinatário é usado apenas para alertas internos do sistema. Não altera os emails enviados aos clientes.
          </div>

          <Link
            href="/settings"
            className="inline-flex items-center text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
          >
            Voltar às definições
          </Link>
        </div>
      </div>
    </div>
  );
}