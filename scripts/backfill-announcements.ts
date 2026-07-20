import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

type BackfillSource = "all" | "base" | "dr";
type ChunkStatus = "running" | "success" | "failed";

type DateChunk = {
  from: string;
  to: string;
};

type ChunkState = {
  source: "base" | "dr";
  from: string;
  to: string;
  status: ChunkStatus;
  attempts: number;
  started_at: string;
  finished_at: string | null;
  summary: unknown;
  error: string | null;
};

type BackfillState = {
  version: 1;
  from: string;
  to: string;
  dry_run: boolean;
  created_at: string;
  updated_at: string;
  chunks: Record<string, ChunkState>;
};

type Args = {
  from: string;
  to: string;
  source: BackfillSource;
  waitMs: number;
  maxResults: number;
  retries: number;
  statePath: string;
  outputDir: string;
  resume: boolean;
  dryRun: boolean;
  help: boolean;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

loadDotenv({ path: resolve(projectRoot, ".env") });

function todayLisbon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    from: "2024-01-01",
    to: todayLisbon(),
    source: "all",
    waitMs: 30000,
    maxResults: 1000,
    retries: 3,
    statePath: resolve(projectRoot, "tmp", "backfill-announcements-state.json"),
    outputDir: resolve(projectRoot, "tmp", "backfill-dr"),
    resume: true,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--from" && argv[i + 1]) args.from = argv[++i];
    else if (current === "--to" && argv[i + 1]) args.to = argv[++i];
    else if (current === "--source" && argv[i + 1]) {
      const source = argv[++i];
      if (source === "all" || source === "base" || source === "dr") args.source = source;
      else throw new Error("--source deve ser all, base ou dr");
    } else if (current === "--wait-ms" && argv[i + 1]) {
      args.waitMs = parsePositiveInt(argv[++i], args.waitMs);
    } else if (current === "--max-results" && argv[i + 1]) {
      args.maxResults = parsePositiveInt(argv[++i], args.maxResults);
    } else if (current === "--retries" && argv[i + 1]) {
      args.retries = parsePositiveInt(argv[++i], args.retries);
    } else if (current === "--state" && argv[i + 1]) {
      args.statePath = resolve(projectRoot, argv[++i]);
    } else if (current === "--output-dir" && argv[i + 1]) {
      args.outputDir = resolve(projectRoot, argv[++i]);
    } else if (current === "--fresh") args.resume = false;
    else if (current === "--dry-run") args.dryRun = true;
    else if (current === "--help" || current === "-h") args.help = true;
    else throw new Error(`Argumento desconhecido: ${current}`);
  }

  if (args.dryRun && args.statePath.endsWith(".json")) {
    args.statePath = args.statePath.replace(/\.json$/i, ".dry-run.json");
  }

  return args;
}

