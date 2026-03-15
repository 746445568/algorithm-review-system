import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createElectronProcessEnv,
  formatElectronEnvSanitization,
} from "../bootstrap/launch-env.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const viteBin = path.join(appRoot, "node_modules", "vite", "bin", "vite.js");
const electronBinary = require("electron");
const rendererDistEntry = path.join(appRoot, "renderer", "dist", "index.html");
const bootstrapProbePrefix = "[ojreview-bootstrap]";
const { strippedEntries } = createElectronProcessEnv();
const electronArgs = [
  appRoot,
  "--disable-gpu",
  "--no-sandbox",
  "--disable-software-rasterizer",
  "--in-process-gpu",
  "--disable-gpu-sandbox",
];

function run(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
      env,
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`command exited with code ${code ?? "unknown"}`));
    });
  });
}

function formatProbeFailure(details, code) {
  const parts = ["Electron bootstrap probe failed."];
  const sanitization = formatElectronEnvSanitization(strippedEntries);

  if (sanitization) {
    parts.push(sanitization);
  }

  parts.push(
    "Electron APIs are still unavailable after launch.",
    "Inspect inherited Electron/Node environment overrides before treating this as a runtime regression."
  );

  if (details) {
    parts.push("", details);
  } else {
    parts.push("", `Probe exited with code ${code ?? "unknown"}.`);
  }

  return parts.join("\n");
}

async function runElectronBootstrapProbe() {
  const stdout = [];
  const stderr = [];
  const { env } = createElectronProcessEnv({
    OJREVIEW_BOOTSTRAP_PROBE: "1",
  });

  await new Promise((resolve, reject) => {
    const child = spawn(electronBinary, electronArgs, {
      cwd: appRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env,
    });

    child.stdout?.on("data", (chunk) => {
      stdout.push(chunk.toString());
    });
    child.stderr?.on("data", (chunk) => {
      stderr.push(chunk.toString());
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stdoutText = stdout.join("").trim();
      const stderrText = stderr.join("").trim();
      const details = [stdoutText, stderrText].filter(Boolean).join("\n");
      reject(new Error(formatProbeFailure(details, code)));
    });
  });

  const line = stdout
    .join("")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(bootstrapProbePrefix));

  if (!line) {
    throw new Error("Electron bootstrap probe did not emit a success payload.");
  }
}

try {
  await run(process.execPath, [viteBin, "build", "--config", "./renderer/vite.config.mjs"], appRoot);
} catch (error) {
  if (!fs.existsSync(rendererDistEntry)) {
    throw error;
  }

  console.warn(
    "[desktop-electron] renderer build failed in the current environment; reusing existing renderer/dist output"
  );
}

const sanitization = formatElectronEnvSanitization(strippedEntries);
if (sanitization) {
  console.warn(`[desktop-electron] ${sanitization}`);
}

await runElectronBootstrapProbe();
await run(electronBinary, electronArgs, appRoot, createElectronProcessEnv().env);
