import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type HubSpotListMembership = {
  recordId?: string;
  objectId?: string;
  id?: string;
  membershipTimestamp?: string;
  [key: string]: unknown;
};

type HubSpotContact = {
  id: string;
  properties?: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
};

type PreviewContact = {
  hubspot_contact_id: string;
  hubspot_company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  service_value: string | null;
  cpvs_raw: string | null;
  cpvs: string[];
  invalid_cpvs: string[];
  added_to_list_at: string | null;
  hubspot_created_at: string | null;
  hubspot_updated_at: string | null;
  proposed_client: {
    name: string;
    contact_name: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    cpv_s_alerta_concursos_publicos: string | null;
    hubspot_contact_id: string;
    hubspot_company_id: string | null;
    hubspot_service_value: string | null;
    hubspot_list_id: string;
    hubspot_added_to_list_at: string | null;
    hubspot_created_at: string | null;
    hubspot_updated_at: string | null;
    hubspot_synced_at: string;
    is_active: false;
  };
  proposed_cpv_rules: Array<{
    pattern: string;
    match_type: "EXACT";
    is_exclusion: false;
  }>;
};

type ExistingClient = {
  id: string;
  name: string;
  contact_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  company_name: string | null;
  cpv_s_alerta_concursos_publicos: string | null;
  hubspot_contact_id: string | null;
  hubspot_company_id: string | null;
  hubspot_service_value: string | null;
  hubspot_list_id: string | null;
  hubspot_added_to_list_at: string | null;
  hubspot_created_at: string | null;
  hubspot_updated_at: string | null;
  hubspot_synced_at: string | null;
  is_active: boolean;
};

type ProposedClientRecord = Omit<PreviewContact["proposed_client"], "is_active">;
type ClientPatch = Partial<ProposedClientRecord> &
  Pick<
    ProposedClientRecord,
    "name" | "contact_name" | "email" | "hubspot_contact_id" | "hubspot_list_id" | "hubspot_synced_at"
  >;

type SyncAction = {
  action: "create" | "update" | "unchanged" | "skip";
  hubspot_contact_id: string;
  email: string | null;
  contact_name: string;
  existing_client_id: string | null;
  changes: string[];
  reason: string | null;
  cpv_rules: number;
};

const __dirname = dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: resolve(__dirname, "../.env") });
loadDotenv({ path: resolve(__dirname, ".env") });

const HUBSPOT_BASE_URL = "https://api.hubapi.com";
const applyMode = process.argv.includes("--apply");
const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
const listId = process.env.HUBSPOT_SEGMENT_ID?.trim();
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const configuredTenantId = process.env.TENANT_ID?.trim();
const cpvsProperty = process.env.HUBSPOT_CPVS_PROPERTY?.trim() || "cpv_s_alerta_concursos_publicos";
const serviceProperty =
  process.env.HUBSPOT_SERVICE_PROPERTY?.trim() || "servico_alerta_concursos_publicos";

const contactProperties = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "company",
  "associatedcompanyid",
  "hs_object_id",
  serviceProperty,
  cpvsProperty,
];

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeCpv(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return digits;
  if (digits.length === 9) return `${digits.slice(0, 8)}-${digits.slice(8)}`;
  return null;
}

function parseCpvs(rawValue: string | null): { cpvs: string[]; invalidCpvs: string[] } {
  if (!rawValue) return { cpvs: [], invalidCpvs: [] };

  const pieces = rawValue
    .split(/[\r\n;,|]+|\s{2,}/g)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const cpvs = new Set<string>();
  const invalidCpvs = new Set<string>();

  for (const piece of pieces) {
    const matches = piece.match(/\d{8}(?:-\d)?|\d{9}/g);
    if (!matches) {
      invalidCpvs.add(piece);
      continue;
    }

    for (const match of matches) {
      const normalized = normalizeCpv(match);
      if (normalized) {
        cpvs.add(normalized);
      } else {
        invalidCpvs.add(match);
      }
    }
  }

  return {
    cpvs: [...cpvs].sort(),
    invalidCpvs: [...invalidCpvs].sort(),
  };
}

