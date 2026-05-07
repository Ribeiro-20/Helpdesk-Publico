import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  return NextResponse.json({ announcement, versions: versions ?? [] });
}