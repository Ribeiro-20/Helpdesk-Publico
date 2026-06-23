import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const BATCH_SIZE = 200;

function mostFrequentLocation(locations: string[]): string | null {
  if (locations.length === 0) return null;
  const freq = new Map<string, number>();
  for (const loc of locations) {
    const parts = loc.split(",").map((s) => s.trim());
    const key = parts.length >= 3 ? `${parts[1]}, ${parts[2]}` : parts.length >= 2 ? parts[1] : loc;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  let best = ""; let bestCount = 0;
  for (const [key, count] of Array.from(freq.entries())) { if (count > bestCount) { best = key; bestCount = count; } }
  return best || null;
}

function parseNifNome(raw: unknown): { nif: string; name: string } {
  if (typeof raw !== "string") {
    if (raw && typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      const nif = typeof r.nif === "string" ? r.nif.trim() : "";
      const name = typeof r.name === "string" ? r.name.trim()
        : typeof r.value === "string" ? r.value.trim() : nif;
      return { nif, name };
    }
    return { nif: "", name: "" };
  }
  const s = raw.trim();
  const idx = s.indexOf(" - ");
  if (idx === -1) return { nif: s, name: s };
  return { nif: s.slice(0, idx).trim(), name: s.slice(idx + 3).trim() };
}

function parseCompetitors(text: string | null): Array<{ nif: string; name: string }> {
  if (!text) return [];
  const chunks = text.split(/[;\n|]/).map((s) => s.trim()).filter(Boolean);
  const result: Array<{ nif: string; name: string }> = [];
  for (const chunk of chunks) {
    if (/^\d{5,}/.test(chunk)) {
      const parsed = parseNifNome(chunk);
      if (parsed.nif) result.push(parsed);
    }
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { data: appUser } = await supabase.from("app_users").select("role, tenant_id").eq("id", user.id).maybeSingle();
    if (!appUser || appUser.role !== "admin") return NextResponse.json({ error: "Acesso negado: apenas admin." }, { status: 403 });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tenantId: string = appUser.tenant_id;
    const sinceHours: number | null = typeof body.since_hours === "number" ? body.since_hours : null;
    const startedAt = Date.now();

    const admin = await createAdminClient();

    const stats = { contracts_scanned: 0, nifs_found: 0, companies_created: 0, companies_updated: 0, winners_extracted: 0, competitors_extracted: 0, locations_set: 0, errors: 0, elapsed_ms: 0 };

    interface CompanyData {
      name: string; contractsWon: number; contractsParticipated: number; totalValueWon: number;
      locations: string[]; cpvs: Map<string, { count: number; value: number }>;
      entities: Map<string, { name: string; count: number; value: number }>; lastWinDate: string | null;
    }
    const companyData = new Map<string, CompanyData>();

    function getOrCreate(nif: string, name: string): CompanyData {
      let d = companyData.get(nif);
      if (!d) { d = { name, contractsWon: 0, contractsParticipated: 0, totalValueWon: 0, locations: [], cpvs: new Map(), entities: new Map(), lastWinDate: null }; companyData.set(nif, d); }
      if (name && d.name === nif) d.name = name;
      return d;
    }

    // 1. Fetch all contracts
    let offset = 0;
    while (true) {
      let q = admin.from("contracts").select("winners, competitors, contracting_entities, execution_locations, contract_price, cpv_main, publication_date").eq("tenant_id", tenantId);
      if (sinceHours) q = q.gte("created_at", new Date(Date.now() - sinceHours * 3600000).toISOString());
      const { data: batch } = await q.range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      stats.contracts_scanned += batch.length;

      for (const c of batch as Array<{ winners: unknown; competitors: string | null; contracting_entities: unknown; execution_locations: unknown; contract_price: number | null; cpv_main: string | null; publication_date: string | null }>) {
        const winners = Array.isArray(c.winners) ? c.winners as string[] : [];
        const locations = Array.isArray(c.execution_locations) ? c.execution_locations as string[] : [];
        const entities = Array.isArray(c.contracting_entities) ? c.contracting_entities as string[] : [];
        const entityParsed = entities.length > 0 ? parseNifNome(entities[0]) : null;

        for (const raw of winners) {
          const { nif, name } = parseNifNome(raw);
          if (!nif) continue;
          stats.winners_extracted++;
          const d = getOrCreate(nif, name);
          d.contractsWon++; d.contractsParticipated++;
          if (c.contract_price != null) d.totalValueWon += c.contract_price;
          d.locations.push(...locations);
          if (c.cpv_main) { const cd = d.cpvs.get(c.cpv_main) ?? { count: 0, value: 0 }; cd.count++; if (c.contract_price != null) cd.value += c.contract_price; d.cpvs.set(c.cpv_main, cd); }
          if (entityParsed) { const ed = d.entities.get(entityParsed.nif) ?? { name: entityParsed.name, count: 0, value: 0 }; ed.count++; if (c.contract_price != null) ed.value += c.contract_price; d.entities.set(entityParsed.nif, ed); }
          if (c.publication_date && (!d.lastWinDate || c.publication_date > d.lastWinDate)) d.lastWinDate = c.publication_date;
        }

        for (const { nif, name } of parseCompetitors(c.competitors)) {
          stats.competitors_extracted++;
          getOrCreate(nif, name).contractsParticipated++;
        }
      }

      if (batch.length < 1000) break;
      offset += 1000;
    }

    stats.nifs_found = companyData.size;

    // 2. Load existing companies
    const existingCompanies = new Map<string, { id: string; location: string | null }>();
    const nifArr = [...companyData.keys()];
    for (let i = 0; i < nifArr.length; i += 500) {
      const { data } = await admin.from("companies").select("id, nif, location").eq("tenant_id", tenantId).in("nif", nifArr.slice(i, i + 500));
      for (const row of (data ?? []) as Array<{ id: string; nif: string; location: string | null }>) existingCompanies.set(row.nif, row);
    }

    // 3. Build & upsert rows
    const rows: Array<Record<string, unknown>> = [];
    for (const [nif, d] of Array.from(companyData.entries())) {
      const existing = existingCompanies.get(nif);
      const location = existing?.location ?? mostFrequentLocation(d.locations);
      if (location && !existing?.location) stats.locations_set++;
      const winRate = d.contractsParticipated > 0 ? Math.round((d.contractsWon / d.contractsParticipated) * 10000) / 100 : null;
      const avgValue = d.contractsWon > 0 ? Math.round((d.totalValueWon / d.contractsWon) * 100) / 100 : null;
      const cpvSpec = [...d.cpvs.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([code, cv]) => ({ code, count: cv.count, value: Math.round(cv.value * 100) / 100 }));
      const topEntities = [...d.entities.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([n, ev]) => ({ nif: n, name: ev.name, count: ev.count, value: Math.round(ev.value * 100) / 100 }));
      rows.push({ tenant_id: tenantId, nif, name: d.name, location, contracts_won: d.contractsWon, contracts_participated: d.contractsParticipated, total_value_won: Math.round(d.totalValueWon * 100) / 100, avg_contract_value: avgValue, win_rate: winRate, last_win_at: d.lastWinDate ? new Date(d.lastWinDate).toISOString() : null, cpv_specialization: cpvSpec, top_entities: topEntities });
      if (existing) stats.companies_updated++; else stats.companies_created++;
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const { error } = await admin.from("companies").upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: "tenant_id,nif" });
      if (error) stats.errors += Math.min(BATCH_SIZE, rows.length - i);
    }

    stats.elapsed_ms = Date.now() - startedAt;
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
