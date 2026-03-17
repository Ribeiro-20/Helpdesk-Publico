import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createAdminClient();

  const [{ data: contract }, { data: modifications }] = await Promise.all([
    supabase.from("contracts").select("*").eq("id", id).single(),
    supabase
      .from("contract_modifications")
      .select(
        "id, modification_no, description, reason, previous_price, new_price, price_delta, modification_date",
      )
      .eq("contract_id", id)
      .order("modification_no", { ascending: true }),
  ]);

  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ contract, modifications: modifications ?? [] });
}
