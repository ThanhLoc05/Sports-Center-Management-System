import { describe, it, expect, vi, afterAll } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_DATA_MODE", "api");
});
afterAll(() => vi.unstubAllEnvs());
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import App from "../App";
import { api } from "../lib/api";

function LocationProbe() {
  return <output data-testid="action-location">{useLocation().search}</output>;
}

function page(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
const ok = () => Response.json({ message: "ok" });

describe("account email actions", () => {
  it.each(["verify-email", "reset-password"])("explains how to continue after refreshing %s without persisting the capability", async route => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const marker = "test-refresh-capability";
    const mounted = page(`/${route}?token=${marker}&source=email`);
    await waitFor(() => expect(screen.getByTestId("action-location")).not.toHaveTextContent("token="));
    expect(JSON.stringify(localStorage)).not.toContain(marker);
    expect(JSON.stringify(sessionStorage)).not.toContain(marker);
    expect(document.cookie).not.toContain(marker);
    mounted.unmount();
    page(`/${route}?source=email`);
    expect(await screen.findByText("Liên kết không còn token trong phiên này. Hãy mở lại liên kết trong email để tiếp tục.")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("removes capability from the address before submit and retains it in memory for retry", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ message: "temporary error" }, { status: 503 })).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    page("/verify-email?token=test-memory-capability&source=email");
    await waitFor(() => expect(screen.getByTestId("action-location")).not.toHaveTextContent("token="));
    expect(screen.getByTestId("action-location")).toHaveTextContent("source=email");
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Xác nhận" }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByText("Email đã được xác minh. Bạn có thể đăng nhập.")).toBeVisible();
    for (const [, init] of fetch.mock.calls) expect(JSON.parse(init.body).token).toBe("test-memory-capability");
    expect(screen.getByRole("button", { name: "Xác nhận" })).toBeDisabled();
  });
  it("public signup directs the member to verify an OTP before login", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          {
            message: "Mã xác minh đã được gửi.",
            expiresAtEpochMs: Date.now() + 60_000,
          },
          { status: 202 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    page("/register");
    await userEvent.type(
      await screen.findByLabelText("Họ và tên"),
      "Member Test",
    );
    await userEvent.type(screen.getByLabelText("Số điện thoại"), "0900000010");
    await userEvent.type(
      screen.getByLabelText("Địa chỉ email"),
      "member@example.com",
    );
    await userEvent.type(
      screen.getByLabelText("Mật khẩu", { exact: true }),
      "test-password",
    );
    await userEvent.type(
      screen.getByLabelText("Xác nhận mật khẩu"),
      "test-password",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tạo tài khoản" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Xác minh email" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Mã xác minh")).toBeVisible();
    expect(screen.getByTestId("action-location")).toHaveTextContent(
      "email=member%40example.com",
    );
    expect(sessionStorage.getItem("sportiva-session")).toBeNull();
  });
  it.each([
    [
      "/verify-email?token=test-capability",
      "/users/verify-email",
      "Email đã được xác minh. Bạn có thể đăng nhập.",
    ],
    [
      "/resend-verification",
      "/users/resend-verification",
      "Nếu email phù hợp với tài khoản, hướng dẫn sẽ được gửi.",
    ],
    [
      "/reset-password?token=test-capability",
      "/users/reset-password",
      "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.",
    ],
  ])(
    "exposes public route %s and submits its official contract",
    async (route, endpoint, message) => {
      const fetch = vi.fn().mockResolvedValue(ok());
      vi.stubGlobal("fetch", fetch);
      page(route);
      const submit = await screen.findByRole("button", { name: "Xác nhận" });
      expect(fetch).not.toHaveBeenCalled();
      if (route.includes("forgot") || route.includes("resend"))
        await userEvent.type(
          screen.getByLabelText("Địa chỉ email"),
          "member@example.test",
        );
      if (route.includes("reset-password")) {
        await userEvent.type(
          screen.getByLabelText("Mật khẩu mới"),
          "new-password",
        );
        await userEvent.type(
          screen.getByLabelText("Nhập lại mật khẩu"),
          "new-password",
        );
      }
      await userEvent.click(submit);
      expect(await screen.findByText(message)).toBeVisible();
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1" + endpoint,
        expect.objectContaining({ method: "POST" }),
      );
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body).toEqual(
        route.includes("reset-password")
          ? { token: "test-capability", newPassword: "new-password" }
          : route.includes("verify-email")
            ? { token: "test-capability" }
            : { email: "member@example.test" },
      );
    },
  );
  it.each(["verify-email", "reset-password"])("disables %s without an emailed token", async (route) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    page(`/${route}`);
    expect(
      await screen.findByRole("button", { name: "Xác nhận" }),
    ).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects mismatched reset confirmation without a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    page("/reset-password?token=test");
    await userEvent.type(
      await screen.findByLabelText("Mật khẩu mới"),
      "new-password",
    );
    await userEvent.type(
      screen.getByLabelText("Nhập lại mật khẩu"),
      "different-password",
    );
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("chưa khớp");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("enforces the UTF-8 byte limit when submitting reset-password", async () => {
    const fetch = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetch);
    page("/reset-password?token=test-capability");
    const password = await screen.findByLabelText("Mật khẩu mới");
    const confirmation = screen.getByLabelText("Nhập lại mật khẩu");
    const submit = screen.getByRole("button", { name: "Xác nhận" });

    const overLimit = "á".repeat(37);
    fireEvent.change(password, { target: { value: overLimit } });
    fireEvent.change(confirmation, { target: { value: overLimit } });
    await userEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("72 byte");
    expect(fetch).not.toHaveBeenCalled();

    const atLimit = "á".repeat(36);
    fireEvent.change(password, { target: { value: atLimit } });
    fireEvent.change(confirmation, { target: { value: atLimit } });
    await userEvent.click(submit);
    expect(await screen.findByText("Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("disables the form while pending and shows server error without fake success", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    page("/verify-email?token=test");
    await userEvent.click(
      await screen.findByRole("button", { name: "Xác nhận" }),
    );
    expect(screen.getByRole("button", { name: "Xác nhận" })).toBeDisabled();
    finish(Response.json({ message: "Liên kết đã hết hạn" }, { status: 400 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("hết hạn");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Xác nhận" })).toBeEnabled(),
    );
    expect(
      screen.queryByText("Email đã được xác minh. Bạn có thể đăng nhập."),
    ).not.toBeInTheDocument();
  });
  it("never attaches an old JWT to public account actions or puts the capability in the API URL", async () => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "api",
        token: "old-session-marker",
        user: {
          id: 1,
          email: "old@example.test",
          roleName: "MEMBER",
          status: "ACTIVE",
        },
      }),
    );
    const fetch = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal("fetch", fetch);
    await api.verifyEmail("test-token");
    await api.forgotPassword("member@example.test");
    await api.resendPasswordResetCode("member@example.test");
    await api.verifyPasswordResetCode("member@example.test", "123456");
    await api.resendVerification("member@example.test");
    await api.resetPassword("test-token", "new-password");
    for (const [url, init] of fetch.mock.calls) {
      expect(url).not.toContain("test-token");
      expect(init.headers).not.toHaveProperty("Authorization");
    }
  });
});
