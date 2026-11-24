import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { api, ApiError } from "../lib/api";
import AuthPage from "../pages/Auth";
import MemberRegistrationVerification from "../pages/MemberRegistrationVerification";

vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  configuredMode: "api",
}));
afterEach(() => vi.restoreAllMocks());
function Location() {
  return <p aria-label="Đường dẫn">{useLocation().pathname}</p>;
}
function setup(initialEntry = "/register") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Location />
            <Routes>
              <Route path="/register" element={<AuthPage register />} />
              <Route path="/login" element={<AuthPage />} />
              <Route
                path="/verify-registration"
                element={<MemberRegistrationVerification />}
              />
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

describe("Đăng ký Member xác minh bằng mã email", () => {
  it("gửi yêu cầu đăng ký rồi chuyển tới màn xác minh OTP", async () => {
    const begin = vi.spyOn(api, "beginMemberRegistration").mockResolvedValue({
      message: "Mã xác minh đã được gửi.",
      expiresAtEpochMs: Date.now() + 60_000,
    });
    setup();
    await fillForm();
    expect(await screen.findByLabelText("Mã xác minh")).toBeVisible();
    expect(screen.getByLabelText("Đường dẫn")).toHaveTextContent(
      "/verify-registration",
    );
    expect(begin).toHaveBeenCalledWith({
      email: "signup@example.com",
      phone: "0900000098",
      fullName: "Thành viên demo",
      password: "Demo@2026",
    });
  });

  it("xác minh mã rồi mới chuyển về đăng nhập", async () => {
    const verify = vi
      .spyOn(api, "verifyMemberRegistration")
      .mockResolvedValue({ message: "Đã xác minh." });
    setup("/verify-registration?email=signup%40example.com");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Mã xác minh"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Xác minh và tạo tài khoản" }),
    );
    expect(
      await screen.findByText(
        "Email đã được xác minh và tài khoản thành viên đã được tạo. Bạn có thể đăng nhập.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Đường dẫn")).toHaveTextContent("/login");
    expect(verify).toHaveBeenCalledWith("signup@example.com", "123456");
  });

  it("cho phép gửi lại mã và giữ nguyên trang khi mã xác minh sai", async () => {
    const resend = vi
      .spyOn(api, "resendMemberRegistrationCode")
      .mockRejectedValue(new Error("Vui lòng chờ ít nhất 1 phút trước khi gửi lại mã."));
    vi.spyOn(api, "verifyMemberRegistration").mockRejectedValue(
      new Error("Mã không đúng hoặc đã hết hạn."),
    );
    setup("/verify-registration?email=signup%40example.com");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Gửi lại mã" }));
    expect(await screen.findByText(/chờ ít nhất 1 phút/)).toBeVisible();
    await user.type(screen.getByLabelText("Mã xác minh"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Xác minh và tạo tài khoản" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mã không đúng hoặc đã hết hạn.",
    );
    expect(screen.getByLabelText("Đường dẫn")).toHaveTextContent(
      "/verify-registration",
    );
    expect(resend).toHaveBeenCalledWith("signup@example.com");
  });

  it("báo rõ yêu cầu xác minh đã mất thay vì thông báo 404 chung", async () => {
    vi.spyOn(api, "verifyMemberRegistration").mockRejectedValue(
      new ApiError("Yêu cầu không còn hiệu lực.", 404),
    );
    setup("/verify-registration?email=signup%40example.com");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Mã xác minh"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Xác minh và tạo tài khoản" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Yêu cầu đăng ký không còn hiệu lực",
    );
  });

  it("giữ form và báo lỗi khi email đã được sử dụng", async () => {
    vi.spyOn(api, "beginMemberRegistration").mockRejectedValue(
      new Error("Email đã được sử dụng."),
    );
    setup();
    await fillForm();
    expect(await screen.findByText("Email đã được sử dụng.")).toBeVisible();
    expect(screen.getByLabelText("Đường dẫn")).toHaveTextContent("/register");
  });
});
