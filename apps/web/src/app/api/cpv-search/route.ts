import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20,
    50,
  );

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const supabase = await createClient();

  // Search by id prefix or description (case-insensitive)
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from("cpv_codes")
    .select("id, descricao")
    .or(`id.ilike.${pattern},descricao.ilike.${pattern}`)
    .order("id")
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
