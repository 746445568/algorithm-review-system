import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadOrCreateServiceToken } from "../bootstrap/service-auth.mjs";

test("service token is persistent and contains 32 random bytes", async () => {
  const appDir = await mkdtemp(path.join(os.tmpdir(), "ojreview-auth-"));
  const first = await loadOrCreateServiceToken(appDir);
  const second = await loadOrCreateServiceToken(appDir);

  assert.equal(first, second);
  assert.equal(Buffer.from(first, "base64url").length, 32);
  assert.equal((await readFile(path.join(appDir, "secure", "service-auth.token"), "utf8")).trim(), first);
});
