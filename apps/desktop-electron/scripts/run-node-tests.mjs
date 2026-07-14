import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDir = path.join(appDir, "test");
const testFiles = readdirSync(testDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => path.join(testDir, name));

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: appDir,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
