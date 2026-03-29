import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatElectronBootstrapFailure,
  getElectronBootstrapProbePayload,
  resolveElectronApi,
} from "../bootstrap/electron-api.mjs";

const bootstrap = await resolveMainBootstrap();
const { app, BrowserWindow, ipcMain, shell } = bootstrap.api;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.OJREVIEW_BOOTSTRAP_PROBE === "1") {
  console.log(`[ojreview-bootstrap] ${getElectronBootstrapProbePayload(bootstrap)}`);
  process.exit(0);
}

const SERVICE_URL = "http://127.0.0.1:38473";
const SERVICE_NAME = process.platform === "win32" ? "ojreviewd.exe" : "ojreviewd";
const isDev = !app.isPackaged;

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.setName("OJReviewDesktop");
app.disableHardwareAcceleration();

function parseMajorVersion(versionText) {
  if (!versionText || typeof versionText !== "string") {
    return null;
  }
  const normalized = versionText.trim().replace(/^v/i, "");
  const majorPart = normalized.split(".")[0];
  const major = Number.parseInt(majorPart, 10);
  return Number.isNaN(major) ? null : major;
}

function formatVersionMismatchHint(expectedMajor, actualVersion, source) {
  return [
    `service version check failed before startup (${source})`,
    `desktop requires service major version ${expectedMajor}, but got ${actualVersion ?? "unknown"}`,
    "Please rebuild apps/server/bin/ojreviewd with build metadata and refresh apps/desktop-electron/bin/ojreviewd(.exe).",
  ].join("; ");
}

class ServiceManager {
  constructor() {
    this.child = null;
    this.status = {
      state: "idle",
      url: SERVICE_URL,
      runtimeDir: "",
      source: "none",
      message: "service has not started yet",
      pid: null,
    };
  }

  getRuntimeDir() {
    return process.env.OJREVIEW_APP_DIR ?? path.join(app.getPath("appData"), "OJReviewDesktop");
  }

  getExpectedServiceMajor() {
    const envMajor = parseMajorVersion(process.env.OJREVIEW_SERVICE_MAJOR ?? "");
    if (envMajor !== null) {
      return envMajor;
    }
    return parseMajorVersion(app.getVersion());
  }

  getStatus() {
    return { ...this.status };
  }

