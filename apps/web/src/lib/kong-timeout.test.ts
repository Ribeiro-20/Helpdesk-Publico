import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("Kong REST timeout enforcement is durable and verified", () => {
  const script = fs.readFileSync(path.join(root, "ops/scripts/enforce-kong-rest-timeout.py"), "utf8");
  const service = fs.readFileSync(path.join(root, "ops/systemd/base-monitor-kong-timeout.service"), "utf8");
  const timer = fs.readFileSync(path.join(root, "ops/systemd/base-monitor-kong-timeout.timer"), "utf8");

  assert.match(script, /TARGET_TIMEOUT_MS = 310_000/);
  assert.match(script, /read_timeout/);
  assert.match(script, /write_timeout/);
  assert.match(script, /kong reload/);
  assert.match(script, /assert_effective_timeout/);
  assert.match(service, /ExecStart=\/usr\/local\/sbin\/enforce-kong-rest-timeout/);
  assert.match(timer, /OnUnitActiveSec=2min/);
  assert.match(timer, /Persistent=true/);
});
