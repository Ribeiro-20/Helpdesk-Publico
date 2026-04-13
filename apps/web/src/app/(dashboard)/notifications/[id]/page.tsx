import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import { Bell } from "lucide-react";

type Rule = {
  id: string;
  pattern: string;
  match_type: "EXACT" | "PREFIX";
  is_exclusion: boolean;
};

type ClientRow = {
  id: string;
  name: string;
  email: string;
  notification_regions?: string[] | null;
};

type AnnouncementRow = {
  id: string;
  title: string;
  publication_date: string;
  entity_name: string | null;
  cpv_main: string | null;
  cpv_list: string[] | null;
  base_price: number | null;
  currency: string | null;
  detail_url: string | null;
  raw_payload?: Record<string, unknown> | null;
};

const REGION_LABELS = [
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

function normalizeRegion(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const REGION_LABEL_BY_NORMALIZED = new Map(
  REGION_LABELS.map((label) => [normalizeRegion(label), label]),
);

function collectRegionsFromObject(obj: Record<string, unknown>, target: Set<string>) {
  const fields = ["Distrito", "distrito", "District", "district"];
  for (const field of fields) {
    const raw = obj[field];
    const values = Array.isArray(raw) ? raw : [raw];

    for (const item of values) {
      if (!item) continue;
      const value = String(item).trim();
      if (!value) continue;

      const normalized = normalizeRegion(value);
      if (normalized === "todos") {
        target.add("todos");
        continue;
      }

      if (REGION_LABEL_BY_NORMALIZED.has(normalized)) {
        target.add(normalized);
      }

      for (const part of value.split(/[;,]/)) {
        const partNorm = normalizeRegion(part);
        if (REGION_LABEL_BY_NORMALIZED.has(partNorm)) {
          target.add(partNorm);
        }
      }
    }
  }
}

function extractRegionsFromDetailText(text: string, target: Set<string>) {
  const districtRegex = /Distrito:\s*([^\r\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = districtRegex.exec(text)) !== null) {
    const value = String(match[1] ?? "").trim();
    if (!value) continue;
    const normalized = normalizeRegion(value);

    if (normalized === "todos") {
      target.add("todos");
      continue;
    }

    if (REGION_LABEL_BY_NORMALIZED.has(normalized)) {
      target.add(normalized);
    }
  }
}

function extractAnnouncementRegions(rawPayload: unknown): string[] {
  const regions = new Set<string>();
  if (!rawPayload || typeof rawPayload !== "object") return [];

  const root = rawPayload as Record<string, unknown>;
  collectRegionsFromObject(root, regions);

  const payload = root.payload && typeof root.payload === "object"
    ? (root.payload as Record<string, unknown>)
    : null;
  if (payload) collectRegionsFromObject(payload, regions);

  const detail = payload?.detalhe_conteudo && typeof payload.detalhe_conteudo === "object"
    ? (payload.detalhe_conteudo as Record<string, unknown>)
    : root.detalhe_conteudo && typeof root.detalhe_conteudo === "object"
    ? (root.detalhe_conteudo as Record<string, unknown>)
    : null;

  if (detail) {
    collectRegionsFromObject(detail, regions);
    const detailText = detail.Texto;
    if (typeof detailText === "string" && detailText.trim()) {
      extractRegionsFromDetailText(detailText, regions);
    }
  }

  return Array.from(regions);
}

function toRegionLabel(normalized: string): string {
  if (normalized === "todos") return "Todos";
  return REGION_LABEL_BY_NORMALIZED.get(normalized) ?? normalized;
}

function matchesRule(code: string, rule: Rule): boolean {
  if (!code || !rule.pattern) return false;
  if (rule.match_type === "EXACT") return code === rule.pattern;
  return code.startsWith(rule.pattern);
}

function getAnnouncementCpvCodes(announcement: Record<string, unknown>): string[] {
  const cpvList = Array.isArray(announcement.cpv_list)
    ? (announcement.cpv_list as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];

  const cpvMain = typeof announcement.cpv_main === "string" ? announcement.cpv_main : null;

  return Array.from(new Set([...(cpvMain ? [cpvMain] : []), ...cpvList]));
}

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: appUser } = await supabase.from("app_users").select("tenant_id").maybeSingle();

  const query = supabase
    .from("notifications")
    .select(
      `id, tenant_id, client_id, announcement_id, status, channel, sent_at, error, created_at,
       clients (id, name, email, notification_regions),
       announcements (id, title, publication_date, entity_name, cpv_main, cpv_list, base_price, currency, detail_url, raw_payload)`,
    )
    .eq("id", id);

  const scopedQuery = appUser?.tenant_id
    ? query.eq("tenant_id", appUser.tenant_id)
    : query;

  const { data: rows } = await scopedQuery.limit(1);
  const notification = (rows ?? [])[0];

  if (!notification) notFound();

  const client = (Array.isArray(notification.clients) ? notification.clients[0] : notification.clients) as ClientRow | null;
  const announcement = (Array.isArray(notification.announcements)
    ? notification.announcements[0]
    : notification.announcements) as AnnouncementRow | null;

  const cpvCodes = announcement
    ? getAnnouncementCpvCodes(announcement as unknown as Record<string, unknown>)
    : [];
  const clientRegionsNormalized = Array.isArray(client?.notification_regions)
    ? client.notification_regions.map((region) => normalizeRegion(String(region))).filter(Boolean)
    : [];
  const announcementRegionsNormalized = announcement?.raw_payload
    ? extractAnnouncementRegions(announcement.raw_payload)
    : [];
  const regionMatch =
    clientRegionsNormalized.length === 0 ||
    clientRegionsNormalized.includes("todos") ||
    announcementRegionsNormalized.includes("todos") ||
    clientRegionsNormalized.some((region) => announcementRegionsNormalized.includes(region));

  let matchedInclusionRules: Rule[] = [];
  let matchedExclusionRules: Rule[] = [];

  if (notification.client_id) {
    const { data: rules } = await supabase
      .from("client_cpv_rules")
      .select("id, pattern, match_type, is_exclusion")
      .eq("client_id", notification.client_id);

    const allRules = (rules ?? []) as Rule[];
    matchedInclusionRules = allRules.filter(
      (rule) => !rule.is_exclusion && cpvCodes.some((code) => matchesRule(code, rule)),
    );
    matchedExclusionRules = allRules.filter(
      (rule) => rule.is_exclusion && cpvCodes.some((code) => matchesRule(code, rule)),
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Bell}
        title="Detalhe da notificação"
        description={`Criada em ${new Date(notification.created_at).toLocaleString("pt-PT")}`}
      />

      <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card space-y-2">
        <p className="text-sm text-gray-500">Estado</p>
        <p className="text-sm font-semibold text-gray-800">{notification.status}</p>
        <p className="text-sm text-gray-500 pt-2">Canal</p>
        <p className="text-sm text-gray-800">{notification.channel}</p>
        {notification.sent_at && (
          <>
            <p className="text-sm text-gray-500 pt-2">Enviada em</p>
            <p className="text-sm text-gray-800">{new Date(notification.sent_at).toLocaleString("pt-PT")}</p>
          </>
        )}
        {notification.error && (
          <>
            <p className="text-sm text-gray-500 pt-2">Erro</p>
            <p className="text-sm text-red-600">{notification.error}</p>
          </>
        )}
      </div>

      <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Cliente</h2>
        <p className="text-base font-semibold text-gray-900">{client?.name ?? "—"}</p>
        <p className="text-sm text-gray-500">{client?.email ?? ""}</p>
      </div>

      <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Anúncio</h2>
        <p className="text-base font-semibold text-gray-900">{announcement?.title ? String(announcement.title) : "—"}</p>
        <p className="text-sm text-gray-500">
          Publicação: {announcement?.publication_date ? String(announcement.publication_date) : "—"}
        </p>
        {announcement?.entity_name && (
          <p className="text-sm text-gray-500">Entidade: {String(announcement.entity_name)}</p>
        )}
        {announcement?.id && (
          <div className="pt-2 flex gap-2">
            <Link
              href={`/announcements/${String(announcement.id)}`}
              className="inline-flex items-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              Ver anúncio
            </Link>
            {announcement?.detail_url && (
              <a
                href={String(announcement.detail_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-surface-50"
              >
                Ver original
              </a>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Motivo do match</h2>

        {cpvCodes.length > 0 ? (
          <div>
            <p className="text-xs text-gray-400 mb-1">CPVs do anúncio</p>
            <div className="flex flex-wrap gap-1">
              {cpvCodes.map((code) => (
                <span key={code} className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono">
                  {code}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Sem CPVs disponíveis no anúncio.</p>
        )}

        {matchedInclusionRules.length > 0 ? (
          <div>
            <p className="text-xs text-gray-400 mb-1">Regras CPV que bateram</p>
            <div className="flex flex-wrap gap-1">
              {matchedInclusionRules.map((rule) => (
                <span key={rule.id} className="inline-block bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded font-mono">
                  {rule.match_type}:{rule.pattern}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Não foi possível reconstruir a regra CPV exata desta notificação com os dados atuais.</p>
        )}

        {matchedExclusionRules.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Regras de exclusão também correspondentes</p>
            <div className="flex flex-wrap gap-1">
              {matchedExclusionRules.map((rule) => (
                <span key={rule.id} className="inline-block bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded font-mono">
                  {rule.match_type}:{rule.pattern}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-gray-400 mb-1">Regiões do cliente</p>
          <div className="flex flex-wrap gap-1">
            {(clientRegionsNormalized.length > 0 ? clientRegionsNormalized : ["todos"]).map((region) => (
              <span key={region} className="inline-block bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded">
                {toRegionLabel(region)}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1">Regiões do anúncio</p>
          {announcementRegionsNormalized.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {announcementRegionsNormalized.map((region) => (
                <span key={region} className="inline-block bg-cyan-50 text-cyan-700 text-xs px-2 py-0.5 rounded">
                  {toRegionLabel(region)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sem região detetada no anúncio.</p>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1">Resultado regional</p>
          <p className={`text-sm font-medium ${regionMatch ? "text-emerald-700" : "text-red-700"}`}>
            {regionMatch ? "Região compatível" : "Região não compatível"}
          </p>
        </div>
      </div>

      <div>
        <Link href="/notifications" className="text-sm text-gray-500 hover:text-gray-700">
          ← Voltar às notificações
        </Link>
      </div>
    </div>
  );
}
