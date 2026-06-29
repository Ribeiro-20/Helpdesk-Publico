import { spawn, type ChildProcess } from "node:child_process";

type ManagedProcess = {
  name: string;
  child: ChildProcess;
};

const processes: ManagedProcess[] = [];
let shuttingDown = false;

function startProcess(name: string, args: string[]) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    shell: false,
  });

  processes.push({ name, child });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;

    console.error(
      `[cron:start] ${name} stopped unexpectedly with code=${code ?? "null"} signal=${signal ?? "null"}`,
    );
    stopAll(1);
  });
}

function stopAll(exitCode = 0) {
  shuttingDown = true;

  for (const item of processes) {
    if (!item.child.killed) {
      item.child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 250);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

console.log("[cron:start] Starting all cron workers ...");
startProcess("main-cron", ["./node_modules/tsx/dist/cli.mjs", "run.ts"]);
startProcess("cleanup-announcements", [
  "./node_modules/tsx/dist/cli.mjs",
  "cleanup-announcements.ts",
]);
