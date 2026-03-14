import { spawn } from "node:child_process";
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
const rendererPort = process.env.OJREVIEW_RENDERER_PORT ?? "5180";
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const bootstrapProbePrefix = "[ojreview-bootstrap]";
const { strippedEntries } = createElectronProcessEnv();
const electronArgs = [
  appRoot,
  "--disable-gpu",
  "--no-sandbox",
];
let rendererProcess;
let electronProcess;

function terminate(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { stdio: "ignore" });
    return;
  }

  child.kill("SIGTERM");
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // Dev server is not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`renderer dev server did not start within ${timeoutMs}ms`);
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

rendererProcess = spawn(
  process.execPath,
  [viteBin, "--config", "./renderer/vite.config.mjs", "--host", "127.0.0.1", "--port", rendererPort],
  {
    cwd: appRoot,
    stdio: "inherit",
    shell: false,
    env: process.env,
  }
);

rendererProcess.on("exit", (code) => {
  if (electronProcess && !electronProcess.killed) {
    terminate(electronProcess);
  }
  process.exit(code ?? 0);
});

await waitForServer(rendererUrl, 30000);
const sanitization = formatElectronEnvSanitization(strippedEntries);
if (sanitization) {
  console.warn(`[desktop-electron] ${sanitization}`);
}
await runElectronBootstrapProbe();

electronProcess = spawn(electronBinary, electronArgs, {
  cwd: appRoot,
  stdio: "inherit",
  shell: false,
  env: createElectronProcessEnv({
    ELECTRON_RENDERER_URL: rendererUrl,
  }).env,
});

electronProcess.on("exit", (code) => {
  terminate(rendererProcess);
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    terminate(electronProcess);
    terminate(rendererProcess);
  });
}