async function hubspotFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = requireEnv("HUBSPOT_ACCESS_TOKEN", token);
  const response = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.message ?? payload?.error ?? text;
    throw new Error(`HubSpot ${response.status}: ${message}`);
  }

  return payload as T;
}

async function fetchListInfo() {
  return hubspotFetch<{ listId?: string; name?: string; size?: number }>(`/crm/v3/lists/${listId}`);
}

async function fetchMemberships(): Promise<HubSpotListMembership[]> {
  const segmentId = requireEnv("HUBSPOT_SEGMENT_ID", listId);
  const memberships: HubSpotListMembership[] = [];
  let after: string | null = null;

  do {
    const search = new URLSearchParams({ limit: "100" });
    if (after) search.set("after", after);

    const page = await hubspotFetch<{
      results?: HubSpotListMembership[];
      paging?: { next?: { after?: string } };
    }>(`/crm/v3/lists/${segmentId}/memberships?${search.toString()}`);

    memberships.push(...(page.results ?? []));
    after = page.paging?.next?.after ?? null;
  } while (after);

  return memberships;
}

function membershipContactId(membership: HubSpotListMembership): string | null {
  return cleanText(membership.recordId ?? membership.objectId ?? membership.id);
}

async function fetchContacts(ids: string[]): Promise<HubSpotContact[]> {
  const contacts: HubSpotContact[] = [];

  for (const idChunk of chunk(ids, 100)) {
    const response = await hubspotFetch<{ results?: HubSpotContact[] }>(
      "/crm/v3/objects/contacts/batch/read",
      {
        method: "POST",
        body: JSON.stringify({
          idProperty: "hs_object_id",
          properties: contactProperties,
          inputs: idChunk.map((id) => ({ id })),
        }),
      },
    );

    contacts.push(...(response.results ?? []));
  }

  return contacts;
}

function normalizeContact(
  contact: HubSpotContact,
  membershipById: Map<string, HubSpotListMembership>,
  syncedAt: string,
): PreviewContact {
  const properties = contact.properties ?? {};
  const firstName = cleanText(properties.firstname);
  const lastName = cleanText(properties.lastname);
  const email = cleanText(properties.email);
  const cpvsRaw = cleanText(properties[cpvsProperty]);
  const { cpvs, invalidCpvs } = parseCpvs(cpvsRaw);
  const contactName = [firstName, lastName].filter(Boolean).join(" ").trim() || email || contact.id;
  const membership = membershipById.get(contact.id);
  const companyName = cleanText(properties.company);
  const companyId = cleanText(properties.associatedcompanyid);
  const serviceValue = cleanText(properties[serviceProperty]);
  const addedToListAt = cleanText(membership?.membershipTimestamp);
  const hubspotCreatedAt = cleanText(contact.createdAt);
  const hubspotUpdatedAt = cleanText(contact.updatedAt);

  return {
    hubspot_contact_id: contact.id,
    hubspot_company_id: companyId,
    first_name: firstName,
    last_name: lastName,
    contact_name: contactName,
    email,
    phone: cleanText(properties.phone),
    company_name: companyName,
    service_value: serviceValue,
    cpvs_raw: cpvsRaw,
    cpvs,
    invalid_cpvs: invalidCpvs,
    added_to_list_at: addedToListAt,
    hubspot_created_at: hubspotCreatedAt,
    hubspot_updated_at: hubspotUpdatedAt,
    proposed_client: {
      name: contactName,
      contact_name: contactName,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: cleanText(properties.phone),
      company_name: companyName,
      cpv_s_alerta_concursos_publicos: cpvsRaw,
      hubspot_contact_id: contact.id,
      hubspot_company_id: companyId,
      hubspot_service_value: serviceValue,
      hubspot_list_id: requireEnv("HUBSPOT_SEGMENT_ID", listId),
      hubspot_added_to_list_at: addedToListAt,
      hubspot_created_at: hubspotCreatedAt,
      hubspot_updated_at: hubspotUpdatedAt,
      hubspot_synced_at: syncedAt,
      is_active: false,
    },
    proposed_cpv_rules: cpvs.map((pattern) => ({
      pattern,
      match_type: "EXACT",
      is_exclusion: false,
    })),
  };
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function valuesEqual(key: string, left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  if (typeof left === "string" && typeof right === "string") {
    if (key.endsWith("_at")) {
      const leftTime = Date.parse(left);
      const rightTime = Date.parse(right);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return leftTime === rightTime;
      }
    }
    return left.trim() === right.trim();
  }
  return left === right;
}

