import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const snippetPath = resolve(
  process.cwd(),
  "ops/nginx/mercado-admin-extraction-timeouts.conf",
);

test("company refresh keeps the upstream connection open beyond 60 seconds", () => {
  const nginx = readFileSync(snippetPath, "utf8");

  assert.match(
    nginx,
    /location\s*=\s*\/api\/admin\/extract-companies\s*\{/,
    "the long-running company refresh must have an exact Nginx location",
  );
  assert.match(
    nginx,
    /proxy_read_timeout\s+310s;/,
    "Nginx must wait longer than the route's 300 second maxDuration",
  );
  assert.match(nginx, /proxy_send_timeout\s+310s;/);
  assert.match(nginx, /proxy_pass\s+http:\/\/localhost:3001;/);
});
