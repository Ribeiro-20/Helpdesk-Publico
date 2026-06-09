import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function normalizeCpvCode(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim().toUpperCase();
  if (!value) return null;
  return value.replace(/\s+/g, "");
}

function cpvCore8(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : "";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createAdminClient();

  const [{ data: announcement }, { data: versions }] = await Promise.all([
    supabase.from("announcements").select("*").eq("id", id).single(),
    supabase
      .from("announcement_versions")
      .select("id, raw_hash, changed_at, change_summary")
      .eq("announcement_id", id)
      .order("changed_at", { ascending: false }),
  ]);

  if (!announcement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cpvMainRaw = announcement.cpv_main ? String(announcement.cpv_main) : null;
  const cpvListRaw: string[] = Array.isArray(announcement.cpv_list)
    ? announcement.cpv_list.map((value) => String(value))
    : [];
  const normalizedMain = normalizeCpvCode(cpvMainRaw);
  const normalizedListCodes = Array.from(
    new Set(cpvListRaw.map((code) => normalizeCpvCode(code)).filter((code): code is string => Boolean(code))),
  );
  const normalizedCodes = Array.from(
    new Set([normalizedMain, ...normalizedListCodes].filter((code): code is string => Boolean(code))),
  );

  const cpvShortCodes = Array.from(
    new Set(normalizedCodes.filter((code) => /^\d{8}$/.test(code)).map((code) => cpvCore8(code))),
  ).filter(Boolean);

  const cpvDisplayMap = new Map<string, { code: string; description: string | null }>();
  if (cpvShortCodes.length > 0) {
    const orFilter = cpvShortCodes.map((code) => `id.ilike.${code}-%`).join(",");
    const { data: cpvRows } = await supabase
      .from("cpv_codes")
      .select("id, descricao")
      .or(orFilter)
      .limit(Math.max(20, cpvShortCodes.length * 3));

    for (const row of cpvRows ?? []) {
      const code = String((row as { id?: unknown }).id ?? "").trim();
      if (!code) continue;
      const core = cpvCore8(code);
      if (!core || cpvDisplayMap.has(core)) continue;
      cpvDisplayMap.set(core, {
        code,
        description: String((row as { descricao?: unknown }).descricao ?? "").trim() || null,
      });
    }
  }

  const resolveCpv = (raw: unknown) => {
    const normalized = normalizeCpvCode(raw);
    if (!normalized) return null;
    if (/^\d{8}$/.test(normalized)) {
      return cpvDisplayMap.get(cpvCore8(normalized)) ?? { code: normalized, description: null };
    }
    const core = cpvCore8(normalized);
    return core ? cpvDisplayMap.get(core) ?? { code: normalized, description: null } : { code: normalized, description: null };
  };

  const cpvMain = resolveCpv(normalizedMain);
  const cpvList = Array.from(
    new Map(
      normalizedListCodes.map((code) => {
        const resolved = resolveCpv(code);
        return [resolved?.code ?? code, resolved] as const;
      }),
    ).values(),
  ).filter((item): item is { code: string; description: string | null } => Boolean(item));

  return NextResponse.json({ announcement, versions: versions ?? [], cpv: { main: cpvMain, list: cpvList } });
}