"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CpvSearchInput, { type CpvCode } from "./CpvSearchInput";
import { Mail, Phone, UserRound, X } from "lucide-react";

type CpvRule = {
  id: string;
  pattern: string;
  match_type: "EXACT" | "PREFIX";
  is_exclusion: boolean;
};

type Client = {
  id: string;
  name: string;
  company_name: string | null;
  cpv_s_alerta_concursos_publicos: string | null;
  notification_regions: string[] | null;
  contact_name: string | null;
  phone: string | null;
  email: string;
  is_active: boolean;
  notify_mode: string;
  max_emails_per_day: number;
  created_at: string;
  client_cpv_rules: CpvRule[];
};

const INPUT =
  "w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all bg-white";
const LABEL = "block text-xs font-medium text-gray-400 mb-1.5";

const CLASSIFICATION_OPTIONS = [
  { value: "adjudicante", label: "Adjudicante" },
  { value: "adjudicatario", label: "Adjudicatário" },
];

const COUNTRY_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "portugal", label: "Portugal" },
];

const SUBSCRIPTION_TYPE_OPTIONS = [
  { value: "nenhuma", label: "Nenhuma" },
  { value: "mensal", label: "Mensal" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

const DISTRICT_OPTIONS = [
  "Aveiro",
  "Beja",
  "Braga",
  "Bragança",
  "Castelo Branco",
  "Coimbra",
  "Évora",
  "Faro",
  "Guarda",
  "Leiria",
  "Lisboa",
  "Portalegre",
  "Porto",
  "Santarém",
  "Setúbal",
  "Viana do Castelo",
  "Vila Real",
  "Viseu",
  "Região Autónoma dos Açores",
  "Região Autónoma da Madeira",
];

const REGION_OPTIONS = ["Todos", ...DISTRICT_OPTIONS];

function normalizeRegion(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeClientRegions(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value) || value.length === 0) return ["Todos"];

  const mapped = value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .map((item) => {
      const normalized = normalizeRegion(item);
      if (normalized === "todos") return "Todos";
      const match = REGION_OPTIONS.find((option) => normalizeRegion(option) === normalized);
      return match ?? item;
    });

  if (mapped.some((item) => normalizeRegion(item) === "todos")) return ["Todos"];
  return [...new Set(mapped)];
}

function splitContactName(contactName: string | null) {
  if (!contactName) return { firstName: "", lastName: "" };
  const parts = contactName.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function getMultiValues(fd: FormData, key: string) {
  return fd
    .getAll(key)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function normalizeCpvPattern(input: string): string {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return "";
  const idx = trimmed.indexOf(" - ");
  return (idx === -1 ? trimmed : trimmed.slice(0, idx)).trim();
}

function inferManualMatchType(pattern: string): "EXACT" | "PREFIX" {
  const normalized = normalizeCpvPattern(pattern).replace(/\*+$/, "");
  const digits = normalized.replace(/\D/g, "");
  if (pattern.trim().endsWith("*")) return "PREFIX";
  return digits.length >= 8 ? "EXACT" : "PREFIX";
}

function hasInclusionRule(client: Client): boolean {
  return client.client_cpv_rules.some((rule) => !rule.is_exclusion);
}

function getEffectiveRuleCount(client: Client): number {
  if (!client.cpv_s_alerta_concursos_publicos) return client.client_cpv_rules.length;
  if (hasInclusionRule(client)) return client.client_cpv_rules.length;
  return client.client_cpv_rules.length + 1;
}

function ClientForm({
  onSubmit,
  loading,
  error,
  onCancel,
  initialData,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  initialData?: Client;
}) {
  const isEdit = !!initialData;
  const { firstName, lastName } = splitContactName(initialData?.contact_name ?? null);
  const defaultClassification: string[] = [];
  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-surface-200 rounded-xl shadow-card p-5 space-y-4"
    >
      <h3 className="font-semibold text-gray-900">
        {isEdit ? "Editar Cliente" : "Novo Cliente"}
      </h3>

      <div className="space-y-4">
        {/* ── EMPRESA ── */}
        <section className="border border-surface-200 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Empresa</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className={LABEL}>Nome da empresa *</label>
              <input
                name="company_name"
                required
                className={INPUT}
                placeholder="Empresa, Lda."
                defaultValue={initialData?.company_name ?? ""}
              />
            </div>

            <div>
              <label className={LABEL}>País *</label>
              <select name="pais" required className={INPUT} defaultValue="todos">
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={LABEL}>Distrito *</label>
              <select name="distrito" required className={INPUT} defaultValue="">
                <option value="" disabled>
                  Selecione um distrito
                </option>
                <option value="todos">Todos</option>
                {DISTRICT_OPTIONS.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL}>NIPC *</label>
              <input
                name="entity_nipc"
                required
                className={INPUT}
                placeholder="509123456"
                defaultValue=""
              />
            </div>
          </div>
        </section>

        {/* ── CLIENTE ── */}
        <section className="border border-surface-200 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cliente</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2 flex flex-col md:flex-row gap-3 md:max-w-[560px]">
              <div className="flex-1 min-w-0">
                <label className={LABEL}>Nome *</label>
                <input
                  name="firstname"
                  required
                  className={INPUT}
                  placeholder="João"
                  defaultValue={firstName}
                />
              </div>
              <div className="flex-1 min-w-0">
                <label className={LABEL}>Sobrenome *</label>
                <input
                  name="lastname"
                  required
                  className={INPUT}
                  placeholder="Silva"
                  defaultValue={lastName}
                />
              </div>
            </div>

            <div className="md:col-span-2 md:max-w-[560px]">
              <label className={LABEL}>Número de telefone *</label>
              <input
                name="phone_number"
                required
                className={INPUT}
                placeholder="912345678"
                defaultValue={initialData?.phone ?? ""}
              />
            </div>

            <div className="md:col-span-2">
              <label className={LABEL}>E-mail *</label>
              <input
                name="email"
                type="email"
                required
                className={INPUT}
                placeholder="contacto@empresa.pt"
                defaultValue={initialData?.email ?? ""}
              />
            </div>

            <div>
              <label className={LABEL}>Cargo *</label>
              <input
                name="position_title"
                required
                className={INPUT}
                placeholder="Diretor"
                defaultValue=""
              />
            </div>

            <div>
              <label className={LABEL}>Departamento</label>
              <input
                name="department"
                className={INPUT}
                placeholder="Compras"
                defaultValue=""
              />
            </div>

            <div className="md:col-span-2">
              <label className={LABEL}>CPV *</label>
              <input
                name="cpv_s_alerta_concursos_publicos"
                required
                className={INPUT}
                placeholder="Ex: 30192000-1"
                defaultValue={initialData?.cpv_s_alerta_concursos_publicos ?? ""}
              />
            </div>

            <div>
              <label className={LABEL}>Classificação *</label>
              <div className="space-y-1 pt-2">
                {CLASSIFICATION_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      name="classification"
                      value={option.value}
                      defaultChecked={defaultClassification.includes(option.value)}
                      className="h-4 w-4 rounded border-surface-300"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={LABEL}>Tipo de subscrição</label>
              <select name="tipo_subscricao" className={INPUT} defaultValue="nenhuma">
                {SUBSCRIPTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
        >
          {loading ? "A guardar..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium px-4 py-2.5 rounded-xl bg-white border border-surface-200 hover:bg-surface-50 transition-all shadow-card"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CpvRuleForm({
  onAdd,
}: {
  onAdd: (pattern: string, matchType: string, isExclusion: boolean) => Promise<void>;
}) {
  const [selected, setSelected] = useState<CpvCode[]>([]);
  const [manualPattern, setManualPattern] = useState("");
  const [isExclusion, setIsExclusion] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [adding, setAdding] = useState(false);

  function toggleCpv(cpv: CpvCode) {
    setSelected((prev) =>
      prev.some((c) => c.id === cpv.id)
        ? prev.filter((c) => c.id !== cpv.id)
        : [...prev, cpv],
    );
  }

  function removeSelected(id: string) {
    setSelected((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleSubmit() {
    if (manualMode) {
      if (!manualPattern.trim()) return;
      const normalizedPattern = normalizeCpvPattern(manualPattern);
      const matchType = inferManualMatchType(normalizedPattern);
      setAdding(true);
      await onAdd(normalizedPattern, matchType, isExclusion);
      setManualPattern("");
      setAdding(false);
      return;
    }
    if (selected.length === 0) return;
    setAdding(true);
    for (const cpv of selected) {
      await onAdd(cpv.id, "EXACT", isExclusion);
    }
    setSelected([]);
    setAdding(false);
  }

  return (
    <div className="pt-3 border-t border-surface-200 space-y-2">
      <div className="flex flex-wrap gap-2 items-end">
        {manualMode ? (
          <input
            value={manualPattern}
            onChange={(e) => setManualPattern(e.target.value)}
            placeholder="Ex: 71240000-2 ou 7124"
            className="border border-surface-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all min-w-[280px]"
          />
        ) : (
          <div className="min-w-[280px]">
            <CpvSearchInput
              selected={selected}
              onToggle={toggleCpv}
              className="border border-surface-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all w-full"
            />
          </div>
        )}
        <select
          value={String(isExclusion)}
          onChange={(e) => setIsExclusion(e.target.value === "true")}
          className="border border-surface-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
        >
          <option value="false">Inclusão</option>
          <option value="true">Exclusão</option>
        </select>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={adding || (manualMode ? !manualPattern.trim() : selected.length === 0)}
          className="bg-brand-600 text-white text-sm font-medium px-3.5 py-1.5 rounded-lg hover:bg-brand-700 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
        >
          {adding ? "A adicionar..." : `+ Adicionar${!manualMode && selected.length > 1 ? ` (${selected.length})` : ""}`}
        </button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((cpv) => (
            <span
              key={cpv.id}
              className="inline-flex items-center gap-1 bg-brand-50 text-brand-800 text-xs px-2 py-1 rounded-full border border-brand-200"
            >
              <span className="font-mono">{cpv.id}</span>
              <span className="text-brand-600 truncate max-w-[150px]">{cpv.descricao}</span>
              <button
                type="button"
                onClick={() => removeSelected(cpv.id)}
                className="inline-flex items-center justify-center text-brand-400 hover:text-brand-700 ml-0.5"
                aria-label="Remover CPV"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => { setManualMode(!manualMode); setManualPattern(""); setSelected([]); }}
        className="text-xs text-gray-400 hover:text-gray-600 underline"
      >
        {manualMode ? "Pesquisar CPV" : "Introduzir código manualmente"}
      </button>
    </div>
  );
}

export default function ClientsManager({
  initialClients,
  tenantId,
  isAdmin,
}: {
  initialClients: Client[];
  tenantId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [regionsExpandedId, setRegionsExpandedId] = useState<string | null>(null);
  const [regionDraft, setRegionDraft] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const { data } = await supabase
      .from("clients")
      .select(
        "id, name, company_name, cpv_s_alerta_concursos_publicos, notification_regions, contact_name, phone, email, is_active, notify_mode, max_emails_per_day, created_at, client_cpv_rules (id, pattern, match_type, is_exclusion)",
      )
      .order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
    router.refresh();
  }

  async function addClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const companyName = fd.get("company_name") as string;
    const cpvAlert = normalizeCpvPattern((fd.get("cpv_s_alerta_concursos_publicos") as string) || "");
    const firstName = ((fd.get("firstname") as string) || "").trim();
    const lastName = ((fd.get("lastname") as string) || "").trim();
    const countryCode = "PT";
    const phoneNumber = ((fd.get("phone_number") as string) || "").trim();
    const classification = getMultiValues(fd, "classification");
    if (classification.length === 0) {
      setLoading(false);
      setError("Selecione pelo menos uma opção em Classificação.");
      return;
    }
    const contactName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const phone = phoneNumber ? `${countryCode} ${phoneNumber}` : null;
    const { data: insertedClient, error: err } = await supabase.from("clients").insert({
      tenant_id: tenantId,
      name: companyName,
      company_name: companyName,
      cpv_s_alerta_concursos_publicos: cpvAlert || null,
      notification_regions: ["Todos"],
      contact_name: contactName,
      phone,
      email: fd.get("email") as string,
      notify_mode: "instant",
      max_emails_per_day: 20,
    }).select("id").single();
    setLoading(false);
    if (err) { setError(err.message); return; }

    if (cpvAlert && insertedClient?.id) {
      const { error: ruleErr } = await supabase
        .from("client_cpv_rules")
        .insert({
          tenant_id: tenantId,
          client_id: insertedClient.id,
          pattern: cpvAlert,
          match_type: "EXACT",
          is_exclusion: false,
        });

      if (ruleErr) {
        setError(`Cliente criado, mas falhou a criação da regra CPV: ${ruleErr.message}`);
      }
    }

    setShowForm(false);
    await reload();
  }

  async function updateClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingId) return;
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const companyName = fd.get("company_name") as string;
    const cpvAlert = normalizeCpvPattern((fd.get("cpv_s_alerta_concursos_publicos") as string) || "");
    const firstName = ((fd.get("firstname") as string) || "").trim();
    const lastName = ((fd.get("lastname") as string) || "").trim();
    const countryCode = "PT";
    const phoneNumber = ((fd.get("phone_number") as string) || "").trim();
    const classification = getMultiValues(fd, "classification");
    if (classification.length === 0) {
      setLoading(false);
      setError("Selecione pelo menos uma opção em Classificação.");
      return;
    }
    const contactName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const phone = phoneNumber ? `${countryCode} ${phoneNumber}` : null;
    const { error: err } = await supabase
      .from("clients")
      .update({
        name: companyName,
        company_name: companyName,
        cpv_s_alerta_concursos_publicos: cpvAlert || null,
        contact_name: contactName,
        phone,
        email: fd.get("email") as string,
        notify_mode: "instant",
      })
      .eq("id", editingId);
    setLoading(false);
    if (err) { setError(err.message); return; }

    if (cpvAlert) {
      const { data: existingRule, error: ruleLoadErr } = await supabase
        .from("client_cpv_rules")
        .select("id")
        .eq("client_id", editingId)
        .eq("pattern", cpvAlert)
        .eq("match_type", "EXACT")
        .eq("is_exclusion", false)
        .maybeSingle();

      if (ruleLoadErr) {
        setError(ruleLoadErr.message);
        setLoading(false);
        return;
      }

      if (!existingRule) {
        const { error: ruleInsertErr } = await supabase
          .from("client_cpv_rules")
          .insert({
            tenant_id: tenantId,
            client_id: editingId,
            pattern: cpvAlert,
            match_type: "EXACT",
            is_exclusion: false,
          });

        if (ruleInsertErr) {
          setError(`Cliente atualizado, mas falhou a criação da regra CPV: ${ruleInsertErr.message}`);
        }
      }
    }

    setEditingId(null);
    await reload();
  }

  async function toggleActive(client: Client) {
    await supabase.from("clients").update({ is_active: !client.is_active }).eq("id", client.id);
    await reload();
  }

  async function deleteClient(id: string) {
    if (!confirm("Eliminar cliente? Todas as regras CPV e notificações associadas serão eliminadas.")) return;
    await supabase.from("clients").delete().eq("id", id);
    await reload();
  }

  async function deleteRule(ruleId: string) {
    await supabase.from("client_cpv_rules").delete().eq("id", ruleId);
    await reload();
  }

  function openRegions(client: Client) {
    setRegionsExpandedId((prev) => (prev === client.id ? null : client.id));
    setRegionDraft((prev) => {
      if (prev[client.id]) return prev;
      return {
        ...prev,
        [client.id]: normalizeClientRegions(client.notification_regions),
      };
    });
  }

  function toggleRegion(clientId: string, region: string) {
    setRegionDraft((prev) => {
      const current = prev[clientId] ?? ["Todos"];
      const normalizedRegion = normalizeRegion(region);
      const hasRegion = current.some((item) => normalizeRegion(item) === normalizedRegion);

      if (normalizedRegion === "todos") {
        return { ...prev, [clientId]: ["Todos"] };
      }

      const withoutTodos = current.filter((item) => normalizeRegion(item) !== "todos");
      const next = hasRegion
        ? withoutTodos.filter((item) => normalizeRegion(item) !== normalizedRegion)
        : [...withoutTodos, region];

      return {
        ...prev,
        [clientId]: next.length > 0 ? next : ["Todos"],
      };
    });
  }

  async function saveRegions(clientId: string) {
    const selected = regionDraft[clientId] ?? ["Todos"];
    const payload = selected.some((item) => normalizeRegion(item) === "todos")
      ? ["Todos"]
      : selected;

    const { error: err } = await supabase
      .from("clients")
      .update({ notification_regions: payload })
      .eq("id", clientId);

    if (err) {
      setError(err.message);
      return;
    }

    await reload();
  }

  return (
    <div className="space-y-4">
      {isAdmin && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md"
        >
          + Novo Cliente
        </button>
      )}

      {showForm && (
        <ClientForm
          onSubmit={addClient}
          loading={loading}
          error={error}
          onCancel={() => { setShowForm(false); setError(null); }}
        />
      )}

      <div className="space-y-3">
        {clients.map((client) =>
          editingId === client.id ? (
            <ClientForm
              key={client.id}
              onSubmit={updateClient}
              loading={loading}
              error={error}
              onCancel={() => { setEditingId(null); setError(null); }}
              initialData={client}
            />
          ) : (
            <div key={client.id} className="bg-white border border-surface-200 rounded-xl shadow-card">
              <div className="flex items-start gap-4 px-5 py-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">
                      {client.company_name || client.name}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${client.is_active ? "bg-brand-50 text-brand-700 border border-brand-200" : "bg-surface-100 text-gray-400 border border-surface-200"}`}>
                      {client.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
                    {client.contact_name && (
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span>{client.contact_name}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span>{client.email}</span>
                    </span>
                    {client.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span>{client.phone}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <span className="text-xs bg-surface-100 text-gray-500 px-2 py-0.5 rounded-full border border-surface-200">
                      {client.notify_mode === "instant" ? "Imediato" : client.notify_mode === "daily_digest" ? "Resumo diário" : "Resumo semanal"}
                    </span>
                    <span className="text-xs bg-surface-100 text-gray-500 px-2 py-0.5 rounded-full border border-surface-200">
                      máx. {client.max_emails_per_day} emails/dia
                    </span>
                    <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-200 font-medium">
                      {getEffectiveRuleCount(client)} regra{getEffectiveRuleCount(client) !== 1 ? "s" : ""} CPV
                    </span>
                    <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-200 font-medium">
                      {normalizeClientRegions(client.notification_regions).some((r) => normalizeRegion(r) === "todos")
                        ? "todas as regiões"
                        : `${normalizeClientRegions(client.notification_regions).length} região${normalizeClientRegions(client.notification_regions).length !== 1 ? "es" : ""}`}
                    </span>
                    {client.cpv_s_alerta_concursos_publicos && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-mono">
                        CPV base: {client.cpv_s_alerta_concursos_publicos}
                      </span>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { setEditingId(client.id); setError(null); }}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700 bg-white border border-surface-200 px-2.5 py-1 rounded-lg transition-all shadow-card"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleActive(client)}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700 bg-white border border-surface-200 px-2.5 py-1 rounded-lg transition-all shadow-card"
                    >
                      {client.is_active ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-lg transition-all shadow-sm"
                    >
                      Regras CPV
                    </button>
                    <button
                      onClick={() => openRegions(client)}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-lg transition-all shadow-sm"
                    >
                      Região
                    </button>
                    <button
                      onClick={() => deleteClient(client.id)}
                      className="inline-flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors px-1.5 py-1"
                      aria-label="Eliminar cliente"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {expandedId === client.id && (
                <div className="border-t border-surface-200 px-5 py-4 bg-surface-50 space-y-3 rounded-b-xl">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400">Regras CPV</h4>

                  {client.client_cpv_rules.length === 0 ? (
                    client.cpv_s_alerta_concursos_publicos ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-brand-50 text-brand-700 border border-brand-200">
                            AUTO
                          </span>
                          <span className="text-xs font-mono bg-surface-100 px-2 py-0.5 rounded-md text-gray-500 border border-surface-200">
                            EXACT
                          </span>
                          <span className="font-mono text-gray-800 text-sm flex-1">
                            {client.cpv_s_alerta_concursos_publicos}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">
                          Regra automática a partir do CPV base do cliente.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Sem regras definidas</p>
                    )
                  ) : (
                    <div className="space-y-1.5">
                      {client.client_cpv_rules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-2 text-sm">
                          <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${rule.is_exclusion ? "bg-red-50 text-red-600 border border-red-200" : "bg-brand-50 text-brand-700 border border-brand-200"}`}>
                            {rule.is_exclusion ? "EXCL" : "INCL"}
                          </span>
                          <span className="text-xs font-mono bg-surface-100 px-2 py-0.5 rounded-md text-gray-500 border border-surface-200">
                            {rule.match_type}
                          </span>
                          <span className="font-mono text-gray-800 text-sm flex-1">
                            {rule.pattern}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => deleteRule(rule.id)}
                              className="inline-flex items-center justify-center text-red-400 hover:text-red-600 text-xs transition-colors"
                              aria-label="Eliminar regra CPV"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isAdmin && (
                    <CpvRuleForm
                      onAdd={async (pattern, matchType, isExclusion) => {
                        const { error: err } = await supabase.from("client_cpv_rules").insert({
                          tenant_id: tenantId,
                          client_id: client.id,
                          pattern,
                          match_type: matchType,
                          is_exclusion: isExclusion,
                        });
                        if (err) { setError(err.message); return; }
                        await reload();
                      }}
                    />
                  )}

                  {error && <p className="text-red-600 text-sm">{error}</p>}
                </div>
              )}

              {regionsExpandedId === client.id && (
                <div className="border-t border-surface-200 px-5 py-4 bg-surface-50 space-y-3 rounded-b-xl">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400">Regiões</h4>

                  <div className="flex flex-wrap gap-2">
                    {REGION_OPTIONS.map((region) => {
                      const selected = (regionDraft[client.id] ?? normalizeClientRegions(client.notification_regions))
                        .some((item) => normalizeRegion(item) === normalizeRegion(region));

                      return (
                        <button
                          key={region}
                          type="button"
                          onClick={() => toggleRegion(client.id, region)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-all ${selected
                            ? "bg-brand-50 text-brand-700 border-brand-300"
                            : "bg-white text-gray-500 border-surface-200 hover:border-gray-300"
                            }`}
                        >
                          {region}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => saveRegions(client.id)}
                      className="bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-all shadow-sm"
                    >
                      Guardar regiões
                    </button>
                  </div>

                  {error && <p className="text-red-600 text-sm">{error}</p>}
                </div>
              )}
            </div>
          )
        )}

        {clients.length === 0 && (
          <div className="bg-white border border-surface-200 rounded-xl shadow-card px-5 py-12 text-center text-gray-400">
            Nenhum cliente. Clique em &ldquo;+ Novo Cliente&rdquo; para adicionar.
          </div>
        )}
      </div>
    </div>
  );
}
