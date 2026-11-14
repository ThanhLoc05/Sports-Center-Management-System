import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import AuthPage from "../pages/Auth";

vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  configuredMode: "api",
}));
function Location() {
  return <p aria-label="Đường dẫn">{useLocation().pathname}</p>;
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/register"]}>
            <Location />
            <Routes>
              <Route path="/register" element={<AuthPage register />} />
              <Route path="/login" element={<AuthPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Họ và tên"), "Thành viên demo");
  await user.type(screen.getByLabelText("Số điện thoại"), "0900000098");
  await user.type(screen.getByLabelText("Địa chỉ email"), "signup@example.com");
  await user.type(
    screen.getByLabelText("Mật khẩu", { exact: true }),
    "Demo@2026",
  );
  await user.type(screen.getByLabelText("Xác nhận mật khẩu"), "Demo@2026");
  await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
}

describe("Đăng ký trực tiếp không qua OTP", () => {
  it("tạo Member rồi chuyển về đăng nhập với thông báo thành công", async () => {
    const register = vi
      .spyOn(api, "register")
      .mockResolvedValue({
        id: 98,
        email: "signup@example.com",
        phone: "0900000098",
        fullName: "Thành viên demo",
        roleName: "MEMBER",
        status: "ACTIVE",
      });
    setup();
    await fillForm();
    expect(
      await screen.findByText("Đăng ký thành công. Bạn có thể đăng nhập."),
    ).toBeVisible();
    expect(screen.getByLabelText("Đường dẫn")).toHaveTextContent("/login");
    expect(register).toHaveBeenCalledWith({
      email: "signup@example.com",
      phone: "0900000098",
      fullName: "Thành viên demo",
      password: "Demo@2026",
    });
  });
  it("giữ form và báo lỗi khi email đã có người dùng", async () => {
    vi.spyOn(api, "register").mockRejectedValue(
      new Error("Email đã được sử dụng."),
    );
    setup();
    await fillForm();
    expect(await screen.findByText("Email đã được sử dụng.")).toBeVisible();
    expect(screen.getByLabelText("Đường dẫn")).toHaveTextContent("/register");
  });
});