  async ensureStarted() {
    const runtimeDir = this.getRuntimeDir();
    this.updateStatus({
      state: "starting",
      runtimeDir,
      message: "starting local service",
    });

    const existingHealth = await this.fetchHealthPayload();
    if (existingHealth?.status === "ok") {
      const mismatchMessage = this.checkVersionCompatibility(existingHealth.version, "external-running-service");
      if (mismatchMessage) {
        this.updateStatus({
          state: "error",
          runtimeDir,
          source: "external",
          message: mismatchMessage,
        });
        return this.getStatus();
      }

      this.updateStatus({
        state: "healthy",
        runtimeDir,
        source: "external",
        message: "connected to an already running service",
      });
      return this.getStatus();
    }

    const launch = this.resolveLaunch();
    if (!launch) {
      this.updateStatus({
        state: "error",
        runtimeDir,
        source: "missing",
        message: "could not find ojreviewd binary or a Go dev fallback",
      });
      return this.getStatus();
    }

    const preflightError = this.preflightVersionCheck(launch);
    if (preflightError) {
      this.updateStatus({
        state: "error",
        runtimeDir,
        source: launch.source,
        message: preflightError,
      });
      return this.getStatus();
    }

    try {
      this.child = spawn(launch.command, launch.args, {
        cwd: launch.cwd,
        env: {
          ...process.env,
          OJREVIEW_APP_DIR: runtimeDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      this.updateStatus({
        state: "error",
        runtimeDir,
        source: launch.source,
        message: `failed to launch local service: ${String(error)}`,
      });
      return this.getStatus();
    }

    this.status.source = launch.source;
    this.status.pid = this.child.pid ?? null;

    this.child.stdout?.on("data", (chunk) => {
      console.log(`[ojreviewd] ${chunk.toString().trimEnd()}`);
    });
    this.child.stderr?.on("data", (chunk) => {
      console.warn(`[ojreviewd] ${chunk.toString().trimEnd()}`);
    });
    this.child.once("exit", (code, signal) => {
      const expected = this.status.state === "stopping";
      this.child = null;
      this.updateStatus({
        state: expected ? "stopped" : "error",
        pid: null,
        message: expected
          ? "local service stopped"
          : `local service exited unexpectedly (${signal ?? code ?? "unknown"})`,
      });
    });

    const healthPayload = await this.waitForHealth(15000);
    if (!healthPayload) {
      await this.stop();
      this.updateStatus({
        state: "error",
        runtimeDir,
        source: launch.source,
        message: "local service did not become healthy within 15 seconds",
      });
      return this.getStatus();
    }

    const mismatchMessage = this.checkVersionCompatibility(healthPayload.version, launch.source);
    if (mismatchMessage) {
      await this.stop();
      this.updateStatus({
        state: "error",
        runtimeDir,
        source: launch.source,
        message: mismatchMessage,
      });
      return this.getStatus();
    }

    this.updateStatus({
      state: "healthy",
      runtimeDir,
      source: launch.source,
      pid: this.child?.pid ?? null,
      message: launch.source === "go-run" ? "local service running via go run" : "local service running",
    });
    return this.getStatus();
  }

  async restart() {
    await this.stop();
    return this.ensureStarted();
  }

  async stop() {
    if (!this.child) {
      return;
    }

    this.updateStatus({
      state: "stopping",
      message: "stopping local service",
    });

    const child = this.child;
    const waitForExit = new Promise((resolve) => {
      child.once("exit", () => resolve(true));
    });
    const waitTimeout = (timeoutMs) =>
      new Promise((resolve) => {
        setTimeout(() => resolve(false), timeoutMs);
      });

    if (process.platform === "win32") {
      try {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
          stdio: "ignore",
          windowsHide: true,
        });
        killer.once("error", () => {
          try {
            child.kill();
          } catch {
            // The process may already be gone.
          }
        });
      } catch {
        try {
          child.kill();
        } catch {
          // The process may already be gone.
        }
      }
    } else {
      try {
        child.kill("SIGTERM");
      } catch {
        return;
      }
    }

    const exited = await Promise.race([waitForExit, waitTimeout(5000)]);
    if (exited || child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    try {
      child.kill("SIGKILL");
    } catch {
      return;
    }

    await Promise.race([waitForExit, waitTimeout(1000)]);
  }

  resolveLaunch() {
    const explicitPath = process.env.OJREVIEW_SERVICE_PATH;
    if (explicitPath) {
      return {
        command: explicitPath,
        args: [],
        cwd: path.dirname(explicitPath),
        source: "env",
        versionProbe: {
          command: explicitPath,
          args: ["--version-json"],
          cwd: path.dirname(explicitPath),
        },
      };
    }

    const repoRoot = path.resolve(app.getAppPath(), "..", "..");
    const serverDir = path.join(repoRoot, "apps", "server");
    const candidates = [
      path.join(process.resourcesPath, "bin", SERVICE_NAME),
      path.join(app.getAppPath(), "bin", SERVICE_NAME),
      path.join(serverDir, "bin", SERVICE_NAME),
    ];

    for (const candidate of candidates) {
      try {
        accessSync(candidate, constants.F_OK);
        return {
          command: candidate,
          args: [],
          cwd: path.dirname(candidate),
          source: "binary",
          versionProbe: {
            command: candidate,
            args: ["--version-json"],
            cwd: path.dirname(candidate),
          },
        };
      } catch {
        // Keep scanning candidates.
      }
    }

    if (isDev) {
      return {
        command: "go",
        args: ["run", "./cmd/ojreviewd"],
        cwd: serverDir,
        source: "go-run",
        versionProbe: {
          command: "go",
          args: ["run", "./cmd/ojreviewd", "--version-json"],
          cwd: serverDir,
        },
      };
    }

    return null;
  }

  preflightVersionCheck(launch) {
    if (!launch?.versionProbe) {
      return null;
    }

    const probe = spawnSync(launch.versionProbe.command, launch.versionProbe.args, {
      cwd: launch.versionProbe.cwd,
      encoding: "utf-8",
      timeout: 10000,
      windowsHide: true,
      env: process.env,
    });

    if (probe.error || probe.status !== 0) {
      const reason = probe.error ? String(probe.error) : (probe.stderr || "unknown error").trim();
      return `failed to read service version before startup (${launch.source}): ${reason}`;
    }

    let payload;
    try {
      payload = JSON.parse((probe.stdout || "").trim());
    } catch {
      return `failed to parse service version output before startup (${launch.source})`;
    }

    return this.checkVersionCompatibility(payload?.version, launch.source);
  }

  checkVersionCompatibility(serviceVersion, source) {
    const expectedMajor = this.getExpectedServiceMajor();
    if (expectedMajor === null) {
      return null;
    }
    const serviceMajor = parseMajorVersion(serviceVersion);
    if (serviceMajor === null || serviceMajor !== expectedMajor) {
      return formatVersionMismatchHint(expectedMajor, serviceVersion, source);
    }
    return null;
  }

  async fetchHealthPayload() {
    try {
      const response = await fetch(`${SERVICE_URL}/health`);
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      return payload ?? null;
    } catch {
      return null;
    }
  }

  async isHealthy() {
    const payload = await this.fetchHealthPayload();
    return payload?.status === "ok";
  }

  async waitForHealth(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const payload = await this.fetchHealthPayload();
      if (payload?.status === "ok") {
        return payload;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return null;
  }

  updateStatus(nextPartial) {
    this.status = {
      ...this.status,
      ...nextPartial,
    };

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("service:status", this.getStatus());
    }
  }
}

const serviceManager = new ServiceManager();

function createWindow() {
  const window = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#f3eee7",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    window.loadURL(rendererUrl);
  } else {
    window.loadFile(path.join(app.getAppPath(), "renderer", "dist", "index.html"));
  }

  return window;
}

ipcMain.handle("desktop:get-runtime-info", () => ({
  serviceUrl: SERVICE_URL,
  runtimeDir: serviceManager.getRuntimeDir(),
  appPath: app.getAppPath(),
  isPackaged: app.isPackaged,
}));

ipcMain.handle("desktop:get-service-status", () => serviceManager.getStatus());
ipcMain.handle("desktop:restart-service", () => serviceManager.restart());
ipcMain.handle("desktop:open-external", (_event, url) => shell.openExternal(url));
ipcMain.handle("desktop:open-path", async (_event, targetPath) => shell.openPath(targetPath));

app.whenReady().then(() => {
  const window = createWindow();
  void serviceManager.ensureStarted();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  window.once("ready-to-show", () => {
    window.show();
    if (isDev) window.webContents.openDevTools();
  });
});

app.on("before-quit", () => {
  void serviceManager.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

async function resolveMainBootstrap() {
  try {
    return await resolveElectronApi({
      role: "main",
      specifiers: ["electron/main", "electron"],
      requiredKeys: ["app", "BrowserWindow", "ipcMain", "shell"],
    });
  } catch (error) {
    console.error(formatElectronBootstrapFailure(error));
    process.exit(41);
  }
}
