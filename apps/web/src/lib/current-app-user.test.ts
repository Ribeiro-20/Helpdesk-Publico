import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("notifications resolve exactly the authenticated app user", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(
    path.resolve(testDirectory, "../app/(dashboard)/notifications/page.tsx"),
    "utf8",
  );

  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /\.from\("app_users"\)[\s\S]*?\.eq\("id",\s*user\.id\)[\s\S]*?\.maybeSingle\(\)/);
});
