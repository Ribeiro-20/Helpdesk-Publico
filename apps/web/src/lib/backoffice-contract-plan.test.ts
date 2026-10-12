import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const basename = "20261012170000_backoffice_contract_custom_plan.sql";

test("backoffice planning fix is guarded, local to the existing RPC and reversible", () => {
  const migration = fs.readFileSync(path.join(root, "supabase/migrations", basename), "utf8");
  const rollback = fs.readFileSync(path.join(root, "supabase/rollbacks", basename), "utf8");
  const signature = /alter function public\.search_contracts_v2\(text,text,text,text,numeric,numeric,date,date,text,integer,integer\)/i;
  assert.match(migration, signature);
  assert.match(migration, /set plan_cache_mode = 'force_custom_plan'/i);
  assert.match(migration, /md5\(pg_get_functiondef\(/i);
  assert.match(migration, /is distinct from '2f1a34693cbf3c858b6c027da415adc3'/i);
  assert.match(rollback, signature);
  assert.match(rollback, /reset plan_cache_mode/i);
  assert.match(rollback, /rollback did not restore the exact baseline/);
  for (const sql of [migration, rollback]) {
    assert.match(sql, /^begin;/i);
    assert.match(sql, /commit;\s*$/i);
    assert.doesNotMatch(sql, /(?:alter|create|drop)\s+(?:table|role|policy|index)|(?:insert\s+into|update\s+public\.|delete\s+from)|\bgrant\b|\brevoke\b/i);
    assert.doesNotMatch(sql, /alter function[\s\S]*?set statement_timeout/i);
  }
});
