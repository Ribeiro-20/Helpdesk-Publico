#!/usr/bin/env node

/**
 * Ingest contracts in small daily chunks to avoid WORKER_LIMIT errors.
 * This script makes multiple HTTP calls to the ingest-contracts endpoint,
 * each with only 1 day of data instead of a full year.
 *
 * Usage:
 *   node scripts/ingest-chunks.js --from 2026-03-01 --to 2026-03-31
 *   node scripts/ingest-chunks.js                    (uses last 7 days)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Parse CLI args
  let fromDate = null;
  let toDate = null;
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) fromDate = args[++i];
    if (args[i] === "--to" && args[i + 1]) toDate = args[++i];
  }

  // Default to last 7 days
  if (!fromDate || !toDate) {
    const today = new Date();
    const minus7 = new Date(today);
    minus7.setDate(minus7.getDate() - 7);
    fromDate = formatDate(minus7);
    toDate = formatDate(today);
  }

  // Validate dates
  if (!isValidDate(fromDate) || !isValidDate(toDate)) {
    console.error("Invalid date format. Use YYYY-MM-DD.");
    process.exit(1);
  }

  if (fromDate > toDate) {
    console.error("from_date must be <= to_date");
    process.exit(1);
  }

  // Read token from env file
  const envPath = path.join(__dirname, "../supabase/functions/.env");
  const token = readTokenFromEnv(envPath);
  if (!token) {
    console.error("Could not find BASE_API_TOKEN in", envPath);
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable.\n" +
      "Get it from: supabase status --output json"
    );
    process.exit(1);
  }

  const ingestUrl = `${supabaseUrl}/functions/v1/ingest-contracts`;

  // Generate 1-day windows and ingest them
  console.log(`\n[ingest-chunks] Ingesting contracts from ${fromDate} to ${toDate}`);
  console.log(`[ingest-chunks] Target: ${ingestUrl}`);
  console.log(`[ingest-chunks] Processing 1 day at a time to avoid WORKER_LIMIT\n`);

  let current = parseDate(fromDate);
  const end = parseDate(toDate);
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  while (current <= end) {
    const dayStr = formatDate(current);
    const nextDay = new Date(current);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = formatDate(nextDay);

    const windowEnd = nextDay <= end ? dayStr : toDate;

    try {
      console.log(
        `[ingest-chunks] Processing: ${dayStr} (1-day window)`
      );

      const response = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_date: dayStr,
          to_date: windowEnd,
          year: 2026,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`  ❌ HTTP ${response.status}: ${data.error || "Unknown error"}`);
        totalErrors++;
      } else {
        console.log(
          `  ✓ fetched=${data.fetched} inserted=${data.inserted} ` +
          `updated=${data.updated} skipped=${data.skipped}`
        );
        totalInserted += data.inserted || 0;
        totalUpdated += data.updated || 0;
        totalErrors += data.errors || 0;
      }
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      totalErrors++;
    }

    current.setDate(current.getDate() + 1);
  }

  console.log(`\n[ingest-chunks] Done!`);
  console.log(`[ingest-chunks] Total inserted: ${totalInserted}`);
  console.log(`[ingest-chunks] Total updated: ${totalUpdated}`);
  console.log(`[ingest-chunks] Total errors: ${totalErrors}`);

  if (totalErrors > 0) process.exit(1);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return new Date(`${y}-${mm}-${dd}T00:00:00Z`);
}

function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(parseDate(dateStr).getTime());
}

function readTokenFromEnv(envPath) {
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    const match = content.match(/BASE_API_TOKEN\s*=\s*(.+)/);
    return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});

