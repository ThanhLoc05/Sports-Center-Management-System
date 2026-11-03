import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import {
  MembershipOrderForm,
  MembershipOrderDetail,
  MembershipNotifications,
  MembershipCheckoutPage,
  MembershipOrders,
} from "../components/MembershipCheckout";
import {
  membershipCheckout,
  validateMembershipOrder,
} from "../lib/membership-checkout";
import type { MembershipOrder } from "../lib/membership-checkout";
import type { Role } from "../lib/types";
import {
  buildVietQr,
  buildPreviewQr,
  transferReference,
  crc16,
} from "../lib/payment-qr";

vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,AA=="),
}));
const pkg = {
  id: 1,
  name: "Gói tháng TEST",
  price: 800000,
  durationDays: 30,
  status: "ACTIVE" as const,
};
const subscription = {
  id: 10,
  memberId: 4,
  packageId: 1,
  startDate: "2026-01-01",
  endDate: "2099-01-01",
  status: "ACTIVE",
};
const pending: MembershipOrder = {
  id: 20,
  memberId: 4,
  kind: "RENEWAL",
  sourceSubscriptionId: 10,
  sourcePackageId: 1,
  status: "PENDING_PAYMENT",
  package: pkg,
  invoice: {
    id: 30,
    memberId: 4,
    membershipOrderId: 20,
    amount: 800000,
    paymentMethod: "CASH",
    paymentStatus: "PENDING",
    createdAt: "2026-10-28T12:00:00",
  },
  paymentReference: "HD30 TV4",
  createdAt: "2026-10-28T12:00:00",
  version: 0,
};
function confirmed(order = pending): MembershipOrder {
  return {
    ...order,
    status: "CONFIRMED",
    invoice: { ...order.invoice, paymentStatus: "PAID" },
    subscription,
    confirmedAt: "2026-10-28T12:01:00",
    version: 1,
  };
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const clients: QueryClient[] = [];
function accessCache() {
  const client = clients[clients.length - 1];
  client.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
  for (const memberId of [3, 4, 5]) {
    client.setQueryData(["activeSubscription", memberId], subscription);
    client.setQueryData(["subscriptions", memberId], [subscription]);
    client.setQueryData(["invoices", String(memberId)], [pending.invoice]);
  }
  client.setQueryData(["invoices", ""], [pending.invoice]);
  return client;
}
function expectMemberRefresh(client: QueryClient) {
  for (const memberId of [3, 4, 5]) {
    for (const key of [
      ["activeSubscription", memberId],
      ["subscriptions", memberId],
      ["invoices", String(memberId)],
    ])
      expect(client.getQueryState(key)?.isInvalidated).toBe(memberId === 4);
  }
  expect(client.getQueryState(["invoices", ""])?.isInvalidated).toBe(true);
}
afterEach(() => {
  for (const c of clients) c.clear();
  clients.length = 0;
});
function wrap(element: React.ReactNode, role: Role = "MEMBER") {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "contract-test-only",
      user: {
        id: role === "MEMBER" ? 4 : 3,
        email: "test@example.test",
        fullName: "TEST",
        roleName: role,
        status: "ACTIVE",
      },
    }),
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  function Location() {
    return (
      <output aria-label="Đường dẫn hiện tại">
        {useLocation().pathname + useLocation().search}
      </output>
    );
  }
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <Location />
            {element}
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
describe("Gia hạn qua hóa đơn chờ — mock hợp đồng API, không phải backend thật", () => {
  it("creates a pending cash order with idempotency then navigates, never calls old renew/pay", async () => {
    const calls = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith("/membership-packages")
        ? json([pkg])
        : init?.method === "POST" && url.endsWith("/membership-orders")
          ? json(pending, 201)
          : json({}, 404),
    );
    vi.stubGlobal("fetch", calls);
    const user = userEvent.setup();
    wrap(
      <MembershipOrderForm
        memberId={4}
        source={subscription}
        onClose={() => {}}
      />,
    );
    await screen.findByRole("option", { name: /Gói tháng TEST/ });
    await user.click(
      screen.getByRole("button", { name: "Tiếp tục đến thanh toán" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Đường dẫn hiện tại")).toHaveTextContent(
        "/payments?memberId=4&orderId=20",
      ),
    );
    const post = calls.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      memberId: 4,
      packageId: 1,
      paymentMethod: "CASH",
      sourceSubscriptionId: 10,
    });
    expect(
      (post[1]!.headers as Record<string, string>)["Idempotency-Key"],
    ).toBeTruthy();
    expect(calls.mock.calls.some(([url]) => /\/renew|\/pay$/.test(url))).toBe(
      false,
    );
  });
  it("selects bank transfer and reuses the idempotency key when retrying a lost response", async () => {
    let posts = 0;
    const keys: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/membership-packages")) return json([pkg]);
        if (init?.method === "POST") {
          keys.push(
            (init.headers as Record<string, string>)["Idempotency-Key"],
          );
          posts++;
          if (posts === 1) throw TypeError("lost response");
          return json(
            {
              ...pending,
              invoice: { ...pending.invoice, paymentMethod: "BANK_TRANSFER" },
            },
            201,
          );
        }
        return json({}, 404);
      }),
    );
    const user = userEvent.setup();
    wrap(
      <MembershipOrderForm
        memberId={4}
        source={subscription}
        onClose={() => {}}
      />,
    );
    await screen.findByRole("option", { name: /Gói tháng TEST/ });
    await user.selectOptions(
      screen.getByLabelText("Phương thức thanh toán"),
      "BANK_TRANSFER",
    );
    await user.click(
      screen.getByRole("button", { name: "Tiếp tục đến thanh toán" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Không kết nối");
    await user.click(
      screen.getByRole("button", { name: "Tiếp tục đến thanh toán" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Đường dẫn hiện tại")).toHaveTextContent(
        "orderId=20",
      ),
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
  it("missing package/order endpoints keep the old active subscription and disable checkout", async () => {
    const calls = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes("/memberships/members/")
        ? json([subscription])
        : json({}, 404),
    );
    vi.stubGlobal("fetch", calls);
    const user = userEvent.setup();
    wrap(<MembershipCheckoutPage />);
    expect(
      await screen.findByRole("heading", { name: "Gói hiện tại #1" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Gia hạn gói tập" }));
    expect(
      await screen.findByRole("button", { name: "Tiếp tục đến thanh toán" }),
    ).toBeDisabled();
    expect(
      screen.getAllByText(/Dịch vụ yêu cầu thanh toán gói chưa sẵn sàng/)
        .length,
    ).toBeGreaterThan(0);
    expect(
      calls.mock.calls.every(([, init]) => !init || init.method !== "POST"),
    ).toBe(true);
  });
  it("member sees pending cash invoice but cannot confirm money or activate a subscription", async () => {
    const calls = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(pending),
    );
    vi.stubGlobal("fetch", calls);
    wrap(<MembershipOrderDetail orderId={20} onClose={() => {}} />);
    expect(await screen.findByText(/Đơn đang chờ nhận tiền mặt/)).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Xác nhận thu tiền và kích hoạt gói",
      }),
    ).not.toBeInTheDocument();
    expect(
      calls.mock.calls.every(([, init]) => !init || init.method !== "POST"),
    ).toBe(true);
  });
  it("reception confirms cash only after receipt checkbox and renders server activation result", async () => {
    const calls = vi.fn(async (_url: string, init?: RequestInit) =>
      json(init?.method === "POST" ? confirmed() : pending),
    );
    vi.stubGlobal("fetch", calls);
    const user = userEvent.setup();
    wrap(
      <MembershipOrderDetail orderId={20} onClose={() => {}} />,
      "RECEPTIONIST",
    );
    const client = accessCache();
    const button = await screen.findByRole("button", {
      name: "Xác nhận thu tiền và kích hoạt gói",
    });
    expect(button).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Tôi đã nhận đủ tiền mặt cho hóa đơn này",
      }),
    );
    await user.click(button);
    expect(
      await screen.findByText(/Đã xác nhận gia hạn gói hiện tại/),
    ).toBeVisible();
    const post = calls.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/api/v1/membership-orders/20/confirm-payment");
    expect(JSON.parse(String(post[1]!.body))).toEqual({ version: 0 });
    await waitFor(() => expectMemberRefresh(client));
  });
  it.each(["detail", "list"])(
    "refreshes only the member caches when %s polling detects confirmation",
    async (view) => {
      let paid = false;
      const calls = vi.fn(async () =>
        json(
          view === "list"
            ? [paid ? confirmed() : pending]
            : paid
              ? confirmed()
              : pending,
        ),
      );
      vi.stubGlobal("fetch", calls);
      wrap(
        view === "list" ? (
          <MembershipOrders memberId={4} />
        ) : (
          <MembershipOrderDetail orderId={20} onClose={() => {}} />
        ),
      );
      const client = accessCache();
      await screen.findByText(
        view === "list"
          ? "Chờ thanh toán / xác nhận"
          : /Đơn đang chờ nhận tiền mặt/,
      );
      expect(
        client.getQueryState(["activeSubscription", 4])?.isInvalidated,
      ).toBe(false);
      paid = true;
      await waitFor(() => expectMemberRefresh(client), { timeout: 12000 });
      expect(calls.mock.calls.length).toBeGreaterThan(1);
    },
    15000,
  );
  it.each(["CANCELLED", "PENDING_PAYMENT", "UNKNOWN"])(
    "disables renewal of %s subscriptions",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          url.endsWith("/membership-packages")
            ? json([pkg])
            : url.includes("/memberships/members/")
              ? json([{ ...subscription, status }])
              : json([]),
        ),
      );
      wrap(<MembershipCheckoutPage />);
      expect(
        await screen.findByRole("button", { name: "Gia hạn" }),
      ).toBeDisabled();
    },
  );
  it("blocks cached renewal while history refetch is pending and after an API error", async () => {
    let fail = false;
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/memberships/members/"))
          return fail
            ? new Promise<Response>((resolve) => {
                finish = resolve;
              })
            : json([subscription]);
        return json(url.endsWith("/membership-packages") ? [pkg] : []);
      }),
    );
    wrap(<MembershipCheckoutPage />);
    const button = await screen.findByRole("button", { name: "Gia hạn" });
    expect(button).toBeEnabled();
    await userEvent.setup().click(button);
    const submit = await screen.findByRole("button", {
      name: "Tiếp tục đến thanh toán",
    });
    await waitFor(() => expect(submit).toBeEnabled());
    const client = clients[clients.length - 1];
    fail = true;
    let request!: Promise<void>;
    await act(async () => {
      request = client.refetchQueries({ queryKey: ["subscriptions", 4] });
    });
    await waitFor(() => expect(button).toBeDisabled());
    expect(submit).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Gia hạn gói tập" }),
    ).toBeDisabled();
    await act(async () => {
      finish(json({ message: "History unavailable" }, 500));
      await request;
    });
    expect(button).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Gia hạn gói tập" }),
    ).toBeDisabled();
  });
  it("shows the future effective date for a paid STANDARD to VIP renewal without replacing current access", async () => {
    const future = confirmed({
      ...pending,
      package: { ...pkg, id: 2, name: "VIP TEST" },
    });
    future.subscription = {
      ...subscription,
      id: 11,
      packageId: 2,
      startDate: "2099-01-02",
      endDate: "2099-01-31",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(future)),
    );
    wrap(<MembershipOrderDetail orderId={20} onClose={() => {}} />);
    const client = accessCache();
    expect(
      await screen.findByText(/quyền mới chưa áp dụng trước ngày này/),
    ).toHaveTextContent("02/01/2099");
    await waitFor(() => expectMemberRefresh(client));
    expect(client.getQueryData(["activeSubscription", 4])).toEqual(
      subscription,
    );
  });
  it("QR waits for backend confirmation and staff cannot manually confirm a transfer", async () => {
    const bankOrder = {
      ...pending,
      invoice: { ...pending.invoice, paymentMethod: "BANK_TRANSFER" },
    };
    let paid = false;
    const calls = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes("/users/")
        ? json({
            id: 4,
            fullName: "Nguyễn Văn An",
            email: "an@example.test",
            roleName: "MEMBER",
          })
        : json(paid ? confirmed(bankOrder) : bankOrder),
    );
    vi.stubGlobal("fetch", calls);
    const user = userEvent.setup();
    wrap(
      <MembershipOrderDetail orderId={20} onClose={() => {}} />,
      "RECEPTIONIST",
    );
    expect(
      await screen.findByRole("img", { name: "QR minh họa hóa đơn 30" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Xác nhận thu tiền và kích hoạt gói",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Mã giao dịch ngân hàng đã đối chiếu"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Trạng thái đối soát chuyển khoản" }),
    ).toHaveTextContent("Chờ kết quả xác nhận chuyển khoản");
    paid = true;
    await user.click(screen.getByRole("button", { name: "Kiểm tra cập nhật" }));
    expect(
      await screen.findByText(/Đã xác nhận gia hạn gói hiện tại/),
    ).toBeVisible();
    expect(
      screen.queryByRole("img", { name: "QR minh họa hóa đơn 30" }),
    ).not.toBeInTheDocument();
    expect(calls.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });
  it("409 receipt conflict leaves the order pending and reports the error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? json({ message: "Giao dịch đã được sử dụng" }, 409)
          : json(pending),
      ),
    );
    const user = userEvent.setup();
    wrap(
      <MembershipOrderDetail orderId={20} onClose={() => {}} />,
      "RECEPTIONIST",
    );
    await user.click(await screen.findByRole("checkbox"));
    await user.click(
      screen.getByRole("button", {
        name: "Xác nhận thu tiền và kích hoạt gói",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Giao dịch đã được sử dụng",
    );
    expect(screen.queryByText(/Đã xác nhận gia hạn/)).not.toBeInTheDocument();
  });
  it("shows confirmation notifications for the correct member and package change", async () => {
    const changed = confirmed({
      ...pending,
      package: { ...pkg, id: 2, name: "Gói quý TEST" },
      invoice: { ...pending.invoice },
    });
    changed.subscription = { ...subscription, packageId: 2 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([changed])),
    );
    wrap(<MembershipNotifications />);
    expect(
      await screen.findByText("Đã xác nhận gia hạn với gói mới Gói quý TEST"),
    ).toBeVisible();
  });
  it.each([
    { ...pending, invoice: { ...pending.invoice, memberId: 5 } },
    { ...pending, invoice: { ...pending.invoice, amount: 1 } },
    { ...pending, paymentReference: "HD30 TV999" },
    { ...pending, status: "CONFIRMED" as const },
  ])(
    "rejects mismatched invoice ownership, amount, reference or activation",
    (order) => {
      expect(() => validateMembershipOrder(order)).toThrow();
    },
  );
  it("rejects a server list containing another member's order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([pending])),
    );
    await expect(membershipCheckout.list(5)).rejects.toThrow(
      "không thuộc thành viên",
    );
  });
  it("accepts null old subscription on a genuinely new request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          ...pending,
          kind: "NEW",
          sourceSubscriptionId: null,
          sourcePackageId: null,
        }),
      ),
    );
    await expect(
      membershipCheckout.create(
        { memberId: 4, packageId: 1, paymentMethod: "CASH" },
        "test-key",
      ),
    ).resolves.toMatchObject({ kind: "NEW" });
  });
  it("binds exact invoice amount, invoice ID and member ID inside VietQR", () => {
    const payload = buildVietQr(
      {
        bankBin: "970436",
        bankName: "TEST",
        accountNo: "0000000000",
        accountName: "TEST",
      },
      800000,
      30,
      4,
    );
    expect(payload).toContain("5406800000");
    expect(payload).toContain("HD30 TV4");
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
    expect(buildPreviewQr(800000, 30, 4)).toContain("HD30 TV4");
    expect(transferReference(2147483647, 2147483647)).toHaveLength(25);
    expect(() =>
      transferReference(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    ).toThrow("không thể tự cắt");
  });
});
