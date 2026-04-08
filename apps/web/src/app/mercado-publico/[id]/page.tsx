import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AlignJustify, Search, ArrowLeft, ExternalLink } from "lucide-react";
import PublicFooter from "@/components/layout/PublicFooter";

export const dynamic = "force-dynamic";

const NAV_BG = "rgba(26, 27, 31, 1)";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  modified: "bg-amber-100 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  closed: "Fechado",
  modified: "Modificado",
};

function extractName(raw: string): string {
  const idx = raw.indexOf(" - ");
  return idx === -1 ? raw : raw.slice(idx + 3);
}

function extractNif(raw: string): string {
  const idx = raw.indexOf(" - ");
  return idx === -1 ? "" : raw.slice(0, idx);
}

/** Parse competitors field — handles JSON arrays, single-quote arrays, and plain text */
function parseCompetitors(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();

  if (trimmed.startsWith("[")) {
    // 1. Standard JSON array
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed))
        return parsed.map((s: string) => String(s).trim()).filter(Boolean);
    } catch {
      // fall through
    }

    // 2. Single-quote array ['a','b']
    try {
      const normalized = trimmed.replace(
        /'([^']*)'/g,
        (_, inner) => `"${inner.replace(/"/g, '\\"')}"`,
      );
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed))
        return parsed.map((s: string) => String(s).trim()).filter(Boolean);
    } catch {
      // fall through
    }

    // 3. Strip brackets, split by quote-comma-quote
    const inner = trimmed.slice(1, -1);
    const byQuoteComma = inner.split(/['"]\s*,\s*['"]/);
    if (byQuoteComma.length > 1) {
      return byQuoteComma
        .map((s) => s.replace(/^['"]|['"]$/g, "").trim())
        .filter(Boolean);
    }
  }

  // 4. Plain text — split on comma only when followed by new entry (uppercase/digit)
  const entries: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    if (
      trimmed[i] === "," &&
      i + 1 < trimmed.length &&
      /\s/.test(trimmed[i + 1]) &&
      i + 2 < trimmed.length &&
      /[A-Z0-9]/.test(trimmed[i + 2])
    ) {
      const next = trimmed.slice(i + 1).trimStart();
      const isSuffix =
        /^(S\.A\.|Lda\.|Unip\.|Lda|SA|Unipessoal|e\.V\.|Inc\.|Ltd\.)/i.test(
          next,
        );
      if (!isSuffix) {
        entries.push(current.trim());
        current = "";
        i++;
        continue;
      }
    }
    current += trimmed[i];
  }
  if (current.trim()) entries.push(current.trim());
  return entries.filter(Boolean);
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  if (value == null || value === "") return null;
  const displayValue =
    String(value).toUpperCase() === "NULL" ? "Não aplicável" : String(value);
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>
        {displayValue}
      </p>
    </div>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <h3 className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-4">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default async function PublicContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createAdminClient();

  const [{ data: contract }, { data: modifications }] = await Promise.all([
    supabase.from("contracts").select("*").eq("id", id).single(),
    supabase
      .from("contract_modifications")
      .select(
        "id, modification_no, description, reason, previous_price, new_price, price_delta, modification_date",
      )
      .eq("contract_id", id)
      .order("modification_no", { ascending: true }),
  ]);

  if (!contract) notFound();

  const cpvList: string[] = Array.isArray(contract.cpv_list)
    ? contract.cpv_list
    : [];
  const entities: string[] = Array.isArray(contract.contracting_entities)
    ? contract.contracting_entities
    : [];
  const winners: string[] = Array.isArray(contract.winners)
    ? contract.winners
    : [];
  const locations: string[] = Array.isArray(contract.execution_locations)
    ? contract.execution_locations
    : [];

  let discountPct: number | null = null;
  if (
    contract.base_price != null &&
    contract.contract_price != null &&
    contract.base_price > 0
  ) {
    discountPct =
      ((contract.base_price - contract.contract_price) / contract.base_price) *
      100;
  }

  const fmtEur = (val: number | null) =>
    val != null
      ? `${Number(val).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
      : "—";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "rgba(248, 250, 252, 1)" }}
    >
      {/* ── NAVBAR ── */}
      <header
        className="flex items-center justify-between px-10 py-3 sticky top-0 z-50"
        style={{ background: NAV_BG }}
      >
        <Link href="/" className="shrink-0">
          <Image
            src="/logo-white.webp"
            alt="Helpdesk Público"
            width={200}
            height={66}
            className="object-contain"
            priority
          />
        </Link>
        <div className="relative w-80 mx-8">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Pesquisa"
            className="w-full rounded-full bg-white/10 border border-white/20 text-sm text-white placeholder-gray-400 pl-10 pr-4 py-2.5 outline-none focus:bg-white/20 focus:border-white/40 transition-all"
          />
        </div>
        <button className="flex items-center gap-2.5 text-white text-sm font-semibold border border-white/25 rounded-full px-5 py-2.5 hover:bg-white/10 transition-all">
          Menu
          <AlignJustify className="w-4 h-4" />
        </button>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-10 space-y-6">
        {/* Back + title */}
        <div className="flex items-start gap-4">
          <Link
            href="/mercado-publico"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mt-1 shrink-0 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Contratos
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 leading-snug">
              {contract.object || "Contrato sem objecto"}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {contract.procedure_type && (
                <span className="text-gray-500 text-sm">
                  {contract.procedure_type}
                </span>
              )}
              {contract.signing_date && (
                <span className="text-gray-400 text-sm">
                  Celebrado em {contract.signing_date}
                </span>
              )}
            </div>
          </div>
          <span
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_BADGE[contract.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {STATUS_LABEL[contract.status] ?? contract.status}
          </span>
        </div>

        {/* Price summary */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-5">
            Valores
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-gray-400 mb-1">Preço Base</p>
              <p className="text-xl font-medium text-gray-600">
                {fmtEur(contract.base_price)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Preço Contratual</p>
              <p
                className="text-xl font-bold"
                style={{ color: "rgba(74, 222, 128, 1)" }}
              >
                {fmtEur(contract.contract_price)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Preço Efectivo</p>
              <p
                className={`text-xl font-medium ${contract.status === "modified" ? "text-amber-600" : "text-gray-600"}`}
              >
                {fmtEur(contract.effective_price)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Desconto</p>
              {discountPct != null ? (
                <p
                  className={`text-xl font-medium ${discountPct > 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {discountPct > 0 ? "-" : "+"}
                  {Math.abs(discountPct).toFixed(1)}%
                </p>
              ) : (
                <p className="text-xl text-gray-300">—</p>
              )}
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Entidade adjudicante */}
          <InfoCard title="Entidade Adjudicante">
            {entities.length === 0 ? (
              <p className="text-sm text-gray-400">Sem informação</p>
            ) : (
              entities.map((raw, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                    style={{ background: "rgba(74, 222, 128, 1)" }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {extractName(raw)}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">
                      {extractNif(raw)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </InfoCard>

          {/* Entidade vencedora */}
          <InfoCard title="ENTIDADE(S) VENCEDORA(S)">
            {winners.length === 0 ? (
              <p className="text-sm text-gray-400">Sem informação</p>
            ) : (
              winners.map((raw, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-blue-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {extractName(raw)}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">
                      {extractNif(raw)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </InfoCard>

          {/* Cronologia */}
          <InfoCard title="Cronologia">
            <Field
              label="Data de publicação"
              value={contract.publication_date}
            />
            <Field label="Data de adjudicação" value={contract.award_date} />
            <Field label="Data de celebração" value={contract.signing_date} />
            <Field label="Data de fecho" value={contract.close_date} />
            <Field
              label="Prazo de execução"
              value={
                contract.execution_deadline_days
                  ? `${contract.execution_deadline_days} dias`
                  : null
              }
            />
          </InfoCard>

          {/* CPV */}
          <InfoCard title="CPV">
            <Field label="CPV principal" value={contract.cpv_main} mono />
            {cpvList.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Lista CPV</p>
                <div className="flex flex-wrap gap-1.5">
                  {cpvList.map((c: string, i: number) => (
                    <span
                      key={i}
                      className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </InfoCard>

          {/* Procedimento */}
          <InfoCard title="Procedimento">
            <Field
              label="Tipo de procedimento"
              value={contract.procedure_type}
            />
            <Field label="Tipo de contrato" value={contract.contract_type} />
            <Field label="Tipo de anúncio" value={contract.announcement_type} />
            <Field label="Regime jurídico" value={contract.legal_regime} />
            <Field label="Fundamentação" value={contract.legal_basis} />
            <Field label="Tipo de fim" value={contract.end_type} />
            {contract.is_centralized && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Centralizado</p>
                <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">
                  Sim
                </span>
              </div>
            )}
            {contract.is_ecological && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Ecológico</p>
                <span className="inline-block bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded">
                  Sim
                </span>
              </div>
            )}
          </InfoCard>

          {/* Local de execução */}
          {locations.length > 0 && (
            <InfoCard title="Local de Execução">
              {locations.map((loc, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  <p className="text-sm text-gray-700">{loc}</p>
                </div>
              ))}
            </InfoCard>
          )}

          {/* Referências */}
          <InfoCard title="Referências">
            <Field
              label="ID Contrato BASE"
              value={contract.base_contract_id}
              mono
            />
            <Field
              label="ID Procedimento"
              value={contract.base_procedure_id}
              mono
            />
            <Field
              label="Nº Anúncio"
              value={contract.base_announcement_no}
              mono
            />
            <Field label="ID INCM" value={contract.base_incm_id} mono />
            {contract.framework_agreement && (
              <Field
                label="Acordo Quadro"
                value={contract.framework_agreement}
              />
            )}
          </InfoCard>
        </div>

        {/* Documentos */}
        {contract.procedure_docs_url && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Documentos
            </p>
            <a
              href={contract.procedure_docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline transition-colors"
              style={{ color: "rgba(74, 222, 128, 1)" }}
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              Peças do Procedimento / Contrato
            </a>
          </div>
        )}

        {/* Concorrentes */}
        {contract.competitors && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-4">
              Concorrentes ({parseCompetitors(contract.competitors).length})
            </h3>
            <ul className="divide-y divide-gray-100">
              {parseCompetitors(contract.competitors).map((entry, i) => {
                const nif = extractNif(entry);
                const name = extractName(entry);
                return (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {name}
                      </p>
                      {nif && nif !== name && (
                        <p className="text-xs text-gray-400 font-mono">{nif}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Descrição */}
        {contract.description && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-3">
              Descrição
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {contract.description}
            </p>
          </div>
        )}

        {/* Observações */}
        {contract.observations && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-3">
              Observações
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {contract.observations}
            </p>
          </div>
        )}

        {/* Modificações contratuais */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-xs uppercase tracking-widest text-gray-400 mb-4">
            Modificações contratuais ({modifications?.length ?? 0})
          </h3>
          {(modifications ?? []).length === 0 ? (
            <p className="text-gray-400 text-sm">Sem modificações registadas</p>
          ) : (
            <div className="space-y-3">
              {(modifications ?? []).map((mod) => (
                <div
                  key={mod.id}
                  className="border border-gray-100 rounded-xl p-4"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold shrink-0">
                      {mod.modification_no}
                    </span>
                    {mod.modification_date && (
                      <span className="text-xs text-gray-400">
                        {mod.modification_date}
                      </span>
                    )}
                    {mod.price_delta != null && (
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          mod.price_delta > 0
                            ? "bg-red-50 text-red-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {mod.price_delta > 0 ? "+" : ""}
                        {Number(mod.price_delta).toLocaleString("pt-PT", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        €
                      </span>
                    )}
                  </div>
                  {mod.description && (
                    <p className="text-sm text-gray-700">{mod.description}</p>
                  )}
                  {mod.reason && (
                    <p className="text-xs text-gray-400 mt-1">{mod.reason}</p>
                  )}
                  {mod.previous_price != null && mod.new_price != null && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                      <span>
                        {Number(mod.previous_price).toLocaleString("pt-PT", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        €
                      </span>
                      <span className="text-gray-300">→</span>
                      <span className="font-medium text-gray-700">
                        {Number(mod.new_price).toLocaleString("pt-PT", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        €
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
