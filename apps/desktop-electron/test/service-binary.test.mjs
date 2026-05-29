import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_NAME = process.platform === "win32" ? "ojreviewd.exe" : "ojreviewd";
const BIN_PATH = path.join(__dirname, "..", "bin", BIN_NAME);

test("binary exists with platform-correct name", () => {
  assert.ok(existsSync(BIN_PATH), `expected ${BIN_PATH} to exist`);
});

test("binary is executable", () => {
  assert.doesNotThrow(() => accessSync(BIN_PATH, constants.X_OK));
});

test("binary --version-json outputs valid JSON with version field", () => {
  const result = spawnSync(BIN_PATH, ["--version-json"], {
    encoding: "utf-8",
    timeout: 5000,
  });
  assert.equal(result.status, 0, `exit code: ${result.stderr}`);
  const payload = JSON.parse(result.stdout.trim());
  assert.ok(payload.version, "version field missing");
});
