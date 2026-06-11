import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const serverRoot = path.resolve(appRoot, "..", "server");
const outDir = path.resolve(appRoot, "bin");

const goos = process.env.GOOS || "";
const goarch = process.env.GOARCH || "";
const ext = goos === "windows" || (!goos && process.platform === "win32") ? ".exe" : "";
const outPath = path.resolve(outDir, `ojreviewd${ext}`);

mkdirSync(outDir, { recursive: true });

const args = ["build", "-o", outPath, "./cmd/ojreviewd"];
const env = { ...process.env };
if (goos) env.GOOS = goos;
if (goarch) env.GOARCH = goarch;

const child = spawn("go", args, {
  cwd: serverRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

child.on("error", (error) => {
  console.error(`[build-go] failed: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
