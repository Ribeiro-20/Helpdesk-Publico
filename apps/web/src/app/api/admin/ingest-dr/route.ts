import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

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

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function defaultDateRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 2);

  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { fromDate: toIso(from), toDate: toIso(today) };
}

function daysInclusive(fromDate: string, toDate: string): number {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
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
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (appUserError) {
      return NextResponse.json({ error: appUserError.message }, { status: 500 });
    }

    if (!appUser || appUser.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado: apenas admin." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsedBody = body as Record<string, unknown>;
    const waitMs = parsePositiveInt(parsedBody.wait_ms, 12000);
    const defaults = defaultDateRange();
    const fromDate = isIsoDate(parsedBody.from_date) ? parsedBody.from_date : defaults.fromDate;
    const toDate = isIsoDate(parsedBody.to_date) ? parsedBody.to_date : defaults.toDate;
    const days = daysInclusive(fromDate, toDate);
    const defaultMaxResults = Math.min(Math.max(days * 250, 300), 5000);
    const maxResults = parsePositiveInt(parsedBody.max_results, defaultMaxResults);

    if (days <= 0) {
      return NextResponse.json(
        { error: "A data final tem de ser igual ou posterior à data inicial." },
        { status: 400 },
      );
    }

    if (days > 15) {
      return NextResponse.json(
        { error: "Só é possível fazer pesquisa por 2 semanas." },
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
    const scriptsDir = scriptDirCandidates.find((p) => existsSync(path.join(p, "scrape-dr-contracts.ts")));

    if (!scriptsDir) {
      return NextResponse.json(
        {
          error: `Não foi possível localizar a pasta scripts a partir de ${cwd}.`,
        },
        { status: 500 },
      );
    }

    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

    const { stdout, stderr } = await execFileAsync(
      npmCmd,
      [
        "run",
        "scrape-dr:upsert",
        "--",
        "--from-date",
        fromDate,
        "--to-date",
        toDate,
        "--wait-ms",
        String(waitMs),
        "--max-results",
        String(maxResults),
      ],
      {
        cwd: scriptsDir,
        timeout: 30 * 60 * 1000,
        shell: process.platform === "win32",
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 10,
      },
    );

    const output = `${stdout ?? ""}\n${stderr ?? ""}`;
    const summaryLine = output
      .split(/\r?\n/)
      .find((line) => line.includes("[dr-scrape] inserted=")) ?? null;
    const normalizedLine = output
      .split(/\r?\n/)
      .find((line) => line.includes("[dr-scrape] normalized candidates:")) ?? null;

    const normalizedCandidates = normalizedLine
      ? Number.parseInt(normalizedLine.split(":").pop()?.trim() ?? "", 10)
      : null;

    return NextResponse.json({
      ok: true,
      from_date: fromDate,
      to_date: toDate,
      normalized_candidates: Number.isFinite(normalizedCandidates) ? normalizedCandidates : null,
      summary: summaryLine,
      output: output.slice(-12000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Falha a executar ingestão DR: ${message}` },
      { status: 500 },
    );
  }
}
