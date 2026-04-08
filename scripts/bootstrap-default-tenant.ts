import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME ?? "Default";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: existing, error: existingError } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("name", DEFAULT_TENANT_NAME)
    .maybeSingle();

  if (existingError) {
    console.error("Failed to query tenants:", existingError.message);
    process.exit(1);
  }

  if (existing) {
    console.log(`Default tenant already exists: ${existing.id} (${existing.name})`);
    return;
  }

  const { data: tenant, error: insertError } = await supabase
    .from("tenants")
    .insert({ name: DEFAULT_TENANT_NAME })
    .select("id, name")
    .single();

  if (insertError || !tenant) {
    console.error("Failed to create default tenant:", insertError?.message ?? "unknown error");
    process.exit(1);
  }

  console.log(`Created default tenant: ${tenant.id} (${tenant.name})`);
}

main().catch((error) => {
  console.error("bootstrap-default-tenant fatal:", error);
  process.exit(1);
});