function printHelp(): void {
  console.log(`
Backfill historico de anuncios BASE + DR

Uso:
  npm run backfill:announcements -- --from 2024-01-01 --to 2026-07-15

Opcoes:
  --source all|base|dr    Fonte a processar (default: all)
  --from YYYY-MM-DD       Data inicial (default: 2024-01-01)
  --to YYYY-MM-DD         Data final (default: hoje em Lisboa)
  --wait-ms N             Espera do scraper DR (default: 30000)
  --max-results N         Limite por dia DR (default: 1000)
  --retries N             Tentativas por bloco (default: 3)
  --state PATH            Ficheiro de checkpoint
  --output-dir PATH       Saida JSON diaria do DR
  --fresh                 Ignorar checkpoint anterior
  --dry-run               Nao persistir anuncios
`);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertArgs(args: Args): void {
  if (!isIsoDate(args.from) || !isIsoDate(args.to)) {
    throw new Error("Datas invalidas. Use YYYY-MM-DD.");
  }
  if (args.from < "2024-01-01") throw new Error("A data inicial minima e 2024-01-01.");
  if (args.from > args.to) throw new Error("--from tem de ser anterior ou igual a --to.");
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthlyChunks(from: string, to: string): DateChunk[] {
  const chunks: DateChunk[] = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(Date.UTC(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      0,
    ));
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({ from: isoDate(chunkStart), to: isoDate(chunkEnd) });
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return chunks;
}

function dailyChunks(from: string, to: string): DateChunk[] {
  const chunks: DateChunk[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  while (cursor <= end) {
    const date = isoDate(cursor);
    chunks.push({ from: date, to: date });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return chunks;
}

function chunkKey(source: "base" | "dr", chunk: DateChunk): string {
  return `${source}:${chunk.from}:${chunk.to}`;
}

async function loadState(args: Args): Promise<BackfillState> {
  if (args.resume && existsSync(args.statePath)) {
    const state = JSON.parse(await readFile(args.statePath, "utf8")) as BackfillState;
    if (state.version !== 1 || state.from !== args.from || state.to !== args.to || state.dry_run !== args.dryRun) {
      throw new Error(
        `Checkpoint incompativel em ${args.statePath}. Use o mesmo intervalo ou execute com --fresh.`,
      );
    }
    return state;
  }

  const now = new Date().toISOString();
  return {
    version: 1,
    from: args.from,
    to: args.to,
    dry_run: args.dryRun,
    created_at: now,
    updated_at: now,
    chunks: {},
  };
}

async function saveState(path: string, state: BackfillState): Promise<void> {
  state.updated_at = new Date().toISOString();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

let stopping = false;
let activeChild: ChildProcess | null = null;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    activeChild?.kill("SIGTERM");
  });
}

async function runTrackedChunk(
  state: BackfillState,
  statePath: string,
  source: "base" | "dr",
  chunk: DateChunk,
  retries: number,
  runner: () => Promise<unknown>,
): Promise<boolean> {
  const key = chunkKey(source, chunk);
  const previous = state.chunks[key];
  if (previous?.status === "success") {
    console.log(`[backfill] skip ${key} (checkpoint success)`);
    return true;
  }

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (stopping) throw new Error("Backfill interrompido pelo utilizador.");

    const totalAttempts = (state.chunks[key]?.attempts ?? 0) + 1;
    state.chunks[key] = {
      source,
      from: chunk.from,
      to: chunk.to,
      status: "running",
      attempts: totalAttempts,
      started_at: new Date().toISOString(),
      finished_at: null,
      summary: null,
      error: null,
    };
    await saveState(statePath, state);

    console.log(`[backfill] ${source} ${chunk.from} -> ${chunk.to}, tentativa ${attempt}/${retries}`);

    try {
      const summary = await runner();
      state.chunks[key] = {
        ...state.chunks[key],
        status: "success",
        finished_at: new Date().toISOString(),
        summary,
        error: null,
      };
      await saveState(statePath, state);
      return true;
    } catch (error) {
      const message = errorMessage(error);
      state.chunks[key] = {
        ...state.chunks[key],
        status: "failed",
        finished_at: new Date().toISOString(),
        error: message,
      };
      await saveState(statePath, state);
      console.error(`[backfill] falhou ${key}: ${message}`);

      if (stopping) throw error;
      if (attempt < retries) await sleep(2000 * attempt);
    }
  }

  return false;
}

async function callIngestBase(args: Args, chunk: DateChunk): Promise<unknown> {
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRole) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta no .env");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ingest-base`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_date: chunk.from,
        to_date: chunk.to,
        dry_run: args.dryRun,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      payload = { raw: text.slice(0, 1000) };
    }

    if (!response.ok) {
      throw new Error(`ingest-base HTTP ${response.status}: ${JSON.stringify(payload)}`);
    }
    if (Number(payload.errors ?? 0) > 0) {
      throw new Error(`ingest-base devolveu erros: ${JSON.stringify(payload)}`);
    }

    console.log(`[backfill] BASE ok ${chunk.from} -> ${chunk.to}: ${JSON.stringify(payload)}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function runChildProcess(command: string, childArgs: string[], cwd: string): Promise<string> {
  return await new Promise((resolveChild, rejectChild) => {
    const child = spawn(command, childArgs, {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChild = child;

    let output = "";
    const append = (chunk: Buffer, target: NodeJS.WriteStream) => {
      const text = chunk.toString("utf8");
      output += text;
      if (output.length > 20 * 1024 * 1024) output = output.slice(-20 * 1024 * 1024);
      target.write(text);
    };

    child.stdout?.on("data", (chunk: Buffer) => append(chunk, process.stdout));
    child.stderr?.on("data", (chunk: Buffer) => append(chunk, process.stderr));

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, 30 * 60 * 1000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      activeChild = null;
      rejectChild(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      activeChild = null;
      if (code === 0) resolveChild(output);
      else rejectChild(new Error(`scraper DR terminou code=${code} signal=${signal ?? "none"}`));
    });
  });
}

function parseDrResult(output: string): Record<string, any> {
  const marker = "[dr-scrape] result-json: ";
  const line = output
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.includes(marker));

  if (!line) throw new Error("O scraper DR nao produziu result-json.");
  return JSON.parse(line.slice(line.indexOf(marker) + marker.length)) as Record<string, any>;
}

async function countBaseAnnouncementsForDate(date: string): Promise<number> {
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRole) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta no .env");
  }

  const query = new URLSearchParams({
    select: "id",
    publication_date: `eq.${date}`,
    source: "eq.BASE_API",
    limit: "1",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/announcements?${query}`, {
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao contar anuncios BASE de ${date}: HTTP ${response.status}`);
  }

  const contentRange = response.headers.get("content-range") ?? "";
  const total = Number.parseInt(contentRange.split("/").at(-1) ?? "", 10);
  if (!Number.isFinite(total)) {
    throw new Error(`Resposta sem contagem BASE valida para ${date}: ${contentRange || "sem content-range"}`);
  }
  return total;
}

async function callDrScraper(args: Args, chunk: DateChunk): Promise<unknown> {
  const tsxCli = resolve(__dirname, "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(tsxCli)) {
    throw new Error(`tsx nao encontrado em ${tsxCli}. Execute npm install em scripts.`);
  }

  await mkdir(args.outputDir, { recursive: true });
  const outputPath = resolve(args.outputDir, `${chunk.from}.json`);
  const scraperArgs = [
    tsxCli,
    "scrape-dr-contracts.ts",
    "--from-date",
    chunk.from,
    "--to-date",
    chunk.to,
    "--wait-ms",
    String(args.waitMs),
    "--max-results",
    String(args.maxResults),
    "--output",
    outputPath,
  ];
  if (!args.dryRun) scraperArgs.push("--upsert");

  const output = await runChildProcess(process.execPath, scraperArgs, __dirname);
  const result = parseDrResult(output);
  const normalized = Number(result.normalized_candidates ?? 0);
  const enrichment = (result.enrichment ?? {}) as Record<string, unknown>;
  const requested = Number(enrichment.requested ?? 0);
  const enriched = Number(enrichment.enriched ?? 0);
  const incomplete = Number(enrichment.incomplete ?? 0);
  const expectedBase = await countBaseAnnouncementsForDate(chunk.from);

  if (normalized >= args.maxResults) {
    throw new Error(`Possivel truncagem DR: ${normalized} resultados atingiram o limite ${args.maxResults}.`);
  }
  if (requested !== normalized || enriched + incomplete !== requested) {
    throw new Error(
      `Contagens DR incoerentes: normalized=${normalized} requested=${requested} enriched=${enriched} incomplete=${incomplete}`,
    );
  }
  if (incomplete > 0) {
    throw new Error(`DR com ${incomplete} detalhe(s) incompleto(s) em ${chunk.from}.`);
  }
  if (
    normalized === 0 &&
    output.includes("no DR daily issue resolved") &&
    expectedBase > 0
  ) {
    throw new Error(`Edicao DR nao resolvida apesar de existirem ${expectedBase} anuncios BASE: ${chunk.from}.`);
  }
  if (normalized < expectedBase) {
    throw new Error(
      `DR incompleto em ${chunk.from}: encontrou ${normalized}, mas existem ${expectedBase} anuncios BASE.`,
    );
  }

  return { ...result, expected_base: expectedBase };
}

function summarizeState(state: BackfillState, source: BackfillSource) {
  const selected = Object.values(state.chunks).filter((chunk) => source === "all" || chunk.source === source);
  return {
    total: selected.length,
    success: selected.filter((chunk) => chunk.status === "success").length,
    failed: selected.filter((chunk) => chunk.status === "failed").length,
    running: selected.filter((chunk) => chunk.status === "running").length,
    failed_chunks: selected
      .filter((chunk) => chunk.status === "failed")
      .map((chunk) => ({ source: chunk.source, from: chunk.from, to: chunk.to, error: chunk.error })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  assertArgs(args);

  const state = await loadState(args);
  await saveState(args.statePath, state);

  console.log(`[backfill] intervalo=${args.from}..${args.to} source=${args.source} dry_run=${args.dryRun}`);
  console.log(`[backfill] checkpoint=${args.statePath}`);

  if (args.source === "all" || args.source === "base") {
    for (const chunk of monthlyChunks(args.from, args.to)) {
      await runTrackedChunk(
        state,
        args.statePath,
        "base",
        chunk,
        args.retries,
        () => callIngestBase(args, chunk),
      );
    }

    const failedBase = Object.values(state.chunks)
      .filter((chunk) => chunk.source === "base" && chunk.status === "failed");
    if (failedBase.length > 0 && args.source === "all") {
      throw new Error(
        `A fase BASE terminou com ${failedBase.length} bloco(s) falhado(s). ` +
        "Execute novamente com o mesmo comando para retomar antes do DR.",
      );
    }
  }

  if (args.source === "all" || args.source === "dr") {
    for (const chunk of dailyChunks(args.from, args.to)) {
      await runTrackedChunk(
        state,
        args.statePath,
        "dr",
        chunk,
        args.retries,
        () => callDrScraper(args, chunk),
      );
    }
  }

  const summary = summarizeState(state, args.source);
  const reportPath = args.statePath.replace(/\.json$/i, ".report.json");
  await writeFile(reportPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    range: { from: args.from, to: args.to },
    source: args.source,
    dry_run: args.dryRun,
    summary,
  }, null, 2), "utf8");

  console.log(`[backfill] resumo=${JSON.stringify(summary)}`);
  console.log(`[backfill] relatorio=${reportPath}`);

  if (summary.failed > 0 || summary.running > 0) {
    throw new Error(`Backfill terminou com ${summary.failed} falha(s) e ${summary.running} bloco(s) incompleto(s).`);
  }
}

main().catch((error) => {
  console.error(`[backfill] fatal: ${errorMessage(error)}`);
  process.exitCode = 1;
});
