import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminEnv } from "@/lib/supabase/env";
import { NextRequest, NextResponse } from "next/server";

type DateRange = { from: string; to: string };

const WINDOWS: DateRange[] = [
  { from: "2024-01-01", to: "2024-12-31" },
  { from: "2025-01-01", to: "2025-12-31" },
  { from: "2026-01-01", to: "2026-12-31" },
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function splitInto15DayChunks(range: DateRange): DateRange[] {
  const chunks: DateRange[] = [];
  const start = new Date(`${range.from}T00:00:00Z`);
  const end = new Date(`${range.to}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return chunks;
  }

  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 14);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({
      from: toIsoDate(chunkStart),
      to: toIsoDate(chunkEnd),
    });

    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return chunks;
}

async function runWindow(origin: string, serviceRoleKey: string, from: string, to: string) {
  const response = await fetch(`${origin}/api/admin/ingest-dr`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from_date: from, to_date: to }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
    }

    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (appUserError) {
      return NextResponse.json({ ok: false, message: appUserError.message }, { status: 500 });
    }

    if (!appUser || appUser.role !== "admin") {
      return NextResponse.json({ ok: false, message: "Acesso negado: apenas admin." }, { status: 403 });
    }

    const { serviceRoleKey } = getSupabaseAdminEnv("Ingest DR historical BASE route");
    const details: Array<{ from: string; to: string; ok: boolean; status: number; body: unknown }> = [];
    const origin = req.nextUrl.origin;
    const chunks = WINDOWS.flatMap(splitInto15DayChunks);

    for (const chunk of chunks) {
      const result = await runWindow(origin, serviceRoleKey, chunk.from, chunk.to);
      details.push({ from: chunk.from, to: chunk.to, ...result });
      if (!result.ok) {
        return NextResponse.json(
          {
            ok: false,
            message: `Falhou ingestão para intervalo ${chunk.from} a ${chunk.to}.`,
            details,
          },
          { status: result.status || 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Ingestão histórica BASE (2024-2026) concluída.",
      details,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado na ingestão histórica.",
      },
      { status: 500 },
    );
  }
}
