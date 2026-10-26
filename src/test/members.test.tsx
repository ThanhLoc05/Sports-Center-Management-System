import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, getSession } from "../lib/api";
import { demoSession, readDemo } from "../lib/demo";
import { saveUser } from "../lib/center";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import App from "../App";
import type { Role } from "../lib/types";

function login(role: Role) {
  const s = demoSession(role);
  sessionStorage.setItem("sportiva-session", JSON.stringify(s));
  return s;
}
function page(path: string, role: Role) {
  login(role);
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
  return client;
}
const registration = {
  fullName: "Kiểm thử thành viên",
  email: "members@example.test",
  phone: "0917771122",
  password: "test-password",
};

describe("Quản lý thành viên", () => {
  it("creates MEMBER, prevents duplicate email/phone and never stores passwords", async () => {
    login("RECEPTIONIST");
    const member = await api.register(registration);
    expect(member.roleName).toBe("MEMBER");
    expect(JSON.stringify(readDemo())).not.toContain(registration.password);
    await expect(
      api.register({ ...registration, phone: "0917771133" }),
    ).rejects.toThrow("Email");
    await expect(
      api.register({ ...registration, email: "other@example.test" }),
    ).rejects.toThrow("điện thoại");
  });
  it("allows manager status updates and blocks reception/member mutations", async () => {
    login("CENTER_MANAGER");
    await api.status(10, "INACTIVE");
    expect(readDemo().users.find((u) => u.id === 10)?.status).toBe("INACTIVE");
    await expect(api.status(1, "INACTIVE")).rejects.toThrow("cuối cùng");
    for (const role of ["RECEPTIONIST", "MEMBER"] as Role[]) {
      login(role);
      await expect(api.status(10, "ACTIVE")).rejects.toThrow("quyền");
    }
  });
  it("edits own profile without allowing role escalation or duplicate identity", () => {
    const { user } = login("MEMBER");
    saveUser(
      { ...user, fitnessGoals: "Cải thiện sức bền", address: "Địa chỉ demo" },
      user.id,
    );
    expect(readDemo().users.find((u) => u.id === user.id)?.fitnessGoals).toBe(
      "Cải thiện sức bền",
    );
    expect(() =>
      saveUser({ ...user, roleName: "CENTER_MANAGER" }, user.id),
    ).toThrow("vai trò");
    expect(() =>
      saveUser({ ...user, email: "manager@sportiva.demo" }, user.id),
    ).toThrow("sử dụng");
  });
  it.each<Role>(["CENTER_MANAGER", "RECEPTIONIST"])(
    "renders member search and creation for %s",
    async (role) => {
      const user = userEvent.setup();
      const client = page("/members", role);
      expect(
        await screen.findByRole("heading", { name: "Thành viên" }),
      ).toBeVisible();
      const search = await screen.findByRole("searchbox", {
        name: "Tìm thành viên",
      });
      await user.type(search, "nguyen minh anh");
      expect(
        await screen.findByRole("button", { name: /^Nguyễn Minh Anh/ }),
      ).toBeVisible();
      await user.clear(search);
      await user.type(search, "khong-ton-tai");
      expect(
        await screen.findByRole("heading", { name: "Không có kết quả" }),
      ).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Thêm thành viên" }));
      expect(
        screen.getByRole("dialog", { name: "Thêm thành viên mới" }),
      ).toBeVisible();
      client.clear();
    },
  );
  it.each<Role>(["MEMBER", "COACH"])(
    "blocks %s from direct member-list URL",
    async (role) => {
      const client = page("/members", role);
      expect(
        await screen.findByRole("heading", { name: "Không có quyền truy cập" }),
      ).toBeVisible();
      client.clear();
    },
  );
  it("keeps the real API method and encoded status query", async () => {
    const s = login("CENTER_MANAGER");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ ...s, mode: "api", token: "jwt-test" }),
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...s.user, status: "BLOCKED" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await api.status(10, "BLOCKED");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/users/10/status?status=BLOCKED",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer jwt-test" }),
      }),
    );
  });
  it("does not save a profile locally when API mode has no update endpoint", () => {
    const s = login("CENTER_MANAGER");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ ...s, mode: "api" }),
    );
    expect(() =>
      saveUser({ ...s.user, fullName: "Không lưu giả" }, s.user.id),
    ).toThrow("API");
    expect(getSession()?.mode).toBe("api");
    expect(readDemo().users[0].fullName).not.toBe("Không lưu giả");
  });
});
