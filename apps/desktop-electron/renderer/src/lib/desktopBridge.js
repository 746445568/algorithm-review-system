const noop = () => {};

function getBridge() {
  return window.desktopBridge ?? null;
}

export const desktopBridge = {
  isAvailable() {
    return Boolean(getBridge());
  },
  async getRuntimeInfo() {
    const bridge = getBridge();
    if (!bridge) {
      throw new Error("desktop bridge unavailable; preload did not initialize");
    }
    return bridge.getRuntimeInfo();
  },
  async getServiceStatus() {
    const bridge = getBridge();
    if (!bridge) {
      throw new Error("desktop bridge unavailable; preload did not initialize");
    }
    return bridge.getServiceStatus();
  },
  onServiceStatus(listener) {
    const bridge = getBridge();
    if (!bridge?.onServiceStatus) {
      return noop;
    }
    return bridge.onServiceStatus(listener);
  },
  restartService() {
    return getBridge()?.restartService();
  },
  openPath(targetPath) {
    return getBridge()?.openPath(targetPath);
  },
  openExternal(url) {
    return getBridge()?.openExternal(url);
  },
};
