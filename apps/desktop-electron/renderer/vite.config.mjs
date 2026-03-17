import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: process.cwd().replace(/\\/g, "/") + "/renderer",
  base: "./",
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      "/api": {
        target: `http://${process.env.WSL_HOST_IP || "127.0.0.1"}:38473`,
        changeOrigin: true,
      },
      "/health": {
        target: `http://${process.env.WSL_HOST_IP || "127.0.0.1"}:38473`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
