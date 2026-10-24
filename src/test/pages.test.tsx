import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { demoSession } from "../lib/demo";
import { ToastProvider } from "../components/ui";
import App from "../App";
const screens = [
  ["/", "Chào Lộc, ngày mới tốt lành"],
  ["/members", "Thành viên"],
  ["/team", "Đội ngũ trung tâm"],
  ["/facilities", "Bộ môn & phòng tập"],
  ["/classes", "Lớp học"],
  ["/schedule", "Lịch hoạt động"],
  ["/bookings", "Đăng ký lớp học"],
  ["/memberships", "Gói thành viên"],
  ["/attendance", "Điểm danh"],
  ["/payments", "Thanh toán & hóa đơn"],
  ["/reports", "Báo cáo & phân tích"],
  ["/training", "Kế hoạch tập luyện"],
  ["/assistant", "Trợ lý tập luyện"],
  ["/support", "Yêu cầu hỗ trợ"],
  ["/audit", "Nhật ký hoạt động"],
  ["/settings", "Cài đặt"],
  ["/profile", "Hồ sơ cá nhân"],
];
describe("Every manager route renders with persisted demo data", () => {
  it.each(screens)(
    "%s renders %s without an error boundary",
    async (path, heading) => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
      sessionStorage.setItem(
        "sportiva-session",
        JSON.stringify(demoSession("CENTER_MANAGER")),
      );
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      render(
        <QueryClientProvider client={client}>
          <AuthProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={[path]}>
                <App />
              </MemoryRouter>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>,
      );
      expect(
        await screen.findByRole(
          "heading",
          { name: heading, level: 1 },
          { timeout: 5000 },
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "Ứng dụng cần tải lại." }),
      ).not.toBeInTheDocument();
      client.clear();
    },
  );
});
