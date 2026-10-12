import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const basename = "20261012220000_backoffice_date_filter_indexes.sql";
test("date-filter migration changes only the predicates and restores exact deployed RPC", () => {
 const migration = fs.readFileSync(path.join(root,"supabase/migrations",basename),"utf8");
 const rollback = fs.readFileSync(path.join(root,"supabase/rollbacks",basename),"utf8");
 const body = (s: string) => s.match(/AS \$function\$([\s\S]*?)\$function\$/)![1];
 const old = `       and (p_from_date is null or coalesce(c.signing_date, c.publication_date) >= p_from_date)
       and (p_to_date is null or coalesce(c.signing_date, c.publication_date) <= p_to_date)`;
 const replacement = `       -- Keep celebration-date semantics, including the missing-date publication fallback.
       -- Separate raw-column predicates allow RLS-safe use of the existing date indexes.
       and (
         (c.signing_date is not null
           and (p_from_date is null or c.signing_date >= p_from_date)
           and (p_to_date is null or c.signing_date <= p_to_date))
         or
         (c.signing_date is null
           and (p_from_date is null or c.publication_date >= p_from_date)
           and (p_to_date is null or c.publication_date <= p_to_date))
       )`;
 assert.ok(body(rollback).includes(old));
 assert.ok(body(migration).includes(replacement));
 assert.equal(body(migration),body(rollback).replace(old,replacement));
 for (const sql of [migration,rollback]) {
   assert.match(sql,/^begin;/);
   assert.match(sql,/commit;\s*$/);
   assert.match(sql,/SET plan_cache_mode TO 'force_custom_plan'/);
   assert.match(sql,/SET statement_timeout TO '30s'/);
   assert.match(sql,/is distinct from '7b42204ff34d8861253a9540de9de48b'/);
   assert.match(sql,/is distinct from '87be339e0b57b613cb0f7fbfdab967f5'/);
   assert.doesNotMatch(sql,/security definer|leakproof|(?:alter|create|drop)\s+(?:table|index|policy|role)|\bgrant\b|\brevoke\b/i);
 }
});
