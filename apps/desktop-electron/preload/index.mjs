import {
  formatElectronBootstrapFailure,
  resolveElectronApi,
} from "../bootstrap/electron-api.mjs";

const bootstrap = await resolvePreloadBootstrap();
const { contextBridge, ipcRenderer } = bootstrap.api;

contextBridge.exposeInMainWorld("desktopBridge", {
  getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  getServiceStatus: () => ipcRenderer.invoke("desktop:get-service-status"),
  restartService: () => ipcRenderer.invoke("desktop:restart-service"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  openPath: (targetPath) => ipcRenderer.invoke("desktop:open-path", targetPath),
  onServiceStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("service:status", listener);
    return () => ipcRenderer.removeListener("service:status", listener);
  },
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    onUpdateAvailable: (cb) => {
      const listener = (_e, info) => cb(info);
      ipcRenderer.on("updater:update-available", listener);
      return () => ipcRenderer.removeListener("updater:update-available", listener);
    },
    onDownloadProgress: (cb) => {
      const listener = (_e, p) => cb(p);
      ipcRenderer.on("updater:download-progress", listener);
      return () => ipcRenderer.removeListener("updater:download-progress", listener);
    },
    onUpdateDownloaded: (cb) => {
      const listener = () => cb();
      ipcRenderer.on("updater:update-downloaded", listener);
      return () => ipcRenderer.removeListener("updater:update-downloaded", listener);
    },
  },
});

async function resolvePreloadBootstrap() {
  try {
    return await resolveElectronApi({
      role: "preload",
      specifiers: ["electron/renderer", "electron"],
      requiredKeys: ["contextBridge", "ipcRenderer"],
    });
  } catch (error) {
    console.error(formatElectronBootstrapFailure(error));
    throw error;
  }
}
