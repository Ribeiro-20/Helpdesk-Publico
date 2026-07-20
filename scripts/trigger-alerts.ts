import { config } from "dotenv";
config();

async function run() {
  console.log("Triggering mi-contract-alerts...");
  const res = await fetch(process.env.SUPABASE_URL + "/functions/v1/mi-contract-alerts", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    }
  });
  
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Response: ${text}`);
}

run().catch(console.error);
