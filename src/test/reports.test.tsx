/** Kiểm tra báo cáo dùng đúng summary, khoảng đã áp dụng và CSV; không ghi dữ liệu BE thật. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import Reports from "../pages/Reports";
import type { RevenueSummary } from "../lib/api";
import * as utils from "../lib/utils";

vi.mock("recharts", () => {
  const container = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: container,
    PieChart: container,
    AreaChart: container,
    BarChart: container,
    Area: () => null,
    Bar: () => null,
    CartesianGrid: () => null,
    Cell: () => null,
    Pie: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});
const clients: QueryClient[] = [];
const summary: RevenueSummary = {
  startDate: "2026-11-01T00:00:00",
  endDate: "2026-11-04T23:59:59.9999999",
  totalGrossRevenue: 800000,
  totalRefunded: 100000,
  netRevenue: 700000,
  totalPaidInvoices: 4,
  totalRefundedInvoices: 1,
  revenueByMethod: { CASH: 300000, BANK_TRANSFER: 500000 },
};
function page() {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "report-test-token",
      user: {
        id: 1,
        fullName: "Quản lý kiểm thử",
        email: "manager@example.test",
        phone: "0900000000",
        roleName: "CENTER_MANAGER",
        status: "ACTIVE",
      },
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <Reports />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
function server(
  onReport: (url: URL) => Promise<Response> | Response = () =>
    Response.json(summary),
) {
  const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/v1/reports/summary") return onReport(url);
    return Response.json([]);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const metric = (name: string) => (expected: string) =>
  within(screen.getByLabelText(name)).getByText(
    expected.replace(/\s+/g, " ").trim(),
  );
let csv: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  csv = vi.spyOn(utils, "downloadCsv").mockImplementation(() => {});
});
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
});

describe("Báo cáo tổng hợp — chế độ API", () => {
  it("loads one summary with JWT and renders amounts, invoice counts and method totals", async () => {
    const fetch = server();
    page();
    await waitFor(() =>
      expect(metric("Doanh thu ròng")(utils.money(700000))).toBeVisible(),
    );
    expect(metric("Tổng thu")(utils.money(800000))).toBeVisible();
    expect(metric("Tiền hoàn")(utils.money(100000))).toBeVisible();
    expect(metric("Tiền hoàn")("1 hóa đơn hoàn tiền trong kỳ")).toBeVisible();
    expect(metric("Hóa đơn đã thanh toán")("4")).toBeVisible();
    expect(screen.getByText("Tiền mặt")).toBeVisible();
    expect(
      screen.getByText(utils.money(500000).replace(/\s+/g, " ")),
    ).toBeVisible();
    const reportCall = fetch.mock.calls.find(([url]) =>
      String(url).includes("/reports/summary"),
    )!;
    const url = new URL(String(reportCall[0]), "http://localhost");
    expect(new Headers(reportCall[1]?.headers).get("Authorization")).toBe(
      "Bearer report-test-token",
    );
    expect(url.searchParams.get("startDate")).toBe(
      utils.localDate().slice(0, 7) + "-01T00:00:00",
    );
    expect(url.searchParams.get("endDate")).toBe(
      utils.localDate() + "T23:59:59.9999999",
    );
    // Khách HTTP thật vẫn được dùng; không gọi hai endpoint báo cáo cũ.
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).includes("/payments/revenue"),
      ),
    ).toBe(false);
    expect(
      screen.queryByText("API chưa có tổng số giao dịch"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Chưa có dữ liệu theo từng ngày")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Đường" }),
    ).not.toBeInTheDocument();
  });

  it("exports the same figures and applied range even while date fields contain an unsubmitted draft", async () => {
    const fetch = server();
    page();
    const exportButton = screen.getByRole("button", { name: "Xuất CSV" });
    await waitFor(() => expect(exportButton).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Từ ngày"), {
      target: { value: "2026-10-05" },
    });
    fireEvent.change(screen.getByLabelText("Đến ngày"), {
      target: { value: "2026-10-15" },
    });
    await userEvent.setup().click(exportButton);
    const rows = csv.mock.calls[0][1] as unknown[][];
    expect(rows).toContainEqual([
      "Từ ngày",
      utils.localDate().slice(0, 7) + "-01",
    ]);
    expect(rows).toContainEqual(["Tổng thu (VND)", 800000]);
    expect(rows).toContainEqual(["Tiền hoàn (VND)", 100000]);
    expect(rows).toContainEqual(["Doanh thu ròng (VND)", 700000]);
    expect(rows).toContainEqual(["Hóa đơn đã thanh toán", 4]);
    expect(rows).toContainEqual(["Hóa đơn hoàn tiền", 1]);
    expect(rows).toContainEqual(["Tiền mặt", 300000]);
    expect(rows.some((row) => row[0] === "Ngày")).toBe(false);
    expect(
      fetch.mock.calls.filter(([url]) =>
        String(url).includes("/reports/summary"),
      ),
    ).toHaveLength(1);
  });

  it("disables export while the new range loads and uses the newly applied range after success", async () => {
    let resolve!: (value: Response) => void;
    const fetch = server((url) =>
      url.searchParams.get("startDate")?.startsWith("2026-10-05")
        ? new Promise<Response>((done) => {
            resolve = done;
          })
        : Response.json(summary),
    );
    page();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Từ ngày"), {
      target: { value: "2026-10-05" },
    });
    fireEvent.change(screen.getByLabelText("Đến ngày"), {
      target: { value: "2026-10-15" },
    });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() => expect(resolve).toBeDefined());
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeDisabled();
    expect(metric("Tổng thu")("…")).toBeVisible();
    resolve(
      Response.json({
        ...summary,
        totalGrossRevenue: 123000,
        netRevenue: 23000,
      }),
    );
    await waitFor(() =>
      expect(metric("Tổng thu")(utils.money(123000))).toBeVisible(),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Xuất CSV" }));
    expect(csv.mock.calls[0][1]).toContainEqual(["Từ ngày", "2026-10-05"]);
    expect(csv.mock.calls[0][1]).toContainEqual(["Đến ngày", "2026-10-15"]);
    expect(csv.mock.calls[0][1]).toContainEqual([
      "Doanh thu ròng (VND)",
      23000,
    ]);
    expect(
      String(
        fetch.mock.calls.filter(([url]) =>
          String(url).includes("/reports/summary"),
        )[1][0],
      ),
    ).toContain("2026-10-15T23%3A59%3A59.9999999");
  });

  it("shows an error without fake zeroes and permits retry", async () => {
    let attempts = 0;
    server(() =>
      ++attempts === 1
        ? Response.json({ message: "Không tải được báo cáo" }, { status: 500 })
        : Response.json(summary),
    );
    page();
    await screen.findByText("Không tải được báo cáo");
    expect(metric("Tổng thu")("—")).toBeVisible();
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeDisabled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() =>
      expect(metric("Tổng thu")(utils.money(800000))).toBeVisible(),
    );
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeEnabled();
  });

  it("renders valid zero totals as an empty period and still permits exporting", async () => {
    server(() =>
      Response.json({
        ...summary,
        totalGrossRevenue: 0,
        totalRefunded: 0,
        netRevenue: 0,
        totalPaidInvoices: 0,
        totalRefundedInvoices: 0,
        revenueByMethod: {},
      }),
    );
    page();
    await screen.findByText("Chưa có khoản thu trong kỳ");
    expect(metric("Tổng thu")(utils.money(0))).toBeVisible();
    expect(metric("Hóa đơn đã thanh toán")("0")).toBeVisible();
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeEnabled();
  });

  it("preserves negative net revenue returned by BE instead of clamping it", async () => {
    server(() =>
      Response.json({
        ...summary,
        totalGrossRevenue: 0,
        totalRefunded: 5000,
        netRevenue: -5000,
        totalPaidInvoices: 0,
        totalRefundedInvoices: 1,
        revenueByMethod: {},
      }),
    );
    page();
    await waitFor(() =>
      expect(metric("Doanh thu ròng")(utils.money(-5000))).toBeVisible(),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Xuất CSV" }));
    expect(csv.mock.calls[0][1]).toContainEqual([
      "Doanh thu ròng (VND)",
      -5000,
    ]);
  });

  it("rejects malformed summary data and prevents exporting it", async () => {
    server(() => Response.json({ ...summary, totalPaidInvoices: "4" }));
    page();
    await screen.findByText(
      "Dữ liệu tổng hợp doanh thu từ máy chủ không hợp lệ.",
    );
    expect(metric("Tổng thu")("—")).toBeVisible();
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeDisabled();
    expect(csv).not.toHaveBeenCalled();
  });

  it("blocks inverted and overlong ranges without issuing a new request", async () => {
    const fetch = server();
    page();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Từ ngày"), {
      target: { value: "2026-10-20" },
    });
    fireEvent.change(screen.getByLabelText("Đến ngày"), {
      target: { value: "2026-10-10" },
    });
    expect(screen.getByRole("button", { name: "Áp dụng" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Từ ngày"), {
      target: { value: "2024-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Đến ngày"), {
      target: { value: "2026-10-10" },
    });
    expect(screen.getByRole("button", { name: "Áp dụng" })).toBeDisabled();
    expect(
      fetch.mock.calls.filter(([url]) =>
        String(url).includes("/reports/summary"),
      ),
    ).toHaveLength(1);
  });
});
