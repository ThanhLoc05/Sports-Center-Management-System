import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
              <Route path="/verify-registration" element={<MemberRegistrationVerification />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
async function fillForm(password = "Demo@2026") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Họ và tên"), "Thành viên demo");
  await user.type(screen.getByLabelText("Số điện thoại"), "0900000098");
  await user.type(screen.getByLabelText("Địa chỉ email"), "signup@example.com");
  await user.type(
    screen.getByLabelText("Mật khẩu", { exact: true }),
    password,
  );
  await user.type(screen.getByLabelText("Xác nhận mật khẩu"), password);
  await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
}

describe("Đăng ký Member xác minh qua OTP", () => {
  it("gửi yêu cầu OTP rồi chuyển sang màn hình xác minh", async () => {
    const beginRegistration = vi
      .spyOn(api, "beginMemberRegistration")
      .mockResolvedValue({
        message: "Mã xác minh đã được gửi.",
        expiresAtEpochMs: Date.now() + 60000,
      });
    setup();
    await fillForm();
    expect(screen.getByLabelText("Đường dẫn")).toHaveTextContent("/verify-registration");
    expect(beginRegistration).toHaveBeenCalledWith({
      email: "signup@example.com",
      phone: "0900000098",
      fullName: "Thành viên demo",
      password: "Demo@2026",
    });
  });
  it("giữ form và báo lỗi khi email đã có người dùng", async () => {
    vi.spyOn(api, "beginMemberRegistration").mockRejectedValue(
      new Error("Email đã được sử dụng."),
    );
    setup();
    await fillForm();
    expect(await screen.findByText("Email đã được sử dụng.")).toBeVisible();
    expect(screen.getByLabelText("Đường dẫn")).toHaveTextContent("/register");
  });

  it("hiện lỗi gửi mã trên form mà không đánh dấu email không hợp lệ", async () => {
    const message = "Chưa gửi được email. Vui lòng thử lại sau hoặc liên hệ trung tâm.";
    vi.spyOn(api, "beginMemberRegistration").mockRejectedValue(new ApiError(message, 503));

    setup();
    await fillForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Địa chỉ email")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Đường dẫn")).toHaveTextContent("/register");
  });

  it("chặn mật khẩu vượt 72 byte và chấp nhận mật khẩu đúng 72 byte", async () => {
    const beginRegistration = vi.spyOn(api, "beginMemberRegistration").mockResolvedValue({
      message: "Mã xác minh đã được gửi.",
      expiresAtEpochMs: Date.now() + 60000,
    });
    setup();
    await fillForm("x".repeat(73));

    const password = screen.getByLabelText("Mật khẩu", { exact: true });
    const confirmation = screen.getByLabelText("Xác nhận mật khẩu");
    const submit = screen.getByRole("button", { name: "Tạo tài khoản" });
    expect(screen.getByRole("alert")).toHaveTextContent("72 byte");
    expect(beginRegistration).not.toHaveBeenCalled();

    const overLimit = "á".repeat(37);
    fireEvent.change(password, { target: { value: overLimit } });
    fireEvent.change(confirmation, { target: { value: overLimit } });
    fireEvent.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent("72 byte");
    expect(beginRegistration).not.toHaveBeenCalled();

    const atLimit = "á".repeat(36);
    fireEvent.change(password, { target: { value: atLimit } });
    fireEvent.change(confirmation, { target: { value: atLimit } });
    fireEvent.click(submit);
    expect(await screen.findByRole("heading", { name: "Xác minh email" })).toBeVisible();
    expect(beginRegistration).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ password: atLimit }));
  });

  it("yêu cầu gửi lại sau 1 phút và bắt đầu mốc hết hạn mới khi người dùng bấm gửi lại", async () => {
    vi.useFakeTimers();
    try {
      const resendCode = vi.spyOn(api, "resendMemberRegistrationCode")
        .mockImplementation(async () => ({
          message: "Mã xác minh đã được gửi.",
          expiresAtEpochMs: Date.now() + 60000,
        }));
      render(
        <MemoryRouter initialEntries={[{
          pathname: "/verify-registration",
          search: "?email=signup%40example.com",
          state: { expiresAtEpochMs: Date.now() + 60000 },
        }]}>
          <MemberRegistrationVerification />
        </MemoryRouter>,
      );

      const codeField = screen.getByLabelText("Mã xác minh");
      const verifyButton = screen.getByRole("button", { name: "Xác minh và tạo tài khoản" });
      const resendButton = screen.getByRole("button", { name: "Gửi lại mã" });
      fireEvent.change(codeField, { target: { value: "123456" } });

      act(() => vi.advanceTimersByTime(59000));
      expect(screen.getByText("Mã hết hạn sau 1 giây.")).toBeVisible();
      expect(verifyButton).toBeEnabled();
      expect(resendButton).toBeDisabled();

      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("alert")).toHaveTextContent("Hãy bấm Gửi lại mã");
      expect(verifyButton).toBeDisabled();
      expect(resendButton).toBeEnabled();
      expect(resendCode).not.toHaveBeenCalled();

      await act(async () => fireEvent.click(resendButton));
      expect(resendCode).toHaveBeenCalledExactlyOnceWith("signup@example.com");
      expect(screen.getByText("Mã hết hạn sau 60 giây.")).toBeVisible();
      expect(codeField).toHaveValue("");
      expect(codeField).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
