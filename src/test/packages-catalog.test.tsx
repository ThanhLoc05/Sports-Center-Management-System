import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { PackagesPage } from "../pages/Management";
import * as demo from "../lib/demo";
import { money } from "../lib/utils";
import type { MembershipPackage } from "../lib/types";

const catalog: MembershipPackage[] = [
  {
    id: 87,
    packageName: "Gói chuẩn từ API",
    price: 570000,
    durationDays: 31,
    accessLevel: "STANDARD",
    description: "Quyền học lớp tiêu chuẩn.",
    status: "ACTIVE",
  },
  {
    id: 13,
    packageName: "Gói VIP ngừng bán",
    price: 1700000,
    durationDays: 92,
    accessLevel: "VIP",
    description: "Quyền học lớp STANDARD và VIP.",
    status: "INACTIVE",
  },
];
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function page() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <PackagesPage />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe("Danh mục gói quản lý dùng API thật (fetch được mock)", () => {
  beforeEach(() => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({
        mode: "api",
        token: "test-jwt",
        user: {
          id: 1,
          fullName: "Quản lý",
          roleName: "CENTER_MANAGER",
          status: "ACTIVE",
        },
      }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(catalog)));
  });

  it("maps packageName, price, duration, accessLevel, description and both statuses", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json(catalog.map((p) => ({ ...p, name: "Sai trường legacy" }))),
    );
    const client = page();
    for (const pkg of catalog) {
      const name = await screen.findByText(pkg.packageName);
      const row = within(name.closest("tr")!);
      expect(
        row.getByText(money(pkg.price).replace(/\s+/g, " ")),
      ).toBeVisible();
      expect(row.getByText(`${pkg.durationDays} ngày`)).toBeVisible();
      expect(row.getByText(pkg.accessLevel!)).toBeVisible();
      expect(row.getByText(pkg.description!)).toBeVisible();
      expect(
        row.getByText(
          pkg.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động",
        ),
      ).toBeVisible();
    }
    expect(screen.queryByText("Sai trường legacy")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/memberships/packages",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-jwt" }),
      }),
    );
    client.clear();
  });

  it("shows loading until the catalog response arrives", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolvePromise) => {
          resolve = resolvePromise;
        }),
    );
    const client = page();
    expect(screen.getByText("Đang tải dữ liệu...")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    resolve(json(catalog));
    expect(await screen.findByText(catalog[0].packageName)).toBeVisible();
    client.clear();
  });

  it("shows an empty state for [] without demo packages", async () => {
    vi.mocked(fetch).mockResolvedValue(json([]));
    const client = page();
    expect(await screen.findByText("Chưa có gói tập")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    client.clear();
  });

  it("shows API error and retries using the same catalog endpoint", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ message: "Không tải được danh mục" }, 500))
      .mockResolvedValue(json(catalog));
    const client = page();
    expect(await screen.findByText("Không tải được danh mục")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Thử lại/i }));
    expect(await screen.findByText(catalog[0].packageName)).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(([url]) => url === "/api/v1/memberships/packages"),
    ).toBe(true);
    client.clear();
  });

  it("shows network failures instead of a successful empty catalog", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const client = page();
    expect(
      await screen.findByText(
        "Không kết nối được backend. Kiểm tra máy chủ và cấu hình API.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Chưa có gói tập")).not.toBeInTheDocument();
    client.clear();
  });

  it("rejects an unexpected response wrapper without falling back to demo", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ data: catalog }));
    const client = page();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Thử lại/i })).toBeVisible(),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    client.clear();
  });

  it("never reads demo data or invents sport/limit/features in API mode", async () => {
    const readDemo = vi.spyOn(demo, "readDemo");
    localStorage.setItem(
      "sportiva-demo-v1",
      JSON.stringify({ packages: [{ name: "Demo không được dùng" }] }),
    );
    const client = page();
    expect(await screen.findByText(catalog[0].packageName)).toBeVisible();
    expect(readDemo).not.toHaveBeenCalled();
    for (const text of [
      "Demo không được dùng",
      "Tất cả bộ môn",
      "Không giới hạn",
      "Đang chờ API danh mục/quyền lợi gói.",
    ]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("columnheader", { name: "Bộ môn" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Lượt lớp" }),
    ).not.toBeInTheDocument();
    client.clear();
  });

  it("handles absent descriptions without generating benefits or a default level", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json([{ ...catalog[0], description: null, accessLevel: null }]),
    );
    const client = page();
    expect(await screen.findByText("Chưa xác định")).toBeVisible();
    expect(screen.getByText("—")).toBeVisible();
    expect(
      screen.queryByText("STANDARD", { exact: true }),
    ).not.toBeInTheDocument();
    client.clear();
  });

  it("opens the create form without writing until the manager submits", async () => {
    const client = page();
    expect(await screen.findByText(catalog[0].packageName)).toBeVisible();
    const add = screen.getByRole("button", { name: "Thêm gói tập" });
    expect(add).toBeEnabled();
    await userEvent.setup().click(add);
    expect(screen.getByRole("dialog", { name: "Thêm gói tập" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Chỉnh sửa" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Xóa/ }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(
          ([url, init]) =>
            url === "/api/v1/memberships/packages" &&
            (!init?.method || init.method === "GET"),
        ),
    ).toBe(true);
    client.clear();
  });
});
