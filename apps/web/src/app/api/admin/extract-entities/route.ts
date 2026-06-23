import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const BATCH_SIZE = 200;

function inferEntityType(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("câmara municipal") || n.includes("município") || n.includes("municipio")) return "município";
  if (n.includes("junta de freguesia") || n.includes("união de freguesias") || n.includes("uniao de freguesias")) return "freguesia";
  if (n.includes("ministério") || n.includes("ministerio")) return "ministério";
  if (n.includes("hospital") || n.includes("centro hospitalar") || n.includes("ars ") || n.includes("aces ") || n.includes("administração regional de saúde") || n.includes("agrupamento de centros de saúde") || n.includes("unidade local de saúde") || n.includes("uls ")) return "saúde";
  if (n.includes("universidade") || n.includes("politécnico") || n.includes("politecnico") || n.includes("escola superior") || n.includes("instituto superior") || n.includes("agrupamento de escolas")) return "ensino";
  if (n.includes("instituto") && !n.includes("instituto superior")) return "instituto";
  if (n.endsWith(", e.p.") || n.endsWith(", ep") || n.endsWith(", e.p.e.") || n.endsWith(", epe") || n.endsWith(", e.m.") || n.endsWith(", em") || n.endsWith(", s.a.") || n.endsWith(", sa") || n.includes(" - empresa municipal") || n.includes(" - empresa pública")) return "empresa_publica";
  if (n.includes("autoridade") || n.includes("regulador")) return "autoridade";
  if (n.includes("guarda nacional") || n.includes("forças armadas") || n.includes("exército") || n.includes("marinha") || n.includes("força aérea") || n.includes("polícia")) return "defesa";
  return null;
}

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

    const stats = { nifs_found: 0, entities_created: 0, entities_updated: 0, locations_set: 0, stats_updated: 0, errors: 0, elapsed_ms: 0 };

    // 1. Collect entity NIFs from announcements
    const entityInfo = new Map<string, { name: string }>();
    const entityAnnouncementCount = new Map<string, number>();
    let annOffset = 0;
    while (true) {
      let q = admin.from("announcements").select("entity_nif, entity_name").eq("tenant_id", tenantId).not("entity_nif", "is", null);
      if (sinceHours) q = q.gte("created_at", new Date(Date.now() - sinceHours * 3600000).toISOString());
      const { data: batch } = await q.range(annOffset, annOffset + 999);
      if (!batch || batch.length === 0) break;
      for (const row of batch as Array<{ entity_nif: string | null; entity_name: string | null }>) {
        if (!row.entity_nif) continue;
        entityAnnouncementCount.set(row.entity_nif, (entityAnnouncementCount.get(row.entity_nif) ?? 0) + 1);
        if (!entityInfo.has(row.entity_nif)) entityInfo.set(row.entity_nif, { name: row.entity_name ?? row.entity_nif });
      }
      if (batch.length < 1000) break;
      annOffset += 1000;
    }

    // 2. Collect from contracts
    const entityContracts = new Map<string, { count: number; totalValue: number; locations: string[]; cpvs: Map<string, number>; companies: Map<string, { name: string; count: number; value: number }>; lastDate: string | null }>();
    let offset = 0;
    while (true) {
      let q = admin.from("contracts").select("contracting_entities, execution_locations, contract_price, cpv_main, publication_date, winners").eq("tenant_id", tenantId);
      if (sinceHours) q = q.gte("created_at", new Date(Date.now() - sinceHours * 3600000).toISOString());
      const { data: batch } = await q.range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      for (const c of batch as Array<{ contracting_entities: unknown; execution_locations: unknown; contract_price: number | null; cpv_main: string | null; publication_date: string | null; winners: unknown }>) {
        const entities = Array.isArray(c.contracting_entities) ? c.contracting_entities as string[] : [];
        const locations = Array.isArray(c.execution_locations) ? c.execution_locations as string[] : [];
        const winners = Array.isArray(c.winners) ? c.winners as string[] : [];
        for (const raw of entities) {
          const { nif, name } = parseNifNome(raw);
          if (!nif) continue;
          if (!entityInfo.has(nif)) entityInfo.set(nif, { name });
          let cd = entityContracts.get(nif);
          if (!cd) { cd = { count: 0, totalValue: 0, locations: [], cpvs: new Map(), companies: new Map(), lastDate: null }; entityContracts.set(nif, cd); }
          cd.count++; if (c.contract_price != null) cd.totalValue += c.contract_price;
          cd.locations.push(...locations);
          if (c.cpv_main) cd.cpvs.set(c.cpv_main, (cd.cpvs.get(c.cpv_main) ?? 0) + 1);
          for (const wr of winners) { const w = parseNifNome(wr); if (!w.nif) continue; const wd = cd.companies.get(w.nif) ?? { name: w.name, count: 0, value: 0 }; wd.count++; if (c.contract_price != null) wd.value += c.contract_price; cd.companies.set(w.nif, wd); }
          if (c.publication_date && (!cd.lastDate || c.publication_date > cd.lastDate)) cd.lastDate = c.publication_date;
        }
      }
      if (batch.length < 1000) break;
      offset += 1000;
    }

    stats.nifs_found = entityInfo.size;

    // 3. Load existing entities
    const existingEntities = new Map<string, { id: string; entity_type: string | null; location: string | null }>();
    const nifArr = [...entityInfo.keys()];
    for (let i = 0; i < nifArr.length; i += 500) {
      const { data } = await admin.from("entities").select("id, nif, entity_type, location").eq("tenant_id", tenantId).in("nif", nifArr.slice(i, i + 500));
      for (const row of (data ?? []) as Array<{ id: string; nif: string; entity_type: string | null; location: string | null }>) existingEntities.set(row.nif, row);
    }

    // 4. Build & upsert rows
    const rows: Array<Record<string, unknown>> = [];
    for (const [nif, info] of Array.from(entityInfo.entries())) {
      const cd = entityContracts.get(nif);
      const existing = existingEntities.get(nif);
      const inferredType = inferEntityType(info.name);
      const location = existing?.location ?? (cd ? mostFrequentLocation(cd.locations) : null);
      if (location && !existing?.location) stats.locations_set++;
      const topCpvs = cd ? [...cd.cpvs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, count]) => ({ code, count })) : [];
      const topCompanies = cd ? [...cd.companies.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([n, d]) => ({ nif: n, name: d.name, count: d.count, value: Math.round(d.value * 100) / 100 })) : [];
      const totalContracts = cd?.count ?? 0;
      const totalValue = cd?.totalValue ?? 0;
      rows.push({ tenant_id: tenantId, nif, name: info.name, entity_type: existing?.entity_type ?? inferredType, location, total_announcements: entityAnnouncementCount.get(nif) ?? 0, total_contracts: totalContracts, total_value: totalValue, avg_contract_value: totalContracts > 0 ? Math.round((totalValue / totalContracts) * 100) / 100 : null, top_cpvs: topCpvs, top_companies: topCompanies, last_activity_at: cd?.lastDate ? new Date(cd.lastDate).toISOString() : null });
      if (existing) stats.entities_updated++; else stats.entities_created++;
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const { error } = await admin.from("entities").upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: "tenant_id,nif" });
      if (error) stats.errors += Math.min(BATCH_SIZE, rows.length - i);
    }

    stats.stats_updated = rows.length - stats.errors;
    stats.elapsed_ms = Date.now() - startedAt;
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
