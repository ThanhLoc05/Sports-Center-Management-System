/** Kiểm thử các trạng thái thanh toán/email bằng phản hồi API giả lập, không giao dịch tiền thật. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { BankSettings, PaymentQr } from "../components/PaymentQr";
import { MembershipDelivery } from "../components/MembershipDelivery";
import {
  MembershipOrderDetail,
  MembershipOrders,
} from "../components/MembershipCheckout";
import {
  membershipCheckout,
  validateMembershipOrder,
} from "../lib/membership-checkout";
import type { MembershipOrder } from "../lib/membership-checkout";
import Payments from "../pages/Payments";
import { getBankConfig } from "../lib/payment-qr";
import * as QRCode from "qrcode";

vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,AA=="),
}));
const bank = {
  bankBin: "970436",
  bankName: "VCB TEST",
  accountNo: "0000000000",
  accountName: "TRUNG TAM TEST",
};
const pending: MembershipOrder = {
  id: 20,
  memberId: 4,
  kind: "RENEWAL",
  sourceSubscriptionId: 10,
  sourcePackageId: 1,
  status: "PENDING_PAYMENT",
  version: 0,
  paymentReference: "HD30 TV4",
  createdAt: "2026-10-30T09:00:00",
  package: {
    id: 1,
    name: "Gói tháng TEST",
    price: 800000,
    durationDays: 30,
    status: "ACTIVE",
  },
  invoice: {
    id: 30,
    memberId: 4,
    membershipOrderId: 20,
    amount: 800000,
    paymentMethod: "BANK_TRANSFER",
    paymentStatus: "PENDING",
    createdAt: "2026-10-30T09:00:00",
  },
};
const paid: MembershipOrder = {
  ...pending,
  status: "CONFIRMED",
  version: 1,
  confirmedAt: "2026-10-30T09:05:00",
  invoice: { ...pending.invoice, paymentStatus: "PAID" },
  subscription: {
    id: 11,
    memberId: 4,
    packageId: 1,
    status: "ACTIVE",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
  },
};
const clients: QueryClient[] = [];
afterEach(() => {
  clients.forEach((c) => c.clear());
  clients.length = 0;
});
function wrap(node: React.ReactNode, role = "RECEPTIONIST") {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "test-only",
      user: {
        id: role === "MEMBER" ? 4 : 3,
        fullName: role === "MEMBER" ? "Nguyễn Văn An" : "Lễ tân TEST",
        email: "actor@example.test",
        roleName: role,
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
          <MemoryRouter>{node}</MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
const json = (v: unknown, status = 200) => Response.json(v, { status });
const member = {
  id: 4,
  fullName: "Nguyễn Văn An",
  email: "an@example.test",
  roleName: "MEMBER",
  status: "ACTIVE",
};

describe("Phần FE còn thiếu của luồng thanh toán", () => {
  it("takes the buyer name from their real account, not the receptionist, and prefers the order bank", async () => {
    localStorage.setItem(
      "sportiva-bank-config-v1",
      JSON.stringify({ ...bank, accountNo: "1111111111" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(member)),
    );
    wrap(<PaymentQr invoice={pending.invoice} bankAccount={bank} />);
    expect(
      await screen.findByRole("img", { name: "QR chuyển khoản hóa đơn 30" }),
    ).toBeVisible();
    const args = vi.mocked(QRCode.toDataURL).mock.calls.at(-1)!;
    expect(args[0]).toContain("HD30 TV4 NGUYEN VAN AN");
    expect(args[0]).toContain(bank.accountNo);
    expect(args[0]).not.toContain("1111111111");
    expect(args[0]).not.toContain("LE TAN");
  });
  it("does not generate a payable QR when the account API returns another member", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ ...member, id: 5 })),
    );
    wrap(<PaymentQr invoice={pending.invoice} bankAccount={bank} />);
    await screen.findByRole("button", { name: "Tải lại thông tin thành viên" });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sao chép thông tin" }),
    ).toBeDisabled();
  });
  it("never posts a manual QR confirmation even if the frontend helper is called directly", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      membershipCheckout.confirm(pending, "fake-transaction", "key"),
    ).rejects.toThrow("chờ hệ thống");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shows received-amount mismatch without completing the order or offering manual confirmation", async () => {
    const calls = vi.fn(async (url: string) =>
      json(
        url.includes("/users/")
          ? member
          : {
              ...pending,
              bankTransfer: {
                status: "AMOUNT_MISMATCH",
                receivedAmount: 500000,
              },
            },
      ),
    );
    vi.stubGlobal("fetch", calls);
    wrap(<MembershipOrderDetail orderId={20} onClose={() => {}} />);
    expect(
      await screen.findByRole("status", {
        name: "Trạng thái đối soát chuyển khoản",
      }),
    ).toHaveTextContent("Số tiền nhận chưa khớp");
    expect(screen.getByText(/500.000/)).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Hoàn thành")).not.toBeInTheDocument();
  });
  it("shows cash and QR orders together and filters independently by method and completion", async () => {
    const cash: MembershipOrder = {
      ...paid,
      id: 21,
      paymentReference: "HD31 TV4",
      invoice: {
        ...paid.invoice,
        id: 31,
        paymentMethod: "CASH",
        membershipOrderId: 21,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([pending, cash])),
    );
    const user = userEvent.setup();
    wrap(<MembershipOrders />);
    expect(await screen.findByText("HD30 TV4")).toBeVisible();
    expect(screen.getByText("HD31 TV4")).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Lọc phương thức thanh toán"),
      "BANK_TRANSFER",
    );
    expect(screen.queryByText("HD31 TV4")).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Lọc phương thức thanh toán"),
      "ALL",
    );
    await user.selectOptions(
      screen.getByLabelText("Lọc trạng thái đơn"),
      "CONFIRMED",
    );
    expect(screen.queryByText("HD30 TV4")).not.toBeInTheDocument();
    expect(screen.getByText("HD31 TV4")).toBeVisible();
  });
  it("opens the order detail from its invoice so the QR uses the bank attached to the order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/users/")) return json(member);
        if (url.endsWith("/membership-orders/20"))
          return json({ ...pending, bankAccount: bank });
        if (url.includes("/membership-orders")) return json([pending]);
        return json([pending.invoice]);
      }),
    );
    const user = userEvent.setup();
    wrap(<Payments />);
    await user.click(await screen.findByRole("button", { name: "HD0030" }));
    expect(
      await screen.findByRole("dialog", {
        name: "Chi tiết hóa đơn gia hạn / đăng ký gói",
      }),
    ).toBeVisible();
    expect(
      await screen.findByRole("img", { name: "QR chuyển khoản hóa đơn 30" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Xác nhận thu tiền và kích hoạt gói",
      }),
    ).not.toBeInTheDocument();
  });
  it("shows the persisted in-app confirmation without email actions", () => {
    wrap(
      <MembershipDelivery
        order={{ ...paid, delivery: { notification: { status: "SENT" } } }}
        memberName={member.fullName}
        staff
      />,
    );
    expect(screen.getByText("Đã lưu thông báo trong hệ thống")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sao chép nội dung báo thành viên" }),
    ).toBeEnabled();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });
  it("rejects notification success before payment confirmation and invalid bank totals", () => {
    expect(() =>
      validateMembershipOrder({
        ...pending,
        delivery: { notification: { status: "SENT" } },
      }),
    ).toThrow("Chưa xác nhận");
    expect(() =>
      validateMembershipOrder({
        ...pending,
        bankTransfer: { status: "WAITING", receivedAmount: -1 },
      }),
    ).toThrow("đối soát");
  });
  it("saves shared bank settings only after review and a successful server response", async () => {
    const calls = vi.fn(async (_url: string, init?: RequestInit) =>
      json(
        init?.method === "PUT"
          ? { bankAccount: bank, version: 1 }
          : { bankAccount: null, version: 0 },
      ),
    );
    vi.stubGlobal("fetch", calls);
    const user = userEvent.setup();
    wrap(<BankSettings />, "CENTER_MANAGER");
    await user.selectOptions(
      await screen.findByLabelText("Tên ngân hàng"),
      "970436",
    );
    await user.type(
      screen.getByLabelText("Số tài khoản nhận tiền"),
      bank.accountNo,
    );
    await user.type(
      screen.getByLabelText("Tên chủ tài khoản"),
      bank.accountName,
    );
    await user.click(
      screen.getByRole("button", { name: "Xem lại cấu hình trung tâm" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Xác nhận tài khoản nhận tiền trung tâm",
    });
    expect(
      calls.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);
    await user.click(
      within(dialog).getByRole("button", { name: "Lưu cấu hình dùng chung" }),
    );
    expect(
      await screen.findByText("Đã lưu tài khoản nhận tiền cho toàn trung tâm."),
    ).toBeVisible();
    const put = calls.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]?.body))).toMatchObject({
      version: 0,
      bankAccount: { accountNo: bank.accountNo },
    });
    expect(getBankConfig()).toBeNull();
  });
  it("does not expose local bank configuration as the receiving account of a real API order", async () => {
    localStorage.setItem("sportiva-bank-config-v1", JSON.stringify(bank));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(member)),
    );
    wrap(<PaymentQr invoice={pending.invoice} />);
    expect(
      await screen.findByRole("img", { name: "QR minh họa hóa đơn 30" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("img", { name: "QR chuyển khoản hóa đơn 30" }),
    ).not.toBeInTheDocument();
  });
  it("requires a new review when shared settings changed instead of overwriting them on retry", async () => {
    let changed = false;
    const calls = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        changed = true;
        return json({ message: "Cấu hình đã đổi" }, 409);
      }
      return json(
        changed
          ? { bankAccount: bank, version: 1 }
          : { bankAccount: null, version: 0 },
      );
    });
    vi.stubGlobal("fetch", calls);
    const user = userEvent.setup();
    wrap(<BankSettings />, "CENTER_MANAGER");
    await user.selectOptions(
      await screen.findByLabelText("Tên ngân hàng"),
      "970436",
    );
    await user.type(
      screen.getByLabelText("Số tài khoản nhận tiền"),
      bank.accountNo,
    );
    await user.type(
      screen.getByLabelText("Tên chủ tài khoản"),
      bank.accountName,
    );
    await user.click(
      screen.getByRole("button", { name: "Xem lại cấu hình trung tâm" }),
    );
    const save = screen.getByRole("button", {
      name: "Lưu cấu hình dùng chung",
    });
    await user.click(save);
    await screen.findByText(/Cấu hình đã thay đổi trên hệ thống/);
    await waitFor(() => expect(save).toBeDisabled());
    await user.click(save);
    expect(
      calls.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(1);
  });
  it("accepts a transparent small demo QR charge but rejects an unexplained invoice discount", () => {
    const demo = {
      ...pending,
      package: { ...pending.package, demoPayment: true, payableAmount: 5000 },
      invoice: { ...pending.invoice, amount: 5000 },
    };
    expect(validateMembershipOrder(demo).invoice.amount).toBe(5000);
    expect(() =>
      validateMembershipOrder({ ...demo, package: { ...pending.package } }),
    ).toThrow("không khớp");
    expect(() =>
      validateMembershipOrder({
        ...demo,
        package: { ...demo.package, payableAmount: 500000 },
      }),
    ).toThrow("demo QR");
  });
});
