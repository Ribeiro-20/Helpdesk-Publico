#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "http://127.0.0.1:55321",
  "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const testEmail = "1021257@alunos.ruizcosta.edu.pt";

console.log("=== Testing email workflow ===\n");

// Step 0: Get tenant
console.log("0. Getting tenant...");
const { data: tenants, error: tenantErr } = await supabase
  .from("tenants")
  .select("id")
  .limit(1);
if (tenantErr || !tenants || tenants.length === 0) { 
  console.error("Error getting tenant:", tenantErr?.message); 
  process.exit(1); 
}
const tenantId = tenants[0].id;
console.log(`Using tenant: ${tenantId}\n`);

// Step 0.5: Update or create test client with the specified email
console.log(`1. Updating test client email to: ${testEmail}...`);
const { data: existingClient, error: checkErr } = await supabase
  .from("clients")
  .select("id")
  .eq("tenant_id", tenantId)
  .limit(1);

let clientId;
if (existingClient && existingClient.length > 0) {
  clientId = existingClient[0].id;
  const { error: updateErr } = await supabase
    .from("clients")
    .update({ email: testEmail })
    .eq("id", clientId);
  if (updateErr) { console.error("Error:", updateErr.message); process.exit(1); }
  console.log(`Updated client ${clientId} with email: ${testEmail}\n`);
} else {
  console.error("No test client found!");
  process.exit(1);
}

// Step 1: Delete ALL notifications so we can recreate them
console.log("2. Cleaning ALL notifications...");
const { error: deleteErr } = await supabase
  .from("notifications")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
if (deleteErr) { console.error("Error:", deleteErr.message); process.exit(1); }
console.log("Done\n");

// Step 2: Create fresh notifications (scheduled for NOW via QUEUE_AUTO_SCHEDULE=false)
console.log("3. Creating notifications (match-and-queue)...");
const matchRes = await fetch("http://127.0.0.1:55321/functions/v1/match-and-queue", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const matchData = await matchRes.json();
console.log("Result:", JSON.stringify(matchData, null, 2), "\n");

// Step 3: Send emails
console.log("4. Sending emails...");
const emailRes = await fetch("http://127.0.0.1:55321/functions/v1/send-emails", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const emailData = await emailRes.json();
console.log("Result:", JSON.stringify(emailData, null, 2));
