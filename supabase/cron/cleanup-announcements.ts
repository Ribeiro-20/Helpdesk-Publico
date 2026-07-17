/**
 * Announcement cleanup scheduler.
 *
 * - Backfills proposal_deadline_at from publication_date + proposal_deadline_days
 *   when the explicit deadline is missing.
 * - Closes announcements whose deadline expired more than the configured
 *   frontoffice retention window ago, while keeping their history in the DB.
 *
 * Usage:
 *   npm run cleanup:announcements:dry-run
 *   npm run cleanup:announcements:once
 *   npm run cleanup:announcements
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type TenantRow = {
  id: string;
  name: string | null;
};

type AnnouncementDeadlineRow = {
  id: string;
  publication_date: string;
  proposal_deadline_days: number | null;
};

type TenantCleanupStats = {
  tenant_id: string;
  tenant_name: string | null;
  deadline_candidates: number;
  deadlines_backfilled: number;
  expired_candidates: number;
  closed_announcements: number;
};

type CleanupStats = {
  dry_run: boolean;
  retention_days: number;
  cutoff_iso: string;
  batch_size: number;
  tenants_processed: number;
  deadline_candidates: number;
  deadlines_backfilled: number;
  expired_candidates: number;
  closed_announcements: number;
  tenants: TenantCleanupStats[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dotenvCandidates = [
  resolve(__dirname, "../../.env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), ".env"),
];

for (const candidate of dotenvCandidates) {
  const result = loadDotenv({ path: candidate, override: true });
  if (Object.keys(result.parsed ?? {}).length > 0) {
    console.log(`[cleanup-announcements] Loaded env from ${candidate}`);
    break;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SCHEDULE = process.env.ANNOUNCEMENT_CLEANUP_SCHEDULE?.trim() || "0 6 * * *";
const RETENTION_DAYS = parsePositiveInt(
  process.env.ANNOUNCEMENT_CLEANUP_RETENTION_DAYS,
  30,
);
const BATCH_SIZE = parsePositiveInt(
  process.env.ANNOUNCEMENT_CLEANUP_BATCH_SIZE,
  200,
);

const args = new Set(process.argv.slice(2));
const RUN_ONCE = args.has("--once");
const DRY_RUN = args.has("--dry-run");

if (!SERVICE_ROLE_KEY) {
  console.error(
    "[cleanup-announcements] SUPABASE_SERVICE_ROLE_KEY is not set. Cannot run cleanup.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function startOfTodayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function cleanupCutoffIso(retentionDays: number): string {
  const cutoff = new Date(startOfTodayUtc().getTime() - retentionDays * MS_PER_DAY);
  return cutoff.toISOString();
}

function parseDateOnly(value: string): { year: number; monthIndex: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
    return null;
  }

  return { year, monthIndex, day };
}

function inferDeadlineAt(publicationDate: string, deadlineDays: number | null): string | null {
  if (deadlineDays == null || deadlineDays < 0) return null;

  const parts = parseDateOnly(publicationDate);
  if (!parts) return null;

  const deadline = new Date(Date.UTC(
    parts.year,
    parts.monthIndex,
    parts.day + deadlineDays,
    // Keep the displayed date stable in Europe/Lisbon, including summer time.
    22,
    59,
    0,
    0,
  ));

  return deadline.toISOString();
}

async function getTenants(client: SupabaseClient): Promise<TenantRow[]> {
  const { data, error } = await client
    .from("tenants")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function countDeadlineCandidates(
  client: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { count, error } = await client
    .from("announcements")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("proposal_deadline_at", null)
    .not("proposal_deadline_days", "is", null)
    .gte("proposal_deadline_days", 0);

  if (error) throw error;
  return count ?? 0;
}

async function backfillDeadlines(
  client: SupabaseClient,
  tenantId: string,
  dryRun: boolean,
): Promise<{ candidates: number; backfilled: number }> {
  const candidates = await countDeadlineCandidates(client, tenantId);
  if (dryRun || candidates === 0) {
    return { candidates, backfilled: 0 };
  }

  let backfilled = 0;

  while (true) {
    const { data, error } = await client
      .from("announcements")
      .select("id, publication_date, proposal_deadline_days")
      .eq("tenant_id", tenantId)
      .is("proposal_deadline_at", null)
      .not("proposal_deadline_days", "is", null)
      .gte("proposal_deadline_days", 0)
      .limit(BATCH_SIZE);

    if (error) throw error;

    const rows = (data ?? []) as AnnouncementDeadlineRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const deadlineAt = inferDeadlineAt(row.publication_date, row.proposal_deadline_days);
      if (!deadlineAt) continue;

      const { error: updateError } = await client
        .from("announcements")
        .update({ proposal_deadline_at: deadlineAt })
        .eq("tenant_id", tenantId)
        .eq("id", row.id)
        .is("proposal_deadline_at", null);

      if (updateError) throw updateError;
      backfilled += 1;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return { candidates, backfilled };
}

async function countExpiredCandidates(
  client: SupabaseClient,
  tenantId: string,
  cutoffIso: string,
): Promise<number> {
  const { count, error } = await client
    .from("announcements")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .not("proposal_deadline_at", "is", null)
    .lt("proposal_deadline_at", cutoffIso);

  if (error) throw error;
  return count ?? 0;
}

async function closeExpiredAnnouncements(
  client: SupabaseClient,
  tenantId: string,
  cutoffIso: string,
  dryRun: boolean,
): Promise<{ candidates: number; closed: number }> {
  const candidates = await countExpiredCandidates(client, tenantId, cutoffIso);
  if (dryRun || candidates === 0) {
    return { candidates, closed: 0 };
  }

  let closed = 0;

  while (true) {
    const { data, error } = await client
      .from("announcements")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .not("proposal_deadline_at", "is", null)
      .lt("proposal_deadline_at", cutoffIso)
      .limit(BATCH_SIZE);

    if (error) throw error;

    const ids = (data ?? [])
      .map((row: { id?: string }) => row.id)
      .filter((id): id is string => Boolean(id));

    if (ids.length === 0) break;

    const { error: updateError } = await client
      .from("announcements")
      .update({ status: "closed" })
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("id", ids);

    if (updateError) throw updateError;

    closed += ids.length;

    if (ids.length < BATCH_SIZE) break;
  }

  return { candidates, closed };
}

async function runCleanup(): Promise<CleanupStats> {
  const cutoffIso = cleanupCutoffIso(RETENTION_DAYS);
  const tenants = await getTenants(supabase);

  const stats: CleanupStats = {
    dry_run: DRY_RUN,
    retention_days: RETENTION_DAYS,
    cutoff_iso: cutoffIso,
    batch_size: BATCH_SIZE,
    tenants_processed: tenants.length,
    deadline_candidates: 0,
    deadlines_backfilled: 0,
    expired_candidates: 0,
    closed_announcements: 0,
    tenants: [],
  };

  for (const tenant of tenants) {
    const deadlineStats = await backfillDeadlines(supabase, tenant.id, DRY_RUN);
    const closeStats = await closeExpiredAnnouncements(supabase, tenant.id, cutoffIso, DRY_RUN);

    const tenantStats: TenantCleanupStats = {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      deadline_candidates: deadlineStats.candidates,
      deadlines_backfilled: deadlineStats.backfilled,
      expired_candidates: closeStats.candidates,
      closed_announcements: closeStats.closed,
    };

    stats.deadline_candidates += tenantStats.deadline_candidates;
    stats.deadlines_backfilled += tenantStats.deadlines_backfilled;
    stats.expired_candidates += tenantStats.expired_candidates;
    stats.closed_announcements += tenantStats.closed_announcements;
    stats.tenants.push(tenantStats);
  }

  return stats;
}

async function main() {
  console.log(
    `[cleanup-announcements] Running cleanup${DRY_RUN ? " (dry-run)" : ""} ...`,
  );

  const stats = await runCleanup();
  console.log("[cleanup-announcements] Result", JSON.stringify(stats, null, 2));
}

if (RUN_ONCE) {
  main()
    .then(() => {
      console.log("[cleanup-announcements] Done.");
    })
    .catch((error) => {
      console.error("[cleanup-announcements] Failed:", error);
      process.exit(1);
    });
} else {
  console.log("[cleanup-announcements] Starting daemon ...");
  console.log(`[cleanup-announcements] Scheduled: cleanup announcements -> ${SCHEDULE}`);
  console.log("[cleanup-announcements] Press Ctrl+C to stop.");

  cron.schedule(
    SCHEDULE,
    () => {
      main().catch((error) => {
        console.error("[cleanup-announcements] Scheduled run failed:", error);
      });
    },
    { timezone: "Europe/Lisbon" },
  );
}
