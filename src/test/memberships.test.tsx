import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoSession, readDemo, saveDemo } from "../lib/demo";
import { savePackage } from "../lib/center";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { addDays, localDate } from "../lib/utils";
import type { Role } from "../lib/types";
import App from "../App";

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
describe("Gói tập và lịch sử sử dụng", () => {
  it("subscribes, prevents duplicate active packages, renews with history and cancels without deletion", async () => {
    login("MEMBER");
    const sub = await api.subscribe(10, 1);
    expect(sub).toMatchObject({
      memberId: 10,
      packageId: 1,
      startDate: localDate(),
      endDate: localDate(addDays(30)),
      status: "ACTIVE",
    });
    await expect(api.subscribe(10, 2)).rejects.toThrow("Gia hạn");
    const renewed = await api.subscribe(10, 2, sub.id);
    expect(renewed.endDate).toBe(localDate(addDays(90)));
    expect(readDemo().subscriptions.find((s) => s.id === sub.id)?.status).toBe(
      "EXPIRED",
    );
    await api.cancelSubscription(renewed.id, 10);
    expect((await api.subscriptions(10)).map((s) => s.status)).toEqual([
      "EXPIRED",
      "CANCELLED",
    ]);
  });
  it("does not allow a member to read or buy packages for another member", async () => {
    login("MEMBER");
    await expect(api.subscribe(1, 1)).rejects.toThrow("quyền");
    await expect(api.subscriptions(1)).rejects.toThrow("quyền");
  });
  it("allows reception assistance, rejects inactive member and unknown package", async () => {
    login("RECEPTIONIST");
    await expect(api.subscribe(10, 999)).rejects.toThrow("tồn tại");
    const db = readDemo();
    db.users.find((u) => u.id === 10)!.status = "INACTIVE";
    saveDemo(db);
    await expect(api.subscribe(10, 1)).rejects.toThrow("không hoạt động");
  });
  it("edits catalog price/duration/entitlements, retires sales and preserves purchased history", async () => {
    login("MEMBER");
    const sub = await api.subscribe(10, 1);
    login("CENTER_MANAGER");
    const pkg = readDemo().packages.find((p) => p.id === 1)!;
    savePackage(
      {
        ...pkg,
        price: 900000,
        durationDays: 45,
        classLimit: 10,
        status: "INACTIVE",
      },
      pkg.id,
    );
    expect(readDemo().packages.find((p) => p.id === 1)?.price).toBe(900000);
    expect(readDemo().subscriptions.find((s) => s.id === sub.id)).toEqual(sub);
    await api.cancelSubscription(sub.id, 10);
    await expect(api.subscribe(10, 1)).rejects.toThrow("tồn tại");
  });
  it("rejects invalid catalog values and modifications by reception", () => {
    login("CENTER_MANAGER");
    const pkg = readDemo().packages[0];
    for (const patch of [
      { price: -1 },
      { durationDays: 0 },
      { sportIds: [] },
      { sportIds: [999] },
      { classLimit: -2 },
    ])
      expect(() => savePackage({ ...pkg, ...patch }, pkg.id)).toThrow(
        "Kiểm tra",
      );
    login("RECEPTIONIST");
    expect(() => savePackage(pkg, pkg.id)).toThrow("quyền");
  });
  it("creates package through the catalog form", async () => {
    const user = userEvent.setup();
    const client = page("/packages", "CENTER_MANAGER");
    await user.click(
      await screen.findByRole("button", { name: "Thêm gói tập" }),
    );
    await user.type(screen.getByLabelText("Tên gói"), "Gói kiểm thử");
    await user.type(screen.getByLabelText("Học phí (VND)"), "990000");
    await user.type(screen.getByLabelText("Mô tả"), "Gói dành cho ca kiểm thử");
    await user.click(screen.getByRole("checkbox", { name: "Yoga" }));
    await user.type(
      screen.getByLabelText("Quyền lợi (mỗi dòng một mục)"),
      "12 lượt Yoga",
    );
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Gói kiểm thử")).toBeVisible();
    expect(
      readDemo().packages.find((p) => p.name === "Gói kiểm thử")?.sportIds,
    ).toEqual([1]);
    client.clear();
  });
  it.each<Role>(["RECEPTIONIST", "COACH", "MEMBER"])(
    "blocks %s from editing catalog via URL",
    async (role) => {
      const client = page("/packages", role);
      expect(
        await screen.findByRole("heading", { name: "Không có quyền truy cập" }),
      ).toBeVisible();
      client.clear();
    },
  );
  it("shows member packages but does not expose future module links", async () => {
    const client = page("/memberships", "MEMBER");
    expect(
      await screen.findByRole("heading", { name: "Gói thành viên" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Essential" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Thanh toán" }),
    ).not.toBeInTheDocument();
    client.clear();
  });
  it("does not let COACH access the memberships page", async () => {
    const client = page("/memberships", "COACH");
    expect(
      await screen.findByRole("heading", { name: "Không có quyền truy cập" }),
    ).toBeVisible();
    client.clear();
  });
  it.each(["read", "subscribe", "renew", "cancel"] as const)(
    "uses existing real API endpoint for %s",
    async (operation) => {
      const s = login("CENTER_MANAGER");
      sessionStorage.setItem(
        "sportiva-session",
        JSON.stringify({ ...s, mode: "api", token: "test-jwt" }),
      );
      const response =
        operation === "read" ? [] : { id: 8, memberId: 10, packageId: 2 };
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetch);
      if (operation === "read") await api.subscriptions(10);
      if (operation === "subscribe") await api.subscribe(10, 2);
      if (operation === "renew") await api.subscribe(10, 2, 8);
      if (operation === "cancel") await api.cancelSubscription(8, 10);
      const paths = {
        read: "/memberships/members/10",
        subscribe: "/memberships/subscribe",
        renew: "/memberships/8/renew?packageId=2",
        cancel: "/memberships/8/cancel",
      };
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1" + paths[operation],
        expect.objectContaining({
          ...(operation === "read" ? {} : { method: "POST" }),
          headers: expect.objectContaining({
            Authorization: "Bearer test-jwt",
          }),
        }),
      );
      if (operation === "subscribe")
        expect(fetch.mock.calls[0][1].body).toBe(
          JSON.stringify({ memberId: 10, packageId: 2 }),
        );
      expect(readDemo().subscriptions).toHaveLength(0);
    },
  );
  it("keeps local data unchanged when the real backend refuses subscription", async () => {
    const s = login("MEMBER");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ ...s, mode: "api", token: "jwt" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Thành viên đã có gói tập đang hoạt động",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    await expect(api.subscribe(10, 1)).rejects.toThrow("đang hoạt động");
    expect(readDemo().subscriptions).toHaveLength(0);
  });
});
