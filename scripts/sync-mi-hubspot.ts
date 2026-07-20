/**
 * sync-mi-hubspot.ts
 *
 * Sincroniza os contactos do segmento HubSpot "Subscritores Market Intelligence"
 * para a tabela mi_subscribers do Supabase.
 *
 * Usage:
 *   npx tsx sync-mi-hubspot.ts              # dry-run (só mostra o que faria)
 *   npx tsx sync-mi-hubspot.ts --apply      # aplica as alterações na BD
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: resolve(__dirname, "../.env") });
loadDotenv({ path: resolve(__dirname, ".env") });

const HUBSPOT_BASE_URL = "https://api.hubapi.com";
const applyMode = process.argv.includes("--apply");

const token = process.env.HUBSPOT_MI_ACCESS_TOKEN?.trim();
const segmentId = process.env.HUBSPOT_MI_SEGMENT_ID?.trim();
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const cpvsProperty = process.env.HUBSPOT_CPVS_PROPERTY?.trim() || "cpv_s_alerta_concursos_publicos";

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

// ---------------------------------------------------------------------------
// HubSpot API
// ---------------------------------------------------------------------------

async function hubspotFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = requireEnv("HUBSPOT_MI_ACCESS_TOKEN", token);
  const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = payload?.message ?? payload?.error ?? text;
    throw new Error(`HubSpot ${res.status}: ${msg}`);
  }

  return payload as T;
}

type HubSpotMembership = {
  recordId?: string;
  objectId?: string;
  id?: string;
  membershipTimestamp?: string;
};

type HubSpotContact = {
  id: string;
  properties?: Record<string, string | null>;
};

async function fetchMemberships(): Promise<HubSpotMembership[]> {
  const sid = requireEnv("HUBSPOT_MI_SEGMENT_ID", segmentId);
  const memberships: HubSpotMembership[] = [];
  let after: string | null = null;

  do {
    const params = new URLSearchParams({ limit: "100" });
    if (after) params.set("after", after);

    const page = await hubspotFetch<{
      results?: HubSpotMembership[];
      paging?: { next?: { after?: string } };
    }>(`/crm/v3/lists/${sid}/memberships?${params.toString()}`);

    memberships.push(...(page.results ?? []));
    after = page.paging?.next?.after ?? null;
  } while (after);

  return memberships;
}

async function fetchContacts(ids: string[]): Promise<HubSpotContact[]> {
  if (ids.length === 0) return [];

  const contacts: HubSpotContact[] = [];
  const chunkSize = 100;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const res = await hubspotFetch<{ results?: HubSpotContact[] }>(
      "/crm/v3/objects/contacts/batch/read",
      {
        method: "POST",
        body: JSON.stringify({
          idProperty: "hs_object_id",
          properties: ["firstname", "lastname", "email", "phone", "company", cpvsProperty],
          inputs: chunk.map((id) => ({ id })),
        }),
      },
    );
    contacts.push(...(res.results ?? []));
  }

  return contacts;
}

// ---------------------------------------------------------------------------
// CPV parsing (reutiliza lógica do preview-hubspot-subscribers.ts)
// ---------------------------------------------------------------------------

function normalizeCpv(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return digits;
  if (digits.length === 9) return `${digits.slice(0, 8)}-${digits.slice(8)}`;
  return null;
}

function parseCpvs(rawValue: string | null): string[] {
  if (!rawValue) return [];

  const pieces = rawValue
    .split(/[\r\n;,|]+|\s{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const cpvs = new Set<string>();

  for (const piece of pieces) {
    const matches = piece.match(/\d{8}(?:-\d)?|\d{9}/g);
    if (!matches) continue;

    for (const match of matches) {
      const normalized = normalizeCpv(match);
      if (normalized) cpvs.add(normalized);
    }
  }

  return [...cpvs].sort();
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------

type MiSubscriber = {
  id: string;
  email: string;
  name: string | null;
  hubspot_contact_id: string | null;
  cpv_codes: string[];
  is_active: boolean;
};

async function main() {
  requireEnv("HUBSPOT_MI_ACCESS_TOKEN", token);
  requireEnv("HUBSPOT_MI_SEGMENT_ID", segmentId);
  const resolvedUrl = requireEnv("SUPABASE_URL", supabaseUrl);
  const resolvedKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);

  const supabase = createClient(resolvedUrl, resolvedKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(applyMode
    ? "[mi-hubspot-sync] APPLY mode — database writes enabled"
    : "[mi-hubspot-sync] DRY-RUN mode — no database writes");
  console.log(`[mi-hubspot-sync] MI segment ID: ${segmentId}`);

  // 1. Fetch members from HubSpot
  const memberships = await fetchMemberships();
  const memberIds = memberships
    .map((m) => String(m.recordId ?? m.objectId ?? m.id ?? "").trim())
    .filter(Boolean);

  console.log(`[mi-hubspot-sync] Found ${memberIds.length} member(s) in segment`);

  if (memberIds.length === 0) {
    console.log("[mi-hubspot-sync] No members found. Nothing to sync.");
    return;
  }

  // 2. Fetch contact details
  const contacts = await fetchContacts(memberIds);
  console.log(`[mi-hubspot-sync] Fetched ${contacts.length} contact(s) from HubSpot`);

  const syncedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let deactivated = 0;

  // 3. Fetch existing mi_subscribers
  const { data: existingSubs, error: fetchErr } = await supabase
    .from("mi_subscribers")
    .select("id, email, name, hubspot_contact_id, cpv_codes, is_active");

  if (fetchErr) throw new Error(`Failed to fetch mi_subscribers: ${fetchErr.message}`);

  const existingByEmail = new Map<string, MiSubscriber>();
  const existingByHubspotId = new Map<string, MiSubscriber>();
  for (const sub of (existingSubs ?? []) as MiSubscriber[]) {
    if (sub.email) existingByEmail.set(sub.email.toLowerCase(), sub);
    if (sub.hubspot_contact_id) existingByHubspotId.set(sub.hubspot_contact_id, sub);
  }

  const processedHubspotIds = new Set<string>();

  for (const contact of contacts) {
    const props = contact.properties ?? {};
    const email = (props.email ?? "").trim().toLowerCase();
    if (!email) {
      console.log(`[mi-hubspot-sync] SKIP contact ${contact.id} — no email`);
      continue;
    }

    const firstName = (props.firstname ?? "").trim();
    const lastName = (props.lastname ?? "").trim();
    const contactName = [firstName, lastName].filter(Boolean).join(" ") || email;
    const cpvCodes = parseCpvs(props[cpvsProperty] ?? null);

    processedHubspotIds.add(contact.id);

    const existing = existingByHubspotId.get(contact.id) ?? existingByEmail.get(email);

    console.log(
      `[mi-hubspot-sync] ${existing ? "UPDATE" : "CREATE"} | ${email} | name=${contactName} | cpvs=${cpvCodes.length > 0 ? cpvCodes.join(", ") : "(nenhum)"}`,
    );

    if (!applyMode) {
      if (existing) updated++;
      else created++;
      continue;
    }

    if (existing) {
      // Update existing subscriber
      const { error } = await supabase
        .from("mi_subscribers")
        .update({
          name: contactName,
          hubspot_contact_id: contact.id,
          cpv_codes: JSON.stringify(cpvCodes),
          cpv_filter: cpvCodes[0] ?? null,  // keep backward compat
          is_active: true,
          hubspot_synced_at: syncedAt,
        })
        .eq("id", existing.id);

      if (error) throw new Error(`Failed to update ${email}: ${error.message}`);
      updated++;
    } else {
      // Create new subscriber
      const { error } = await supabase
        .from("mi_subscribers")
        .insert({
          email,
          name: contactName,
          hubspot_contact_id: contact.id,
          cpv_codes: JSON.stringify(cpvCodes),
          cpv_filter: cpvCodes[0] ?? null,
          is_active: true,
          min_progress: 0.75,
          hubspot_synced_at: syncedAt,
        });

      if (error) throw new Error(`Failed to create ${email}: ${error.message}`);
      created++;
    }
  }

  // 4. Deactivate subscribers no longer in the HubSpot segment
  for (const sub of (existingSubs ?? []) as MiSubscriber[]) {
    if (
      sub.hubspot_contact_id &&
      !processedHubspotIds.has(sub.hubspot_contact_id) &&
      sub.is_active
    ) {
      console.log(`[mi-hubspot-sync] DEACTIVATE | ${sub.email} | removed from HubSpot segment`);

      if (applyMode) {
        const { error } = await supabase
          .from("mi_subscribers")
          .update({ is_active: false, hubspot_synced_at: syncedAt })
          .eq("id", sub.id);

        if (error) throw new Error(`Failed to deactivate ${sub.email}: ${error.message}`);
      }
      deactivated++;
    }
  }

  console.log("\n[mi-hubspot-sync] Summary:");
  console.log(`  Created    : ${created}`);
  console.log(`  Updated    : ${updated}`);
  console.log(`  Deactivated: ${deactivated}`);
  console.log(`  Mode       : ${applyMode ? "APPLY" : "DRY-RUN"}`);
}

main().catch((err) => {
  console.error("[mi-hubspot-sync] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
