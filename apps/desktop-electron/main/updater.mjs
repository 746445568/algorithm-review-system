// apps/desktop-electron/main/updater.mjs
import { autoUpdater } from "electron-updater";

export function initAutoUpdater(ipcMain, app, getWindow) {
  // Skip in dev mode (no latest.yml available)
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    const win = getWindow();
    win?.webContents.send("updater:update-available", {
      version: info.version,
      releaseNotes: info.releaseNotes ?? "",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const win = getWindow();
    win?.webContents.send("updater:download-progress", {
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", () => {
    const win = getWindow();
    win?.webContents.send("updater:update-downloaded");
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] error:", err);
  });

  ipcMain.handle("updater:check", () => autoUpdater.checkForUpdates());
  ipcMain.handle("updater:download", () => autoUpdater.downloadUpdate());
  ipcMain.handle("updater:install", () => autoUpdater.quitAndInstall());

  // Auto-check once after 5s
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
}
