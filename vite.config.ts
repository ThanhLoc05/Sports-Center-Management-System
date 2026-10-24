/**
 * CẤU HÌNH CÔNG CỤ FRONTEND, không phải code nghiệp vụ chạy ở component.
 * Vite chạy server dev/build; proxy chuyển /api tới backend để trình duyệt gọi cùng origin.
 * Thay đổi env cần khởi động lại dev server hoặc build lại ứng dụng đã triển khai.
 */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  /**
   * Cùng proxy cho dev và preview; đường dẫn /api/v1 được giữ nguyên khi chuyển
   * sang backend. Deploy lên server khác cần reverse proxy tương ứng ở môi trường đó.
   */
  const proxy = {
    "/api": {
      target: env.API_PROXY_TARGET || "http://127.0.0.1:8080",
      changeOrigin: true,
    },
  };
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    /**
     * Tách thư viện React và biểu đồ thành chunk riêng để trình duyệt tải/cache
     * theo nhu cầu; không thay đổi dữ liệu hay nghiệp vụ trên các trang.
     */
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            charts: ["recharts"],
            react: ["react", "react-dom", "react-router-dom"],
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      // Test fixture bật demo riêng; ứng dụng dev/build vẫn dùng cấu hình nguồn dữ liệu của nó.
      env: { VITE_DATA_MODE: "demo", VITE_API_BASE_URL: "" },
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      globals: true,
    },
  };
});
