import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const client = new Client("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
await client.connect();
try {
  await client.queryArray(`
    ALTER TABLE mi_subscribers ADD COLUMN IF NOT EXISTS cpv_codes JSONB NOT NULL DEFAULT '[]'::jsonb; 
    ALTER TABLE mi_subscribers ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT; 
    ALTER TABLE mi_subscribers ADD COLUMN IF NOT EXISTS hubspot_synced_at TIMESTAMPTZ; 
    CREATE INDEX IF NOT EXISTS mi_subscribers_hubspot_id_idx ON mi_subscribers(hubspot_contact_id);
  `);
  console.log("Migration applied successfully!");
} catch (e) {
  console.error("Error applying migration:", e);
} finally {
  await client.end();
}
