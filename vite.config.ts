/** Công cụ dev/build và kiểm thử frontend; proxy chỉ dùng khi dev/preview. */
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = {
    "/api/assistant": {
      target: "https://sportiva-demo.vercel.app",
      changeOrigin: true,
      headers: { Origin: "https://sportiva-demo.vercel.app" },
    },
    "/api": {
      target: env.API_PROXY_TARGET || "http://127.0.0.1:8080",
      changeOrigin: true,
    },
  };
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            charts: ["recharts"],
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      env: { VITE_DATA_MODE: "demo", VITE_API_BASE_URL: "" },
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      globals: true,
    },
  };
});
