import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createAdminClient();

  let contractIdToFetch = id;

  // 1. Try fetching directly from contracts table by id
  let { data: contract } = await supabase.from("contracts").select("*").eq("id", contractIdToFetch).maybeSingle();

  // 2. Fallback: if not found, check if id is a mi_contracts.id UUID and resolve contract_id
  if (!contract) {
    const { data: miRow } = await supabase.from("mi_contracts").select("contract_id").eq("id", id).maybeSingle();
    if (miRow?.contract_id) {
      contractIdToFetch = miRow.contract_id;
      const { data: fallbackContract } = await supabase.from("contracts").select("*").eq("id", contractIdToFetch).maybeSingle();
      contract = fallbackContract;
    }
  }

  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: modifications } = await supabase
    .from("contract_modifications")
    .select("id, modification_no, description, reason, previous_price, new_price, price_delta, modification_date")
    .eq("contract_id", contractIdToFetch)
    .order("modification_no", { ascending: true });

  return NextResponse.json({ contract, modifications: modifications ?? [] });
}
