"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
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
  entity_nipc?: string | null;
  distrito?: string | null;
  pais?: string | null;
  position_title?: string | null;
  department?: string | null;
  classification?: string[] | null;
  subscription_type?: string | null;
  cpv_s_alerta_concursos_publicos: string | null;
  notification_regions: string[] | null;
  contact_name: string | null;
  phone: string | null;
  email: string;
  is_active: boolean;
  notify_mode: string;
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

function normalizeDistrict(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isValidDistrictSelection(value: string): boolean {
  const normalized = normalizeDistrict(value);
  if (!normalized) return false;
  if (normalized === "todos") return true;
  return DISTRICT_OPTIONS.some((district) => normalizeDistrict(district) === normalized);
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
  return Array.from(new Set(mapped));
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

function normalizeDigits(value: string, maxDigits: number): string {
  return value.replace(/\D/g, "").slice(0, maxDigits);
}

function getNineDigitValidationMessage(rawValue: string, label: string): string | null {
  if (/\D/.test(rawValue)) return `${label} aceita apenas números.`;
  if (rawValue.length > 0 && rawValue.length < 9) return `${label} precisa de 9 dígitos.`;
  return null;
}

function sanitizeNameInput(rawValue: string): string {
  return rawValue.replace(/\d/g, "");
}

function getNameValidationMessage(rawValue: string, label: string): string | null {
  if (/\d/.test(rawValue)) return `${label} não aceita números.`;
  return null;
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
  const districtTypeaheadRef = useRef("");
  const districtTypeaheadTimeoutRef = useRef<number | null>(null);
  const { firstName: initialFirstName, lastName: initialLastName } = splitContactName(initialData?.contact_name ?? null);
  const defaultClassification: string[] = initialData?.classification ?? [];
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [positionTitle, setPositionTitle] = useState(initialData?.position_title ?? "");
  const [department, setDepartment] = useState(initialData?.department ?? "");
  const [entityNipc, setEntityNipc] = useState(() =>
    normalizeDigits(initialData?.entity_nipc ?? "", 9),
  );
  const [phoneNumber, setPhoneNumber] = useState(() =>
    normalizeDigits(initialData?.phone ? initialData.phone.replace(/^PT\s*/, "") : "", 9),
  );
  const [entityNipcError, setEntityNipcError] = useState<string | null>(null);
  const [phoneNumberError, setPhoneNumberError] = useState<string | null>(null);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [positionTitleError, setPositionTitleError] = useState<string | null>(null);
  const [departmentError, setDepartmentError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityNipcError) return;
    const timeoutId = window.setTimeout(() => setEntityNipcError(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [entityNipcError]);

  useEffect(() => {
    if (!phoneNumberError) return;
    const timeoutId = window.setTimeout(() => setPhoneNumberError(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [phoneNumberError]);

  useEffect(() => {
    if (!firstNameError) return;
    const timeoutId = window.setTimeout(() => setFirstNameError(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [firstNameError]);

  useEffect(() => {
    if (!lastNameError) return;
    const timeoutId = window.setTimeout(() => setLastNameError(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [lastNameError]);

  useEffect(() => {
    if (!positionTitleError) return;
    const timeoutId = window.setTimeout(() => setPositionTitleError(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [positionTitleError]);

  useEffect(() => {
    if (!departmentError) return;
    const timeoutId = window.setTimeout(() => setDepartmentError(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [departmentError]);

  function handleFirstNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setFirstName(sanitizeNameInput(raw));
    setFirstNameError(getNameValidationMessage(raw, "O nome"));
  }

  function handleLastNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setLastName(sanitizeNameInput(raw));
    setLastNameError(getNameValidationMessage(raw, "O sobrenome"));
  }

  function handlePositionTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setPositionTitle(sanitizeNameInput(raw));
    setPositionTitleError(getNameValidationMessage(raw, "O cargo"));
  }

  function handleDepartmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDepartment(sanitizeNameInput(raw));
    setDepartmentError(getNameValidationMessage(raw, "O departamento"));
  }

  function handleEntityNipcChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setEntityNipc(normalizeDigits(raw, 9));
    setEntityNipcError(getNineDigitValidationMessage(raw, "O NIPC"));
  }

  function handlePhoneNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setPhoneNumber(normalizeDigits(raw, 9));
    setPhoneNumberError(getNineDigitValidationMessage(raw, "O número de telefone"));
  }

  function handleDistrictKeyDown(e: React.KeyboardEvent<HTMLSelectElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;

    const options = ["todos", ...DISTRICT_OPTIONS];
    districtTypeaheadRef.current += e.key;
    const normalizedBuffer = normalizeDistrict(districtTypeaheadRef.current);

    const match = options.find((option) => normalizeDistrict(option).startsWith(normalizedBuffer));
    if (match) {
      e.currentTarget.value = match;
    }

    if (districtTypeaheadTimeoutRef.current) {
      window.clearTimeout(districtTypeaheadTimeoutRef.current);
    }
    districtTypeaheadTimeoutRef.current = window.setTimeout(() => {
      districtTypeaheadRef.current = "";
      districtTypeaheadTimeoutRef.current = null;
    }, 700);
  }

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
              <select name="pais" required className={INPUT} defaultValue={initialData?.pais ?? "todos"}>
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={LABEL}>Distrito *</label>
              <select
                name="distrito"
                required
                className={INPUT}
                defaultValue={initialData?.distrito ?? ""}
                onKeyDown={handleDistrictKeyDown}
              >
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
                inputMode="numeric"
                maxLength={9}
                minLength={9}
                pattern="\d{9}"
                title="O NIPC deve ter exatamente 9 dígitos."
                value={entityNipc}
                onChange={handleEntityNipcChange}
              />
              {entityNipcError && (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {entityNipcError}
                </p>
              )}
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
                  value={firstName}
                  onChange={handleFirstNameChange}
                />
                {firstNameError && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {firstNameError}
                  </p>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <label className={LABEL}>Sobrenome *</label>
                <input
                  name="lastname"
                  required
                  className={INPUT}
                  placeholder="Silva"
                  value={lastName}
                  onChange={handleLastNameChange}
                />
                {lastNameError && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {lastNameError}
                  </p>
                )}
              </div>
            </div>

            <div className="md:col-span-2 md:max-w-[560px]">
              <label className={LABEL}>Número de telefone *</label>
              <input
                name="phone_number"
                required
                className={INPUT}
                placeholder="912345678"
                inputMode="numeric"
                maxLength={9}
                minLength={9}
                pattern="\d{9}"
                title="O número de telefone deve ter exatamente 9 dígitos."
                value={phoneNumber}
                onChange={handlePhoneNumberChange}
              />
              {phoneNumberError && (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {phoneNumberError}
                </p>
              )}
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
                value={positionTitle}
                onChange={handlePositionTitleChange}
              />
              {positionTitleError && (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {positionTitleError}
                </p>
              )}
            </div>

            <div>
              <label className={LABEL}>Departamento</label>
              <input
                name="department"
                className={INPUT}
                placeholder="Compras"
                value={department}
                onChange={handleDepartmentChange}
              />
              {departmentError && (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {departmentError}
                </p>
              )}
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
              <select name="tipo_subscricao" className={INPUT} defaultValue={initialData?.subscription_type ?? "nenhuma"}>
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

  useEffect(() => {
    // Ensure we load fresh data when the component mounts (covers client-side navigation)
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    try {
      const res = await fetch("/api/clients");
      const json = await res.json();
      if (json?.ok && Array.isArray(json.data)) {
        setClients(json.data as Client[]);
      } else if (json?.error) {
        setError(json.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    router.refresh();
  }

  async function addClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const companyName = fd.get("company_name") as string;
    const cpvAlert = normalizeCpvPattern((fd.get("cpv_s_alerta_concursos_publicos") as string) || "");
    const entityNipc = normalizeDigits((fd.get("entity_nipc") as string) || "", 9);
    const distritoRaw = ((fd.get("distrito") as string) || "").trim();
    if (!isValidDistrictSelection(distritoRaw)) {
      setLoading(false);
      setError("Selecione um distrito válido da lista.");
      return;
    }
    const distrito = distritoRaw || null;
    const pais = ((fd.get("pais") as string) || "").trim() || null;
    const firstName = ((fd.get("firstname") as string) || "").trim();
    const lastName = ((fd.get("lastname") as string) || "").trim();
    if (/\d/.test(firstName)) {
      setLoading(false);
      setError("O nome não aceita números.");
      return;
    }
    if (/\d/.test(lastName)) {
      setLoading(false);
      setError("O sobrenome não aceita números.");
      return;
    }
    const positionTitle = ((fd.get("position_title") as string) || "").trim();
    const department = ((fd.get("department") as string) || "").trim();
    if (/\d/.test(positionTitle)) {
      setLoading(false);
      setError("O cargo não aceita números.");
      return;
    }
    if (department && /\d/.test(department)) {
      setLoading(false);
      setError("O departamento não aceita números.");
      return;
    }
    const countryCode = "PT";
    const phoneNumber = normalizeDigits((fd.get("phone_number") as string) || "", 9);
    if (entityNipc.length !== 9) {
      setLoading(false);
      setError("O NIPC deve ter exatamente 9 dígitos.");
      return;
    }
    if (phoneNumber.length !== 9) {
      setLoading(false);
      setError("O número de telefone deve ter exatamente 9 dígitos.");
      return;
    }
    const classification = getMultiValues(fd, "classification");
    if (classification.length === 0) {
      setLoading(false);
      setError("Selecione pelo menos uma opção em Classificação.");
      return;
    }
    const contactName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const phone = phoneNumber ? `${countryCode} ${phoneNumber}` : null;
    const createBody = {
      tenant_id: tenantId,
      name: companyName,
      company_name: companyName,
      cpv_s_alerta_concursos_publicos: cpvAlert || null,
      notification_regions: ["Todos"],
      entity_nipc: entityNipc,
      distrito,
      pais,
      position_title: positionTitle || null,
      department: department || null,
      classification: classification,
      subscription_type: (fd.get("tipo_subscricao") as string) || null,
      contact_name: contactName,
      phone,
      email: fd.get("email") as string,
      notify_mode: "instant",
    };

    const resp = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    }).then((r) => r.json());

    const insertedClient = resp.ok ? { id: resp.id } : null;
    const err = resp.error ? { message: resp.error } : null;
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
    const distritoRaw = ((fd.get("distrito") as string) || "").trim();
    if (!isValidDistrictSelection(distritoRaw)) {
      setLoading(false);
      setError("Selecione um distrito válido da lista.");
      return;
    }
    const firstName = ((fd.get("firstname") as string) || "").trim();
    const lastName = ((fd.get("lastname") as string) || "").trim();
    if (/\d/.test(firstName)) {
      setLoading(false);
      setError("O nome não aceita números.");
      return;
    }
    if (/\d/.test(lastName)) {
      setLoading(false);
      setError("O sobrenome não aceita números.");
      return;
    }
    const positionTitle = ((fd.get("position_title") as string) || "").trim();
    const department = ((fd.get("department") as string) || "").trim();
    if (/\d/.test(positionTitle)) {
      setLoading(false);
      setError("O cargo não aceita números.");
      return;
    }
    if (department && /\d/.test(department)) {
      setLoading(false);
      setError("O departamento não aceita números.");
      return;
    }
    const countryCode = "PT";
    const phoneNumber = normalizeDigits((fd.get("phone_number") as string) || "", 9);
    const entityNipc = normalizeDigits((fd.get("entity_nipc") as string) || "", 9);
    if (entityNipc.length !== 9) {
      setLoading(false);
      setError("O NIPC deve ter exatamente 9 dígitos.");
      return;
    }
    if (phoneNumber.length !== 9) {
      setLoading(false);
      setError("O número de telefone deve ter exatamente 9 dígitos.");
      return;
    }
    const classification = getMultiValues(fd, "classification");
    if (classification.length === 0) {
      setLoading(false);
      setError("Selecione pelo menos uma opção em Classificação.");
      return;
    }
    const contactName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const phone = phoneNumber ? `${countryCode} ${phoneNumber}` : null;
    const updateBody = {
      id: editingId,
      name: companyName,
      company_name: companyName,
      cpv_s_alerta_concursos_publicos: cpvAlert || null,
      entity_nipc: entityNipc,
      distrito: distritoRaw || null,
      pais: ((fd.get("pais") as string) || null),
      position_title: positionTitle || null,
      department: department || null,
      classification: classification,
      subscription_type: (fd.get("tipo_subscricao") as string) || null,
      contact_name: contactName,
      phone,
      email: fd.get("email") as string,
      notify_mode: "instant",
    };

    const resp = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    }).then((r) => r.json());

    const err = resp.error ? { message: resp.error } : null;
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

    const clientIdForMatch = editingId;

    // Refresh UI first
    setEditingId(null);
    await reload();

    // After successful update, refresh the CPV queue for this client only.
    // Email sending must stay behind the explicit admin action / scheduled job.
    (async () => {
      try {
        const { url, anonKey } = getSupabasePublicEnv("Supabase browser client");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";

        await fetch(`${url}/functions/v1/match-and-queue`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ client_id: clientIdForMatch }),
        });
      } catch (err) {
        console.error("Error refreshing CPV queue for client:", err);
      }
    })();
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
