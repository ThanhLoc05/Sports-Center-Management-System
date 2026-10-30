import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import Auth from "../pages/Auth";
import { routeAllowed } from "../lib/permissions";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("Bản trình bày dùng backend thật", () => {
  it("ignores the demo flag outside the test environment and rejects persisted sample sessions", async () => {
    vi.resetModules();
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_DATA_MODE", "demo");
    const { configuredMode, getSession, api } = await import("../lib/api");
    expect(configuredMode).toBe("api");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "demo",
        token: "demo-local-only",
        user: { id: 1, roleName: "CENTER_MANAGER" },
      }),
    );
    expect(getSession()).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(
      api.login("example@example.test", "not-a-password"),
    ).rejects.toThrow("Không kết nối được backend");
  });
  it("does not allow runtime sample data reads in the real application", async () => {
    vi.resetModules();
    vi.stubEnv("MODE", "production");
    const { readDemo } = await import("../lib/demo");
    expect(() => readDemo()).toThrow("Dữ liệu mẫu đã bị tắt");
  });
  it("has no role shortcuts on the login page", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter>
              <Auth />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Quản lý trung tâm" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Thành viên" }),
    ).not.toBeInTheDocument();
    expect(routeAllowed(null, "/center-checkin")).toBeUndefined();
    client.clear();
  });
});
