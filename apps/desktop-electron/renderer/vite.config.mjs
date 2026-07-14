import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { loadOrCreateServiceToken } from "../bootstrap/service-auth.mjs";

export default defineConfig(async () => {
  const appRoot = process.cwd();
  const runtimeDir = process.env.OJREVIEW_APP_DIR ?? path.join(appRoot, ".ojreview-runtime");
  const serviceToken = await loadOrCreateServiceToken(runtimeDir);
  const proxy = {
    target: `http://${process.env.WSL_HOST_IP || "127.0.0.1"}:38473`,
    changeOrigin: true,
    headers: { Authorization: `Bearer ${serviceToken}` },
  };

  return {
  root: process.cwd().replace(/\\/g, "/") + "/renderer",
  base: "./",
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      "/api": proxy,
      "/health": {
        target: `http://${process.env.WSL_HOST_IP || "127.0.0.1"}:38473`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    crossOriginLoading: false,
  },
  };
});
