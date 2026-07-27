import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractDeadlineAtFromDrText } from "./lib/drDeadline.ts";
import { addDaysToPortugalDateEnd } from "../supabase/functions/_shared/portugalTime.ts";

type Args = {
  apply: boolean;
  batchSize: number;
  limit: number | null;
  tenantId: string | null;
  announcementNumber: string | null;
};

type AnnouncementRow = {
  id: string;
  tenant_id: string;
  dr_announcement_no: string | null;
  publication_date: string;
  proposal_deadline_days: number | null;
  proposal_deadline_at: string | null;
  raw_payload: unknown;
};

type ChangeExample = {
  id: string;
  dr_announcement_no: string | null;
  basis: "dr_source" | "legacy_base_fallback";
  before: string | null;
  after: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

loadDotenv({ path: resolve(projectRoot, ".env") });
loadDotenv({ path: resolve(projectRoot, "supabase/functions/.env") });

function readArg(name: string): string | null {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim() || null;

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(): Args {
  const limitValue = readArg("--limit");
  return {
    apply: process.argv.includes("--apply"),
    batchSize: Math.min(parsePositiveInt(readArg("--batch-size"), 100), 500),
    limit: limitValue ? parsePositiveInt(limitValue, 1) : null,
    tenantId: readArg("--tenant-id"),
    announcementNumber: readArg("--announcement-number"),
  };
}

function findDeadlineInRawPayload(value: unknown): string | null {
  if (typeof value === "string") {
    return extractDeadlineAtFromDrText(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDeadlineInRawPayload(item);
      if (found) return found;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findDeadlineInRawPayload(item);
      if (found) return found;
    }
  }

  return null;
}

function sameInstant(left: string | null, right: string): boolean {
  if (!left) return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) &&
    Number.isFinite(rightMs) &&
    Math.abs(leftMs - rightMs) < 1000;
}

function legacyBaseFallbackCorrection(row: AnnouncementRow): string | null {
  if (
    row.proposal_deadline_days == null ||
    row.proposal_deadline_days < 0 ||
    !row.proposal_deadline_at
  ) {
    return null;
  }

  const publication = row.publication_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!publication) return null;

  const target = new Date(Date.UTC(
    Number(publication[1]),
    Number(publication[2]) - 1,
    Number(publication[3]) + row.proposal_deadline_days,
  ));
  const legacyIso = `${target.toISOString().slice(0, 10)}T00:00:00.000Z`;
  if (!sameInstant(row.proposal_deadline_at, legacyIso)) return null;

  return addDaysToPortugalDateEnd(
    row.publication_date,
    row.proposal_deadline_days,
  );
}

async function main() {
  const args = parseArgs();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const stats = {
    mode: args.apply ? "apply" : "dry-run",
    scanned: 0,
    dr_source_deadlines_found: 0,
    legacy_base_fallbacks_found: 0,
    unchanged: 0,
    would_update: 0,
    updated: 0,
    concurrent_changes_skipped: 0,
    source_deadline_missing: 0,
    errors: 0,
    examples: [] as ChangeExample[],
  };

  let offset = 0;
  while (args.limit == null || stats.scanned < args.limit) {
    const remaining = args.limit == null
      ? args.batchSize
      : Math.min(args.batchSize, args.limit - stats.scanned);

    let query = supabase
      .from("announcements")
      .select("id, tenant_id, dr_announcement_no, publication_date, proposal_deadline_days, proposal_deadline_at, raw_payload")
      .not("raw_payload", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + remaining - 1);

    if (args.tenantId) query = query.eq("tenant_id", args.tenantId);
    if (args.announcementNumber) {
      query = query.eq("dr_announcement_no", args.announcementNumber);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as AnnouncementRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      stats.scanned += 1;
      const sourceDeadline = findDeadlineInRawPayload(row.raw_payload);
      const corrected = sourceDeadline ?? legacyBaseFallbackCorrection(row);
      if (!corrected) {
        stats.source_deadline_missing += 1;
        continue;
      }

      const basis = sourceDeadline ? "dr_source" : "legacy_base_fallback";
      if (basis === "dr_source") stats.dr_source_deadlines_found += 1;
      else stats.legacy_base_fallbacks_found += 1;

      if (sameInstant(row.proposal_deadline_at, corrected)) {
        stats.unchanged += 1;
        continue;
      }

      stats.would_update += 1;
      if (stats.examples.length < 20) {
        stats.examples.push({
          id: row.id,
          dr_announcement_no: row.dr_announcement_no,
          basis,
          before: row.proposal_deadline_at,
          after: corrected,
        });
      }

      if (!args.apply) continue;

      let update = supabase
        .from("announcements")
        .update({ proposal_deadline_at: corrected })
        .eq("tenant_id", row.tenant_id)
        .eq("id", row.id);

      update = row.proposal_deadline_at
        ? update.eq("proposal_deadline_at", row.proposal_deadline_at)
        : update.is("proposal_deadline_at", null);

      const { data: updatedRows, error: updateError } = await update.select("id");
      if (updateError) {
        stats.errors += 1;
        console.error(
          `[deadline-backfill] ${row.dr_announcement_no ?? row.id}: ${updateError.message}`,
        );
        continue;
      }

      if ((updatedRows?.length ?? 0) === 0) {
        stats.concurrent_changes_skipped += 1;
      } else {
        stats.updated += 1;
      }
    }

    offset += rows.length;
    if (rows.length < remaining || args.announcementNumber) break;
  }

  console.log(JSON.stringify(stats, null, 2));
  if (!args.apply && stats.would_update > 0) {
    console.log(
      "[deadline-backfill] Dry-run only. Re-run with --apply after reviewing the examples.",
    );
  }

  if (stats.errors > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[deadline-backfill] fatal:", error);
  process.exit(1);
});
