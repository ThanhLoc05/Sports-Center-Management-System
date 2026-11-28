import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { ToastProvider } from "../components/ui";

vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  configuredMode: "api",
}));

function page() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/forgot-password"]}>
            <App />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function begin() {
  const user = userEvent.setup();
  vi.spyOn(api, "forgotPassword").mockResolvedValue({
    message: "Nếu email phù hợp với tài khoản, mã OTP sẽ được gửi.",
    expiresAtEpochMs: Date.now() + 60_000,
  });
  page();
  fireEvent.change(await screen.findByLabelText("Địa chỉ email"), {
    target: { value: "member@example.com" },
  });
  await user.click(screen.getByRole("button", { name: "Gửi mã OTP" }));
  await screen.findByLabelText("Mã OTP đặt lại mật khẩu");
  return user;
}

async function submitCode(code: string) {
  fireEvent.change(screen.getByLabelText("Mã OTP đặt lại mật khẩu"), {
    target: { value: code },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Xác minh mã" }).closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Xác minh mã" })).toBeDisabled(),
  );
}

describe("quên mật khẩu bằng OTP riêng", () => {
  it("accepts the correct fifth attempt after four wrong codes and resets the password", async () => {
    const verify = vi.spyOn(api, "verifyPasswordResetCode");
    for (let i = 0; i < 4; i++)
      verify.mockRejectedValueOnce(
        new ApiError(`Mã không đúng. Bạn còn ${4 - i} lần thử.`, 400),
      );
    verify.mockResolvedValueOnce({
      token: "password-reset-grant-marker",
      expiresAtEpochMs: Date.now() + 600_000,
    });
    const reset = vi
      .spyOn(api, "resetPassword")
      .mockResolvedValue({ message: "Đã đặt lại mật khẩu." });
    const user = await begin();
    expect(screen.queryByLabelText("Mật khẩu mới")).not.toBeInTheDocument();
    for (let i = 0; i < 4; i++) {
      await submitCode("111111");
      await screen.findByText(`Mã không đúng. Bạn còn ${4 - i} lần thử.`);
    }
    fireEvent.change(screen.getByLabelText("Mã OTP đặt lại mật khẩu"), {
      target: { value: "654321" },
    });
    await user.click(screen.getByRole("button", { name: "Xác minh mã" }));
    await screen.findByLabelText("Mật khẩu mới");
    expect(verify).toHaveBeenCalledTimes(5);
    expect(
      JSON.stringify(localStorage) +
        JSON.stringify(sessionStorage) +
        window.location.href,
    ).not.toContain("password-reset-grant-marker");
    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu"), {
      target: { value: "different-password" },
    });
    await user.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("chưa khớp");
    expect(reset).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu"), {
      target: { value: "new-password" },
    });
    await user.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));
    expect(
      await screen.findByText(
        "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.",
      ),
    ).toBeVisible();
    expect(reset).toHaveBeenCalledExactlyOnceWith(
      "password-reset-grant-marker",
      "new-password",
    );
  });

  it("blocks further verification after five failures and resets the form only after requesting another code", async () => {
    const verify = vi.spyOn(api, "verifyPasswordResetCode");
    for (let i = 0; i < 4; i++)
      verify.mockRejectedValueOnce(new ApiError(`Sai lần ${i + 1}`, 400));
    verify.mockRejectedValueOnce(
      new ApiError("Bạn đã nhập sai 5 lần. Vui lòng yêu cầu mã mới.", 429),
    );
    const resend = vi
      .spyOn(api, "resendPasswordResetCode")
      .mockImplementation(async () => ({
        message: "Nếu email phù hợp với tài khoản, mã OTP sẽ được gửi.",
        expiresAtEpochMs: Date.now() + 60_000,
      }));
    await begin();
    for (let i = 0; i < 5; i++) {
      await submitCode("111111");
      await waitFor(() => expect(verify).toHaveBeenCalledTimes(i + 1));
      await screen.findByRole("alert");
    }
    expect(screen.getByLabelText("Mã OTP đặt lại mật khẩu")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gửi lại mã" })).toBeDisabled();
    fireEvent.submit(
      screen.getByRole("button", { name: "Xác minh mã" }).closest("form")!,
    );
    expect(verify).toHaveBeenCalledTimes(5);
    const advancedTime = Date.now() + 61_000;
    vi.spyOn(Date, "now").mockReturnValue(advancedTime);
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Gửi lại mã" }),
        ).toBeEnabled(),
      { timeout: 2000 },
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gửi lại mã" }));
    });
    await waitFor(() =>
      expect(resend).toHaveBeenCalledExactlyOnceWith("member@example.com"),
    );
    expect(screen.getByLabelText("Mã OTP đặt lại mật khẩu")).toBeEnabled();
    expect(
      screen.getByText(/Nhập sai 5 lần phải yêu cầu mã mới/),
    ).toBeVisible();
  });

  it("does not consume a client attempt on connection errors and supports server-side expiry", async () => {
    const verify = vi
      .spyOn(api, "verifyPasswordResetCode")
      .mockRejectedValueOnce(new ApiError("Không kết nối được backend", 0))
      .mockRejectedValueOnce(
        new ApiError("Mã đã hết hạn. Vui lòng yêu cầu mã mới.", 410),
      );
    await begin();
    await submitCode("123456");
    await screen.findByText("Không kết nối được backend");
    expect(
      screen.getByText(/Nhập sai 5 lần phải yêu cầu mã mới/),
    ).toBeVisible();
    await submitCode("123456");
    await screen.findByText("Mã đã hết hạn. Vui lòng yêu cầu mã mới.");
    expect(screen.getByLabelText("Mã OTP đặt lại mật khẩu")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gửi lại mã" })).toBeEnabled();
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("honors the backend lock even when this page has no previous failed attempts", async () => {
    const verify = vi
      .spyOn(api, "verifyPasswordResetCode")
      .mockRejectedValue(
        new ApiError("Bạn đã nhập sai 5 lần. Vui lòng yêu cầu mã mới.", 429),
      );
    await begin();
    await submitCode("123456");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "nhập sai 5 lần",
    );
    expect(screen.getByLabelText("Mã OTP đặt lại mật khẩu")).toBeDisabled();
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
