import { describe, it, expect, vi, afterAll } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_DATA_MODE", "api");
});
afterAll(() => vi.unstubAllEnvs());
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import App from "../App";
import { api } from "../lib/api";

function page(path: string) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
const ok = () => Response.json({ message: "ok" });

describe("account email actions", () => {
  it("public signup directs the member to verify email before login", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          {
            id: 42,
            email: "member@example.test",
            roleName: "MEMBER",
            status: "ACTIVE",
          },
          { status: 201 },
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
      "member@example.test",
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
      await screen.findByText(
        "Tạo tài khoản thành công. Hãy xác minh email trước khi đăng nhập.",
      ),
    ).toBeVisible();
    expect(sessionStorage.getItem("sportiva-session")).toBeNull();
  });
  it.each([
    [
      "/verify-email?token=test-capability",
      "/users/verify-email",
      "Email đã được xác minh. Bạn có thể đăng nhập.",
    ],
    [
      "/forgot-password",
      "/users/forgot-password",
      "Nếu email phù hợp với tài khoản, hướng dẫn sẽ được gửi.",
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
  it("does not send without a capability token", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    page("/verify-email");
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
    await api.resendVerification("member@example.test");
    await api.resetPassword("test-token", "new-password");
    for (const [url, init] of fetch.mock.calls) {
      expect(url).not.toContain("test-token");
      expect(init.headers).not.toHaveProperty("Authorization");
    }
  });
});
