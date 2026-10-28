/**
 * ĐIỂM KHỞI ĐỘNG FRONTEND. React gắn ứng dụng vào thẻ #root của index.html.
 * Các Provider cung cấp dữ liệu dùng chung: QueryClient quản lý cache API, AuthProvider
 * quản lý phiên đăng nhập, ToastProvider hiển thị thông báo, BrowserRouter xử lý URL.
 * Muốn lần luồng code khi bảo vệ: main.tsx → App.tsx → pages → lib/api.ts.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth";
import { ApiError } from "./lib/api";
import { ToastProvider } from "./components/ui";
import App from "./App";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
import "./styles.css";
import "./styles-topic.css";
/**
 * Chính sách lấy dữ liệu dùng chung cho các màn hình. Cache còn mới trong 30 giây;
 * lỗi 4xx không tự thử lại, lỗi khác chỉ thử thêm một lần. Mutation không tự gửi lại
 * để hạn chế lặp thao tác ghi như đăng ký lớp hoặc tạo hóa đơn.
 */
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
      retry: (count, error) =>
        error instanceof ApiError && error.status >= 400 && error.status < 500
          ? false
          : count < 1,
    },
    mutations: { retry: false },
  },
});
/**
 * Đọc tùy chọn độ dày giao diện trên trình duyệt; đây là sở thích hiển thị,
 * không phải dữ liệu thành viên hay dữ liệu phân quyền từ backend.
 */
document.documentElement.dataset.density =
  localStorage.getItem("sportiva-density") || "comfortable";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
