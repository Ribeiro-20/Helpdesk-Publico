import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { validateDrIngestDateRange } from "@/lib/dr-ingest-validation";

const execFileAsync = promisify(execFile);

export type DrIngestInput = {
  fromDate: string;
  toDate: string;
  waitMs: number;
  maxResults: number;
};

export type DrIngestResult = {
  ok: true;
  from_date: string;
  to_date: string;
  normalized_candidates: number | null;
  summary: string | null;
  output: string;
};

export async function runDrIngest(input: DrIngestInput): Promise<DrIngestResult> {
  validateDrIngestDateRange(input.fromDate, input.toDate);

  const cwd = process.cwd();
  const scriptDirCandidates = [
    path.resolve(cwd, "scripts"),
    path.resolve(cwd, "..", "scripts"),
    path.resolve(cwd, "..", "..", "scripts"),
    path.resolve(cwd, "..", "..", "..", "scripts"),
  ];
  const scriptsDir = scriptDirCandidates.find((candidate) =>
    existsSync(path.join(candidate, "scrape-dr-contracts.ts")),
  );

  if (!scriptsDir) {
    throw new Error(`Não foi possível localizar a pasta scripts a partir de ${cwd}.`);
  }

  const tsxCliCandidates = [
    path.join(scriptsDir, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(scriptsDir, "node_modules", ".bin", "tsx"),
    path.join(scriptsDir, "node_modules", ".bin", "tsx.cmd"),
  ];
  const tsxCli = tsxCliCandidates.find((candidate) => existsSync(candidate));

  if (!tsxCli) {
    throw new Error(
      `Não foi possível localizar o executável tsx em ${scriptsDir}. ` +
        "Execute 'npm install --prefix scripts' e tente novamente.",
    );
  }

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      tsxCli,
      "scrape-dr-contracts.ts",
      "--upsert",
      "--from-date",
      input.fromDate,
      "--to-date",
      input.toDate,
      "--wait-ms",
      String(input.waitMs),
      "--max-results",
      String(input.maxResults),
    ],
    {
      cwd: scriptsDir,
      timeout: 30 * 60 * 1000,
      shell: false,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10,
    },
  );

  const output = `${stdout ?? ""}\n${stderr ?? ""}`;
  const summary = output
    .split(/\r?\n/)
    .find((line) => line.includes("[dr-scrape] inserted=")) ?? null;
  const normalizedLine = output
    .split(/\r?\n/)
    .find((line) => line.includes("[dr-scrape] normalized candidates:")) ?? null;
  const normalizedCandidates = normalizedLine
    ? Number.parseInt(normalizedLine.split(":").pop()?.trim() ?? "", 10)
    : null;

  return {
    ok: true,
    from_date: input.fromDate,
    to_date: input.toDate,
    normalized_candidates: Number.isFinite(normalizedCandidates) ? normalizedCandidates : null,
    summary,
    output: output.slice(-12000),
  };
}
