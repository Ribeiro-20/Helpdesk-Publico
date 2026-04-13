import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function daysInclusive(fromDate: string, toDate: string): number {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

function defaultDateRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 2);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { fromDate: toIso(from), toDate: toIso(today) };
}

function parseNumericLine(output: string, label: string): number {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`\\[ingest-direct\\] ${escaped}:\\s*(\\d+)`));
  return match ? Number.parseInt(match[1], 10) : 0;
}

async function resolveSupabaseRuntimeEnv(baseDir: string): Promise<{ supabaseUrl: string; serviceRoleKey: string }> {
  const envUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envKey) {
    return { supabaseUrl: envUrl, serviceRoleKey: envKey };
  }

  const supabaseCmd = process.platform === "win32" ? "supabase.exe" : "supabase";
  const { stdout } = await execFileAsync(
    supabaseCmd,
    ["status", "--output", "json"],
    {
      cwd: baseDir,
      timeout: 20_000,
      shell: process.platform === "win32",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 2,
    },
  );

  const parsed = JSON.parse(stdout) as { REST_URL?: string; SERVICE_ROLE_KEY?: string };
  const supabaseUrl = parsed.REST_URL ?? envUrl;
  const serviceRoleKey = parsed.SERVICE_ROLE_KEY ?? envKey;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Não foi possível obter SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY via ambiente nem supabase status.");
  }

  return { supabaseUrl, serviceRoleKey };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .select("role, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (appUserError) {
      return NextResponse.json({ error: appUserError.message }, { status: 500 });
    }

    if (!appUser || appUser.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado: apenas admin." }, { status: 403 });
    }

    const tenantId = typeof appUser.tenant_id === "string" && appUser.tenant_id.length > 0
      ? appUser.tenant_id
      : null;

    const body = await req.json().catch(() => ({}));
    const parsedBody = body as Record<string, unknown>;
    const defaults = defaultDateRange();
    const fromDate = isIsoDate(parsedBody.from_date) ? parsedBody.from_date : defaults.fromDate;
    const toDate = isIsoDate(parsedBody.to_date) ? parsedBody.to_date : defaults.toDate;
    const limit = parsePositiveInt(parsedBody.limit, 200000);
    const days = daysInclusive(fromDate, toDate);

    if (days <= 0) {
      return NextResponse.json(
        { error: "A data final tem de ser igual ou posterior à data inicial." },
        { status: 400 },
      );
    }

    if (days > 15) {
      return NextResponse.json(
        { error: "Intervalo demasiado grande para contratos. Use blocos de até 15 dias." },
        { status: 400 },
      );
    }

    const cwd = process.cwd();
    const scriptDirCandidates = [
      path.resolve(cwd, "scripts"),
      path.resolve(cwd, "..", "scripts"),
      path.resolve(cwd, "..", "..", "scripts"),
      path.resolve(cwd, "..", "..", "..", "scripts"),
    ];
    const scriptsDir = scriptDirCandidates.find((p) => existsSync(path.join(p, "ingest-direct.js")));

    if (!scriptsDir) {
      return NextResponse.json(
        { error: `Não foi possível localizar a pasta scripts a partir de ${cwd}.` },
        { status: 500 },
      );
    }

    const baseDirCandidates = [
      path.resolve(cwd),
      path.resolve(cwd, ".."),
      path.resolve(cwd, "..", ".."),
      path.resolve(cwd, "..", "..", ".."),
    ];
    const baseDir = baseDirCandidates.find((p) => existsSync(path.join(p, "supabase", "config.toml"))) ?? cwd;
    const runtimeEnv = await resolveSupabaseRuntimeEnv(baseDir);

    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

    const { stdout, stderr } = await execFileAsync(
      npmCmd,
      [
        "run",
        "ingest-contracts:direct",
        "--",
        "--from",
        fromDate,
        "--to",
        toDate,
        "--limit",
        String(limit),
        ...(tenantId ? ["--tenant-id", tenantId] : []),
      ],
      {
        cwd: scriptsDir,
        timeout: 45 * 60 * 1000,
        shell: process.platform === "win32",
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 20,
        env: {
          ...process.env,
          SUPABASE_URL: runtimeEnv.supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: runtimeEnv.serviceRoleKey,
        },
      },
    );

    const output = `${stdout ?? ""}\n${stderr ?? ""}`;

    return NextResponse.json({
      ok: true,
      from_date: fromDate,
      to_date: toDate,
      fetched: parseNumericLine(output, "Fetched"),
      inserted: parseNumericLine(output, "Inserted"),
      updated: 0,
      skipped: parseNumericLine(output, "Skipped"),
      linked_to_announcements: 0,
      entities_touched: 0,
      companies_touched: 0,
      errors: parseNumericLine(output, "Errors"),
      output: output.slice(-12000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Falha a executar ingestão de contratos: ${message}` },
      { status: 500 },
    );
  }
}
