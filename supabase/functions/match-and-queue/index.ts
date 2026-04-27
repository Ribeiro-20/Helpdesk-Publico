/**
 * Edge Function: match-and-queue
 *
 * Matches announcements against client CPV rules and creates PENDING notifications.
 *
 * Request body (all optional):
 *  {
 *    tenant_id?:       string,  // defaults to first tenant
 *    announcement_id?: string,  // if given, process only this announcement
 *    from_date?:       string,  // ISO date, e.g. "2024-01-01" – filter by publication_date
 *    to_date?:         string,  // ISO date, e.g. "2024-01-07" – filter by publication_date
 *    hours_back?:      number   // fallback window for cron (default 2h, used when no dates/id given)
 *  }
 *
 * Response:
 *  { processed_announcements, notifications_created, notifications_skipped, errors }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { matchClientsForAnnouncement } from "../_shared/cpvMatcher.ts";
import type { CpvRule } from "../_shared/cpvMatcher.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
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

const REGION_NORMALIZED = new Set(REGION_LABELS.map(normalizeRegion));

function normalizeRegion(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCpvPattern(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  const match = raw.match(/\b\d{8}(?:-\d)?\b/);
  if (match) return match[0];
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) return digits.slice(0, 8);
  return raw;
}

function inferMatchTypeFromPattern(pattern: string): "EXACT" | "PREFIX" {
  const digits = pattern.replace(/\D/g, "");
  return digits.length >= 8 ? "EXACT" : "PREFIX";
}

function collectFromObject(
  obj: Record<string, unknown>,
  target: Set<string>,
) {
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

      if (REGION_NORMALIZED.has(normalized)) {
        target.add(normalized);
      }

      // Handle values like "Portugal, Lisboa, Lisboa".
      for (const part of value.split(/[;,]/)) {
        const p = normalizeRegion(part);
        if (REGION_NORMALIZED.has(p)) target.add(p);
      }
    }
  }
}

function extractRegionsFromText(text: string, target: Set<string>) {
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

    if (REGION_NORMALIZED.has(normalized)) {
      target.add(normalized);
    }
  }
}

function extractAnnouncementRegions(rawPayload: unknown): Set<string> {
  const regions = new Set<string>();
  if (!rawPayload || typeof rawPayload !== "object") return regions;

  const root = rawPayload as Record<string, unknown>;
  collectFromObject(root, regions);

  const payload = root.payload && typeof root.payload === "object"
    ? root.payload as Record<string, unknown>
    : null;
  if (payload) collectFromObject(payload, regions);

  const detail = payload?.detalhe_conteudo && typeof payload.detalhe_conteudo === "object"
    ? payload.detalhe_conteudo as Record<string, unknown>
    : root.detalhe_conteudo && typeof root.detalhe_conteudo === "object"
    ? root.detalhe_conteudo as Record<string, unknown>
    : null;

  if (detail) {
    collectFromObject(detail, regions);
    const detailText = detail.Texto;
    if (typeof detailText === "string" && detailText.trim()) {
      extractRegionsFromText(detailText, regions);
    }
  }

  return regions;
}

function clientMatchesAnnouncementRegions(
  clientRegions: string[] | null | undefined,
  announcementRegions: Set<string>,
): boolean {
  const normalizedClient = (clientRegions ?? [])
    .map((item) => normalizeRegion(String(item)))
    .filter(Boolean);

  if (normalizedClient.length === 0 || normalizedClient.includes("todos")) {
    return true;
  }

  if (announcementRegions.has("todos")) return true;
  if (announcementRegions.size === 0) return false;

  return normalizedClient.some((region) => announcementRegions.has(region));
}

function isMissingNotificationRegionsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "");
  const details = String((error as { details?: unknown }).details ?? "");
  const hint = String((error as { hint?: unknown }).hint ?? "");
  const combined = `${message} ${details} ${hint}`.toLowerCase();
  return combined.includes("notification_regions") && combined.includes("clients");
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      type: "Error",
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      type: "Object",
      message: typeof record.message === "string" ? record.message : undefined,
      details: typeof record.details === "string" ? record.details : undefined,
      hint: typeof record.hint === "string" ? record.hint : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
      raw: record,
    };
  }

  return {
    type: typeof error,
    message: String(error),
  };
}

async function loadActiveClientsWithRegions(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
) {
  const withRegions = await supabase
    .from("clients")
    .select("id, notification_regions, cpv_s_alerta_concursos_publicos")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (!withRegions.error) return withRegions;

  if (!isMissingNotificationRegionsError(withRegions.error)) {
    return withRegions;
  }

  console.warn(
    "[match-and-queue] coluna clients.notification_regions ausente; fallback para todos os distritos",
  );

  const withoutRegions = await supabase
    .from("clients")
    .select("id, cpv_s_alerta_concursos_publicos")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  return {
    data: (withoutRegions.data ?? []).map((row) => ({
      ...(row as Record<string, unknown>),
      notification_regions: ["todos"],
    })),
    error: withoutRegions.error,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body =
      req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Resolve tenant_id
    let tenantId: string = body.tenant_id ?? "";
    if (!tenantId) {
      const { data: tenant, error } = await supabase
        .from("tenants")
        .select("id")
        .limit(1)
        .single();
      if (error || !tenant) {
        return new Response(
          JSON.stringify({ error: "No tenant found. Run admin-seed first." }),
          { status: 400, headers: CORS },
        );
      }
      tenantId = tenant.id;
    }

    // Load CPV rules for this tenant (with active clients only)
    const { data: rules, error: rulesErr } = await supabase
      .from("client_cpv_rules")
      .select(
        "id, client_id, pattern, match_type, is_exclusion, clients!inner(is_active)",
      )
      .eq("tenant_id", tenantId);

    if (rulesErr) throw rulesErr;

    const activeRules = ((rules ?? []) as unknown as Array<
      CpvRule & { clients: { is_active: boolean } }
    >).filter((r) => r.clients?.is_active !== false) as CpvRule[];

    const { data: activeClients, error: clientsErr } =
      await loadActiveClientsWithRegions(supabase, tenantId);

    if (clientsErr) throw clientsErr;

    const clientRegionsMap = new Map<string, string[]>();
    const clientBaseCpvMap = new Map<string, string>();
    for (const row of activeClients ?? []) {
      const record = row as {
        id: string;
        notification_regions?: unknown;
        cpv_s_alerta_concursos_publicos?: unknown;
      };
      const regions = Array.isArray(record.notification_regions)
        ? record.notification_regions.map((v) => String(v))
        : [];
      clientRegionsMap.set(record.id, regions);

      const baseCpv = normalizeCpvPattern(record.cpv_s_alerta_concursos_publicos ?? "");
      if (baseCpv) {
        clientBaseCpvMap.set(record.id, baseCpv);
      }
    }

    const clientsWithInclusionRule = new Set(
      activeRules
        .filter((rule) => !rule.is_exclusion)
        .map((rule) => rule.client_id),
    );

    const fallbackRules: CpvRule[] = [];
    for (const [clientId, baseCpv] of clientBaseCpvMap.entries()) {
      if (clientsWithInclusionRule.has(clientId)) continue;
      fallbackRules.push({
        id: `auto-base-${clientId}`,
        client_id: clientId,
        pattern: baseCpv,
        match_type: inferMatchTypeFromPattern(baseCpv),
        is_exclusion: false,
      });
    }

    const effectiveRules = [...activeRules, ...fallbackRules];

    console.log(
      `[match-and-queue] ${activeRules.length} active CPV rules (+${fallbackRules.length} fallback base rules)`,
    );

    // Build announcement query
    let annQuery = supabase
      .from("announcements")
      .select("id, cpv_main, cpv_list, raw_payload")
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    if (body.announcement_id) {
      annQuery = annQuery.eq("id", body.announcement_id);
    } else if (body.from_date || body.to_date) {
      // Manual invocation with explicit date range (from frontend)
      if (body.from_date) {
        annQuery = annQuery.gte("publication_date", body.from_date);
      }
      if (body.to_date) {
        annQuery = annQuery.lte("publication_date", body.to_date);
      }
    } else {
      // Cron / default: only recent announcements
      const hoursBack = Number(body.hours_back ?? 2);
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
      annQuery = annQuery.gte("created_at", since);
    }

    const { data: announcements, error: annErr } = await annQuery;
    if (annErr) throw annErr;

    const stats = {
      processed_announcements: announcements?.length ?? 0,
      notifications_created: 0,
      notifications_skipped: 0,
      errors: 0,
    };

    for (const ann of announcements ?? []) {
      try {
        const cpvList: string[] = Array.isArray(ann.cpv_list)
          ? ann.cpv_list
          : [];
        const cpvMain: string | null = ann.cpv_main ?? null;

        const matchedClientIds = matchClientsForAnnouncement(
          cpvMain,
          cpvList,
          effectiveRules,
        );

        const announcementRegions = extractAnnouncementRegions(
          (ann as Record<string, unknown>).raw_payload,
        );

        const regionFilteredClientIds = matchedClientIds.filter((clientId) =>
          clientMatchesAnnouncementRegions(
            clientRegionsMap.get(clientId),
            announcementRegions,
          )
        );

        for (const clientId of regionFilteredClientIds) {
          const { error: insertErr } = await supabase
            .from("notifications")
            .insert({
              tenant_id: tenantId,
              client_id: clientId,
              announcement_id: ann.id,
              channel: "email",
              status: "PENDING",
            });

          if (insertErr) {
            if (
              insertErr.code === "23505" // unique violation → already queued
            ) {
              stats.notifications_skipped++;
            } else {
              console.error("[match-and-queue] insert error:", insertErr);
              stats.errors++;
            }
          } else {
            stats.notifications_created++;
          }
        }
      } catch (itemErr) {
        console.error("[match-and-queue] item error:", itemErr);
        stats.errors++;
      }
    }

    console.log("[match-and-queue] done:", stats);
    return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
  } catch (err) {
    const serialized = serializeError(err);
    console.error("[match-and-queue] fatal:", serialized);
    return new Response(
      JSON.stringify({ error: serialized }),
      { status: 500, headers: CORS },
    );
  }
});
