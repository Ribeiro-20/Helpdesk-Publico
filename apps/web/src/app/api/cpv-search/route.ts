import { createAdminClient } from "@/lib/supabase/server";
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

  const supabase = await createAdminClient();

  const isNumericPrefix = /^[0-9-]+$/.test(q);
  let query = supabase.from("cpv_codes").select("id, descricao").order("id").limit(limit);

  if (isNumericPrefix) {
    // Numeric queries should behave as CPV prefix matches (e.g. 331*).
    query = query.ilike("id", `${q}%`);
  } else {
    const pattern = `%${q}%`;
    query = query.or(`id.ilike.${pattern},descricao.ilike.${pattern}`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
