import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BATCH_SIZE = 500;

async function main() {
  const jsonPath = resolve(__dirname, "..", "cpvs_final.json");
  const raw = readFileSync(jsonPath, "utf-8");
  const cpvs: { id: string; descricao: string }[] = JSON.parse(raw);

  console.log(`Loaded ${cpvs.length} CPV codes from cpvs_final.json`);

  let inserted = 0;
  for (let i = 0; i < cpvs.length; i += BATCH_SIZE) {
    const batch = cpvs.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("cpv_codes")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      console.error(`Error at batch ${i}:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${cpvs.length}`);
  }

  console.log("Done!");
}

main();
