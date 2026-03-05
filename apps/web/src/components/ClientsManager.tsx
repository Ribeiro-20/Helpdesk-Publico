"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CpvSearchInput, { type CpvCode } from "./CpvSearchInput";

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
  "w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all";
const LABEL = "block text-xs font-medium text-gray-400 mb-1.5";

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
  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-surface-200 rounded-xl shadow-card p-5 space-y-4"
    >
      <h3 className="font-semibold text-gray-900">
        {isEdit ? "Editar Cliente" : "Novo Cliente"}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Company */}
        <div className="md:col-span-2">
          <label className={LABEL}>Nome da Empresa *</label>
          <input name="company_name" required className={INPUT} placeholder="Empresa, Lda." defaultValue={initialData?.company_name ?? ""} />
        </div>

        {/* Contact person */}
        <div>
          <label className={LABEL}>Pessoa Responsável</label>
          <input name="contact_name" className={INPUT} placeholder="João Silva" defaultValue={initialData?.contact_name ?? ""} />
        </div>

        {/* Phone */}
        <div>
          <label className={LABEL}>Telemóvel</label>
          <input name="phone" type="tel" className={INPUT} placeholder="+351 912 345 678" defaultValue={initialData?.phone ?? ""} />
        </div>

        {/* Email */}
        <div className="md:col-span-2">
          <label className={LABEL}>Email *</label>
          <input name="email" type="email" required className={INPUT} placeholder="contacto@empresa.pt" defaultValue={initialData?.email ?? ""} />
        </div>

        {/* Notify mode */}
        <div>
          <label className={LABEL}>Modo de notificação</label>
          <select name="notify_mode" className={INPUT} defaultValue={initialData?.notify_mode ?? "instant"}>
            <option value="instant">Imediato</option>
            <option value="daily_digest">Resumo diário</option>
            <option value="weekly_digest">Resumo semanal</option>
          </select>
        </div>

        {/* Max emails */}
        <div>
          <label className={LABEL}>Máx. emails/dia</label>
          <input
            name="max_emails_per_day"
            type="number"
            defaultValue={initialData?.max_emails_per_day ?? 20}
            min="1"
            max="100"
            className={INPUT}
          />
        </div>
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
      setAdding(true);
      await onAdd(manualPattern.trim(), "PREFIX", isExclusion);
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

      {/* Selected CPVs chips */}
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
                className="text-brand-400 hover:text-brand-700 ml-0.5"
              >
                ✕
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
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function reload() {
    const { data } = await supabase
      .from("clients")
      .select(
        "id, name, company_name, contact_name, phone, email, is_active, notify_mode, max_emails_per_day, created_at, client_cpv_rules (id, pattern, match_type, is_exclusion)",
      )
      .order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
  }

  async function addClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const companyName = fd.get("company_name") as string;
    const { error: err } = await supabase.from("clients").insert({
      tenant_id: tenantId,
      name: companyName,
      company_name: companyName,
      contact_name: (fd.get("contact_name") as string) || null,
      phone: (fd.get("phone") as string) || null,
      email: fd.get("email") as string,
      notify_mode: fd.get("notify_mode") as string,
      max_emails_per_day: parseInt(fd.get("max_emails_per_day") as string) || 20,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
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
    const { error: err } = await supabase
      .from("clients")
      .update({
        name: companyName,
        company_name: companyName,
        contact_name: (fd.get("contact_name") as string) || null,
        phone: (fd.get("phone") as string) || null,
        email: fd.get("email") as string,
        notify_mode: fd.get("notify_mode") as string,
        max_emails_per_day: parseInt(fd.get("max_emails_per_day") as string) || 20,
      })
      .eq("id", editingId);
    setLoading(false);
    if (err) { setError(err.message); return; }
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

            {/* Client header */}
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
                    <span>👤 {client.contact_name}</span>
                  )}
                  <span>✉ {client.email}</span>
                  {client.phone && (
                    <span>📱 {client.phone}</span>
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
                    {client.client_cpv_rules.length} regra{client.client_cpv_rules.length !== 1 ? "s" : ""} CPV
                  </span>
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
                    onClick={() => deleteClient(client.id)}
                    className="text-xs text-gray-300 hover:text-red-500 transition-colors px-1.5 py-1"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* CPV rules panel */}
            {expandedId === client.id && (
              <div className="border-t border-surface-200 px-5 py-4 bg-surface-50 space-y-3 rounded-b-xl">
                <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400">Regras CPV</h4>

                {client.client_cpv_rules.length === 0 ? (
                  <p className="text-sm text-gray-400">Sem regras definidas</p>
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
                            className="text-red-400 hover:text-red-600 text-xs transition-colors"
                          >
                            ✕
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
