import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const viteBin = path.join(appRoot, "node_modules", "vite", "bin", "vite.js");

const child = spawn(process.execPath, [viteBin, "build", "--config", "./renderer/vite.config.mjs"], {
  cwd: appRoot,
  stdio: "inherit",
  shell: false,
  env: process.env,
});

child.on("error", (error) => {
  console.error(`[desktop-electron] failed to start renderer build: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
