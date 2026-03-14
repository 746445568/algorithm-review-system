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
