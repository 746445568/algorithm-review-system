import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { desktopBridge } from "../lib/desktopBridge.js";

export const initialServiceStatus = {
  state: "starting",
  url: "http://127.0.0.1:38473",
  runtimeDir: "",
  source: "bridge",
  message: "waiting for desktop bridge",
  pid: null,
};

const initialRuntimeInfo = {
  serviceUrl: initialServiceStatus.url,
  runtimeDir: "",
  appPath: "",
  isPackaged: false,
};

export function useDesktopRuntime() {
  const [serviceStatus, setServiceStatus] = useState(initialServiceStatus);
  const [runtimeInfo, setRuntimeInfo] = useState(initialRuntimeInfo);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    api.setBaseUrl(initialServiceStatus.url);

    async function bootstrap() {
      if (!desktopBridge.isAvailable()) {
        // Browser debug mode: use Vite proxy (relative URL) instead of direct WSL address
        api.setBaseUrl("");
        if (!cancelled) {
          setServiceStatus({
            ...initialServiceStatus,
            state: "starting",
            source: "proxy",
            message: "browser mode: using Vite proxy",
          });
        }
        return;
      }

      try {
        const [nextRuntimeInfo, nextServiceStatus] = await Promise.all([
          desktopBridge.getRuntimeInfo(),
          desktopBridge.getServiceStatus(),
        ]);

        if (cancelled) {
          return;
        }

        setRuntimeInfo(nextRuntimeInfo);
        setServiceStatus(nextServiceStatus);
        api.setBaseUrl(nextRuntimeInfo?.serviceUrl || nextServiceStatus?.url || initialServiceStatus.url);
        unsubscribe = desktopBridge.onServiceStatus(setServiceStatus);
      } catch (error) {
        if (!cancelled) {
          setServiceStatus({
            ...initialServiceStatus,
            state: "error",
            message: `desktop bridge failed: ${error.message}`,
          });
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    runtimeInfo,
    serviceStatus,
  };
}