function buildClientPatch(contact: PreviewContact): ClientPatch {
  const proposed = contact.proposed_client;
  const patch: ClientPatch = {
    name: proposed.name,
    contact_name: proposed.contact_name,
    first_name: proposed.first_name,
    last_name: proposed.last_name,
    email: proposed.email,
    phone: proposed.phone,
    company_name: proposed.company_name,
    cpv_s_alerta_concursos_publicos: proposed.cpv_s_alerta_concursos_publicos,
    hubspot_contact_id: proposed.hubspot_contact_id,
    hubspot_company_id: proposed.hubspot_company_id,
    hubspot_service_value: proposed.hubspot_service_value,
    hubspot_list_id: proposed.hubspot_list_id,
    hubspot_added_to_list_at: proposed.hubspot_added_to_list_at,
    hubspot_created_at: proposed.hubspot_created_at,
    hubspot_updated_at: proposed.hubspot_updated_at,
    hubspot_synced_at: proposed.hubspot_synced_at,
  };

  // Empty HubSpot values must not erase data maintained manually in the app.
  for (const key of ["first_name", "last_name", "phone", "company_name", "hubspot_company_id"] as const) {
    if (patch[key] == null || patch[key] === "") {
      delete patch[key];
    }
  }

  return patch;
}

async function resolveTenantId(supabase: any): Promise<string> {
  if (configuredTenantId) return configuredTenantId;

  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve tenant: ${error.message}`);
  if (!data?.id) throw new Error("No tenant found. Set TENANT_ID or run admin-seed.");
  return String(data.id);
}

async function fetchExistingClients(
  supabase: any,
  tenantId: string,
): Promise<ExistingClient[]> {
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, name, contact_name, first_name, last_name, email, phone, company_name, " +
        "cpv_s_alerta_concursos_publicos, hubspot_contact_id, hubspot_company_id, " +
        "hubspot_service_value, hubspot_list_id, hubspot_added_to_list_at, " +
        "hubspot_created_at, hubspot_updated_at, hubspot_synced_at, is_active",
    )
    .eq("tenant_id", tenantId);

  if (error) throw new Error(`Failed to load clients: ${error.message}`);
  return (data ?? []) as ExistingClient[];
}

function planSync(
  contacts: PreviewContact[],
  existingClients: ExistingClient[],
): { actions: SyncAction[]; existingByHubspotId: Map<string, ExistingClient> } {
  const existingByHubspotId = new Map<string, ExistingClient>();
  const existingByEmail = new Map<string, ExistingClient[]>();

  for (const client of existingClients) {
    if (client.hubspot_contact_id) {
      existingByHubspotId.set(client.hubspot_contact_id, client);
    }

    const email = normalizeEmail(client.email);
    if (email) {
      existingByEmail.set(email, [...(existingByEmail.get(email) ?? []), client]);
    }
  }

  const actions = contacts.map<SyncAction>((contact) => {
    if (!contact.email) {
      return {
        action: "skip",
        hubspot_contact_id: contact.hubspot_contact_id,
        email: null,
        contact_name: contact.contact_name,
        existing_client_id: null,
        changes: [],
        reason: "missing_email",
        cpv_rules: contact.proposed_cpv_rules.length,
      };
    }

    let existing = existingByHubspotId.get(contact.hubspot_contact_id) ?? null;
    if (!existing) {
      const emailMatches = existingByEmail.get(normalizeEmail(contact.email)) ?? [];
      if (emailMatches.length > 1) {
        return {
          action: "skip",
          hubspot_contact_id: contact.hubspot_contact_id,
          email: contact.email,
          contact_name: contact.contact_name,
          existing_client_id: null,
          changes: [],
          reason: "ambiguous_existing_email",
          cpv_rules: contact.proposed_cpv_rules.length,
        };
      }
      existing = emailMatches[0] ?? null;
    }

    if (!existing) {
      return {
        action: "create",
        hubspot_contact_id: contact.hubspot_contact_id,
        email: contact.email,
        contact_name: contact.contact_name,
        existing_client_id: null,
        changes: Object.keys(contact.proposed_client),
        reason: null,
        cpv_rules: contact.proposed_cpv_rules.length,
      };
    }

    const patch = buildClientPatch(contact);
    const changes = Object.entries(patch)
      .filter(([key]) => key !== "hubspot_synced_at")
      .filter(([key, value]) => !valuesEqual(key, existing?.[key as keyof ExistingClient], value))
      .map(([key]) => key);

    return {
      action: changes.length > 0 ? "update" : "unchanged",
      hubspot_contact_id: contact.hubspot_contact_id,
      email: contact.email,
      contact_name: contact.contact_name,
      existing_client_id: existing.id,
      changes,
      reason: null,
      cpv_rules: contact.proposed_cpv_rules.length,
    };
  });

  return { actions, existingByHubspotId };
}

async function applySync(
  supabase: any,
  tenantId: string,
  contacts: PreviewContact[],
  actions: SyncAction[],
): Promise<{ clients_written: number; cpv_rules_written: number }> {
  let clientsWritten = 0;
  let cpvRulesWritten = 0;
  const actionByHubspotId = new Map(actions.map((action) => [action.hubspot_contact_id, action]));

  for (const contact of contacts) {
    const action = actionByHubspotId.get(contact.hubspot_contact_id);
    if (!action || action.action === "skip") continue;

    const patch = buildClientPatch(contact);
    let clientId = action.existing_client_id;

    if (action.action === "create") {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          tenant_id: tenantId,
          ...patch,
          email: contact.email,
          is_active: false,
        })
        .select("id")
        .single();

      if (error) throw new Error(`Failed to create ${contact.email}: ${error.message}`);
      clientId = String(data.id);
      clientsWritten++;
    } else if (clientId) {
      const { error } = await supabase.from("clients").update(patch).eq("id", clientId).eq("tenant_id", tenantId);
      if (error) throw new Error(`Failed to update ${contact.email}: ${error.message}`);
      clientsWritten++;
    }

    if (!clientId) throw new Error(`No client id resolved for ${contact.email}`);

    const { error: deleteError } = await supabase
      .from("client_cpv_rules")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .eq("source", "hubspot");

    if (deleteError) throw new Error(`Failed to replace CPV rules for ${contact.email}: ${deleteError.message}`);

    if (contact.proposed_cpv_rules.length > 0) {
      const { error: insertError } = await supabase.from("client_cpv_rules").insert(
        contact.proposed_cpv_rules.map((rule) => ({
          tenant_id: tenantId,
          client_id: clientId,
          source: "hubspot",
          ...rule,
        })),
      );

      if (insertError) throw new Error(`Failed to write CPV rules for ${contact.email}: ${insertError.message}`);
      cpvRulesWritten += contact.proposed_cpv_rules.length;
    }
  }

  return { clients_written: clientsWritten, cpv_rules_written: cpvRulesWritten };
}

async function main() {
  requireEnv("HUBSPOT_ACCESS_TOKEN", token);
  requireEnv("HUBSPOT_SEGMENT_ID", listId);
  const resolvedSupabaseUrl = requireEnv("SUPABASE_URL", supabaseUrl);
  const resolvedServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
  const supabase = createClient(resolvedSupabaseUrl, resolvedServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tenantId = await resolveTenantId(supabase);

  console.log(
    applyMode
      ? "[hubspot-preview] APPLY mode; HubSpot read-only, local database writes enabled"
      : "[hubspot-preview] dry-run mode; no HubSpot or database writes",
  );
  console.log(`[hubspot-preview] list/segment id: ${listId}`);
  console.log(`[hubspot-preview] tenant id: ${tenantId}`);

  const list = await fetchListInfo();
  console.log(`[hubspot-preview] list: ${list.name ?? "(sem nome)"}`);

  const memberships = await fetchMemberships();
  const membershipById = new Map<string, HubSpotListMembership>();
  const ids = memberships
    .map((membership) => {
      const id = membershipContactId(membership);
      if (id) membershipById.set(id, membership);
      return id;
    })
    .filter((id): id is string => Boolean(id));

  const contacts = await fetchContacts([...new Set(ids)]);
  const generatedAt = new Date().toISOString();
  const previewContacts = contacts
    .map((contact) => normalizeContact(contact, membershipById, generatedAt))
    .sort((a, b) => a.contact_name.localeCompare(b.contact_name, "pt"));
  const existingClients = await fetchExistingClients(supabase, tenantId);
  const { actions } = planSync(previewContacts, existingClients);
  const actionStats = {
    create: actions.filter((action) => action.action === "create").length,
    update: actions.filter((action) => action.action === "update").length,
    unchanged: actions.filter((action) => action.action === "unchanged").length,
    skip: actions.filter((action) => action.action === "skip").length,
  };

  const applyResult = applyMode
    ? await applySync(supabase, tenantId, previewContacts, actions)
    : null;

  const stats = {
    mode: applyMode ? "apply" : "dry-run",
    tenant_id: tenantId,
    list_id: listId,
    list_name: list.name ?? null,
    expected_size_from_list: list.size ?? null,
    memberships_found: memberships.length,
    contacts_fetched: previewContacts.length,
    with_first_name: previewContacts.filter((contact) => Boolean(contact.first_name)).length,
    with_last_name: previewContacts.filter((contact) => Boolean(contact.last_name)).length,
    with_email: previewContacts.filter((contact) => Boolean(contact.email)).length,
    without_email: previewContacts.filter((contact) => !contact.email).length,
    with_phone: previewContacts.filter((contact) => Boolean(contact.phone)).length,
    without_phone: previewContacts.filter((contact) => !contact.phone).length,
    with_company_name: previewContacts.filter((contact) => Boolean(contact.company_name)).length,
    with_cpvs: previewContacts.filter((contact) => contact.cpvs.length > 0).length,
    without_cpvs: previewContacts.filter((contact) => contact.cpvs.length === 0).length,
    with_service_value: previewContacts.filter((contact) => Boolean(contact.service_value)).length,
    invalid_cpv_contacts: previewContacts.filter((contact) => contact.invalid_cpvs.length > 0).length,
    with_company_id: previewContacts.filter((contact) => Boolean(contact.hubspot_company_id)).length,
    without_company_id: previewContacts.filter((contact) => !contact.hubspot_company_id).length,
    total_unique_cpvs: new Set(previewContacts.flatMap((contact) => contact.cpvs)).size,
    proposed_client_records: previewContacts.length,
    proposed_cpv_rules: previewContacts.reduce(
      (total, contact) => total + contact.proposed_cpv_rules.length,
      0,
    ),
    existing_clients_in_tenant: existingClients.length,
    actions: actionStats,
    applied: applyResult,
    generated_at: generatedAt,
  };

  const output = {
    mode: applyMode ? "apply" : "dry-run",
    writes: {
      hubspot: false,
      database: applyMode,
    },
    properties: {
      service: serviceProperty,
      cpvs: cpvsProperty,
      requested: contactProperties,
    },
    stats,
    actions,
    contacts: previewContacts,
  };

  const outputPath = resolve(__dirname, "output/hubspot-subscribers-preview.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log("[hubspot-preview] stats:", JSON.stringify(stats, null, 2));
  console.log(`[hubspot-preview] wrote ${outputPath}`);
}

main().catch((error) => {
  console.error("[hubspot-preview] fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
