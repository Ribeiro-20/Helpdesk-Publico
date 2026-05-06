/* eslint-disable no-console */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY nao definido no .env");
  process.exit(1);
}

const now = new Date();
const currentYear = String(now.getUTCFullYear());
const args = process.argv.slice(2);
const statsOnly = args.includes("--stats-only");
const fromDate = args[0] && !args[0].startsWith("--") ? args[0] : `${currentYear}-01-01`;
const toDate = args[1] && !args[1].startsWith("--") ? args[1] : `${currentYear}-12-31`;
const maxRetries = 3;
const initialChunkDays = 7;
const minChunkDays = 1;

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
  }

  return data;
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function splitRangeByDays(from, to, maxDays) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error("Intervalo inválido. Usa datas no formato YYYY-MM-DD.");
  }

  const ranges = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    ranges.push({ from: toIsoDate(chunkStart), to: toIsoDate(chunkEnd) });
    cursor.setUTCDate(chunkEnd.getUTCDate() + 1);
  }

  return ranges;
}

function daysBetweenInclusive(from, to) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function splitRangeInHalf(from, to) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const totalDays = daysBetweenInclusive(from, to);
  const firstHalfDays = Math.floor(totalDays / 2);
  const mid = new Date(start);
  mid.setUTCDate(mid.getUTCDate() + firstHalfDays - 1);
  const next = new Date(mid);
  next.setUTCDate(next.getUTCDate() + 1);

  return [
    { from: toIsoDate(start), to: toIsoDate(mid) },
    { from: toIsoDate(next), to: toIsoDate(end) },
  ];
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isWorkerLimitError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("WORKER_LIMIT") || msg.includes("HTTP 546");
}

async function runDirectIngestFallback(range) {
  const scriptPath = path.resolve(__dirname, "ingest-direct.js");
  console.warn(
    `[market:refresh] fallback ingest-direct para ${range.from} -> ${range.to}`,
  );

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [scriptPath, "--from", range.from, "--to", range.to, "--limit", "200000"],
    {
      cwd: __dirname,
      maxBuffer: 1024 * 1024 * 10,
      env: {
        ...process.env,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      },
    },
  );

  const output = `${stdout || ""}${stderr || ""}`.trim();
  if (output) {
    const lines = output.split(/\r?\n/);
    const tail = lines.slice(-10).join("\n");
    console.log(`[market:refresh] ingest-direct resumo:\n${tail}`);
  }
}

async function runIngestWithAdaptiveChunks(initialRanges) {
  const queue = [...initialRanges];
  const failedWorkerLimitRanges = [];
  let processed = 0;

  while (queue.length > 0) {
    const range = queue.shift();
    processed += 1;
    console.log(
      `[market:refresh] ingest-contracts bloco ${processed}: ${range.from} -> ${range.to} (pendentes=${queue.length})`,
    );

    let success = false;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const ingestResult = await postJson(
          `${SUPABASE_URL}/functions/v1/ingest-contracts`,
          { from_date: range.from, to_date: range.to },
        );
        console.log("[market:refresh] ingest-contracts ok:", ingestResult);
        success = true;
        break;
      } catch (err) {
        const retryable = isWorkerLimitError(err);
        if (!retryable || attempt === maxRetries) {
          const rangeDays = daysBetweenInclusive(range.from, range.to);
          if (retryable && rangeDays > minChunkDays) {
            const halves = splitRangeInHalf(range.from, range.to);
            queue.unshift(halves[1]);
            queue.unshift(halves[0]);
            console.warn(
              `[market:refresh] WORKER_LIMIT em ${range.from} -> ${range.to}; bloco dividido em ${halves[0].from} -> ${halves[0].to} e ${halves[1].from} -> ${halves[1].to}`,
            );
            success = true;
            break;
          }
          if (retryable && rangeDays <= minChunkDays) {
            try {
              await runDirectIngestFallback(range);
              console.warn(
                `[market:refresh] WORKER_LIMIT persistente em ${range.from} -> ${range.to}; fallback ingest-direct concluído`,
              );
              success = true;
              break;
            } catch (fallbackErr) {
              failedWorkerLimitRanges.push(range);
              console.warn(
                `[market:refresh] fallback ingest-direct falhou em ${range.from} -> ${range.to}: ${String(fallbackErr)}`,
              );
              success = true;
              break;
            }
          }
          throw err;
        }

        const backoffMs = 1000 * attempt;
        console.warn(
          `[market:refresh] tentativa ${attempt}/${maxRetries} falhou em ${range.from} -> ${range.to}; nova tentativa em ${backoffMs}ms`,
        );
        await sleep(backoffMs);
      }
    }

    if (!success) {
      throw new Error(`Falha ao processar bloco ${range.from} -> ${range.to}`);
    }
  }

  return failedWorkerLimitRanges;
}

async function run() {
  if (!statsOnly) {
    const ranges = splitRangeByDays(fromDate, toDate, initialChunkDays);
    console.log(`[market:refresh] ingest-contracts em ${ranges.length} bloco(s)`);
    const failedRanges = await runIngestWithAdaptiveChunks(ranges);
    if (failedRanges.length > 0) {
      const summary = failedRanges.map((r) => `${r.from}->${r.to}`).join(", ");
      console.warn(`[market:refresh] blocos com WORKER_LIMIT ignorados: ${summary}`);
    }
  } else {
    console.log("[market:refresh] stats-only: ingest-contracts ignorado");
  }

  console.log("[market:refresh] compute-stats (target=cpv, mode=full)");
  const statsResult = await postJson(
    `${SUPABASE_URL}/functions/v1/compute-stats`,
    { target: "cpv", mode: "full" },
  );
  console.log("[market:refresh] compute-stats ok:", statsResult);
}

run().catch((err) => {
  console.error("[market:refresh] erro:", err.message || err);
  process.exit(1);
});
