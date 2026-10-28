import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoSession, readDemo, saveDemo } from "../lib/demo";
import { savePackage, saveRole, saveUser, savePlan } from "../lib/center";
import { can } from "../lib/permissions";
import { getBankConfig, saveBankConfig } from "../lib/payment-qr";
import { subscriptionUsage } from "../lib/entitlements";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { PaymentQr } from "../components/PaymentQr";
import BookingForm from "../components/BookingForm";
import App from "../App";
import Assistant from "../pages/Assistant";
import Training from "../pages/Training";
import type { Invoice, Role, Session } from "../lib/types";

vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,AA=="),
}));
const originalScroll = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
afterEach(() => {
  if (originalScroll)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScroll,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
const login = (role: Role) => {
  const s = demoSession(role);
  sessionStorage.setItem("sportiva-session", JSON.stringify(s));
  return s;
};
const wrap = (element: React.ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = (child: React.ReactNode) => (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>{child}</MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  return { ...render(view(element)), view, client };
};
async function newPaidMember(index: number) {
  login("CENTER_MANAGER");
  const member = await api.register({
    fullName: `TEST thành viên ${index}`,
    email: `complete.${index}@example.test`,
    phone: `09199911${String(index).padStart(2, "0")}`,
    password: "not-stored",
  });
  const s: Session = { token: "demo-local-only", mode: "demo", user: member };
  sessionStorage.setItem("sportiva-session", JSON.stringify(s));
  const sub = await api.subscribe(member.id, 1);
  login("RECEPTIONIST");
  await api.pay(
    readDemo().invoices.find((i) => i.subscriptionId === sub.id)!.id,
  );
  return { member, sub, session: s };
}
describe("Phân quyền áp dụng ngay ở nghiệp vụ frontend", () => {
  it("revokes a stale manager session after role reassignment", async () => {
    const stale = login("CENTER_MANAGER");
    const db = readDemo();
    db.users.push({
      ...db.users[0],
      id: 90,
      email: "second.manager@example.test",
      phone: "0917770000",
    });
    saveDemo(db);
    saveRole(stale.user.id, "MEMBER");
    expect(can(stale, "roles.manage", readDemo())).toBe(false);
    await expect(api.status(10, "INACTIVE")).rejects.toMatchObject({
      status: 403,
    });
    expect(() =>
      saveBankConfig({
        bankBin: "970422",
        bankName: "MB",
        accountNo: "0000000000",
        accountName: "TEST",
      }),
    ).toThrow("quản lý");
    expect(getBankConfig()).toBeNull();
  });
  it("blocks an inactive owner even when the session still says ACTIVE", async () => {
    login("MEMBER");
    const db = readDemo();
    db.users.find((u) => u.id === 10)!.status = "INACTIVE";
    saveDemo(db);
    await expect(api.subscriptions(10)).rejects.toMatchObject({ status: 403 });
  });
  it("does not use a forged member role in the form to edit coach information", () => {
    login("CENTER_MANAGER");
    {
      const legacy = readDemo();
      legacy.permissions = {
        RECEPTIONIST: ["members.read", "members.update", "team.manage"],
      };
      saveDemo(legacy);
    }
    const coach = readDemo().users.find((u) => u.roleName === "COACH")!;
    login("RECEPTIONIST");
    expect(() =>
      saveUser(
        { ...coach, roleName: "MEMBER", fullName: "Không được sửa" },
        coach.id,
      ),
    ).toThrow("quyền");
    expect(readDemo().users.find((u) => u.id === coach.id)?.fullName).toBe(
      coach.fullName,
    );
  });
  it("keeps fixed reception payment shortcuts despite a legacy permission override", async () => {
    const legacy = readDemo();
    legacy.permissions = { RECEPTIONIST: ["members.read", "members.create"] };
    saveDemo(legacy);
    login("RECEPTIONIST");
    const { client } = wrap(<App />);
    await screen.findByRole(
      "heading",
      { name: /Chào Trang/ },
      { timeout: 5000 },
    );
    expect(screen.getByRole("link", { name: /Tạo hóa đơn/ })).toBeVisible();
    expect(screen.getByRole("link", { name: "Thanh toán" })).toBeVisible();
    client.clear();
  });
  it("rejects edits to an unknown account or package", () => {
    const { user } = login("CENTER_MANAGER");
    expect(() => saveUser(user, 99999)).toThrow("Không tìm thấy");
    const pkg = readDemo().packages[0];
    expect(() => savePackage(pkg, 99999)).toThrow("Không tìm thấy");
  });
});
describe("Ràng buộc gói và hóa đơn", () => {
  it("does not renew an old subscription alongside another active subscription", async () => {
    const { member, sub, session } = await newPaidMember(1);
    sessionStorage.setItem("sportiva-session", JSON.stringify(session));
    const newer = await api.subscribe(member.id, 2, sub.id);
    await expect(api.subscribe(member.id, 1, sub.id)).rejects.toThrow(
      "gói khác",
    );
    expect(
      readDemo().subscriptions.filter(
        (s) => s.memberId === member.id && s.status === "ACTIVE",
      ),
    ).toHaveLength(1);
    expect(
      readDemo().subscriptions.find((s) => s.id === newer.id)?.status,
    ).toBe("ACTIVE");
  });
  it("does not create memberships for non-members", async () => {
    login("COACH");
    await expect(api.subscribe(3, 1)).rejects.toThrow("vai trò");
  });
  it("allows only one member to reserve the last remaining place", async () => {
    const first = await newPaidMember(2);
    const second = await newPaidMember(3);
    login("CENTER_MANAGER");
    const db = readDemo();
    db.classes.find((c) => c.id === 8)!.maxCapacity = 1;
    db.bookings = db.bookings.filter((b) => b.classId !== 8);
    saveDemo(db);
    const results = await Promise.allSettled([
      api.book(8, first.member.id),
      api.book(8, second.member.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      readDemo().bookings.filter(
        (b) => b.classId === 8 && b.status === "BOOKED",
      ),
    ).toHaveLength(1);
  });
  it("returns a package quota after cancellation while retaining booking history", async () => {
    const { member, sub, session } = await newPaidMember(4);
    sessionStorage.setItem("sportiva-session", JSON.stringify(session));
    const booking = await api.book(8, member.id);
    expect(subscriptionUsage(readDemo(), sub)).toBe(1);
    await api.cancelBooking(booking.id);
    expect(subscriptionUsage(readDemo(), sub)).toBe(0);
    expect(
      readDemo().bookings.some(
        (b) => b.id === booking.id && b.status === "CANCELLED",
      ),
    ).toBe(true);
  });
  it.each([NaN, Infinity, 0, 1.5])(
    "rejects an invalid invoice amount: %s",
    async (amount) => {
      login("RECEPTIONIST");
      await expect(
        api.invoice({
          memberId: 10,
          amount,
          paymentMethod: "BANK_TRANSFER",
          paymentStatus: "PENDING",
        }),
      ).rejects.toThrow("Số tiền");
    },
  );
  it("does not create an invoice marked PAID or attach another member subscription", async () => {
    login("RECEPTIONIST");
    await expect(
      api.invoice({
        memberId: 10,
        amount: 800000,
        paymentMethod: "BANK_TRANSFER",
        paymentStatus: "PAID",
      }),
    ).rejects.toThrow("chờ thanh toán");
    await expect(
      api.invoice({
        memberId: 10,
        subscriptionId: 2,
        amount: 800000,
        paymentMethod: "BANK_TRANSFER",
        paymentStatus: "PENDING",
      }),
    ).rejects.toThrow("không thuộc");
  });
});
describe("QR và form đặt lớp phản ánh trạng thái hiện tại", () => {
  it("resets reported status when a different invoice opens and hides QR after collection", async () => {
    login("CENTER_MANAGER");
    saveBankConfig({
      bankBin: "970422",
      bankName: "MBBank",
      accountNo: "0000000000",
      accountName: "TEST KHONG CHUYEN TIEN",
    });
    login("MEMBER");
    const first: Invoice = {
      id: 1,
      memberId: 10,
      amount: 800000,
      paymentMethod: "BANK_TRANSFER",
      paymentStatus: "PENDING",
      createdAt: "2026-10-26T10:00:00",
      transferReportedAt: "2026-10-26T11:00:00",
    };
    const { rerender, view, client } = wrap(<PaymentQr invoice={first} />);
    expect(
      screen.getByRole("button", { name: "Đã báo giao dịch · chờ đối chiếu" }),
    ).toBeDisabled();
    const second = { ...first, id: 2, transferReportedAt: undefined };
    rerender(view(<PaymentQr invoice={second} />));
    expect(
      await screen.findByRole("button", {
        name: "Tôi đã chuyển khoản · báo lễ tân",
      }),
    ).toBeEnabled();
    rerender(
      view(<PaymentQr invoice={{ ...second, paymentStatus: "PAID" }} />),
    );
    expect(
      screen.queryByRole("heading", {
        name: "Thanh toán bằng QR chuyển khoản",
      }),
    ).not.toBeInTheDocument();
    client.clear();
  });
  it("shows the reason and disables booking when the real backend returns no active subscription", async () => {
    const s = login("MEMBER");
    const payload = btoa(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    );
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ ...s, mode: "api", token: `e30.${payload}.test` }),
    );
    vi.spyOn(api, "classes").mockResolvedValue([
      {
        id: 88,
        className: "Lớp API",
        sportId: 2,
        roomId: 1,
        coachId: 3,
        maxCapacity: 20,
        scheduleTime: "2099-12-01T09:00:00",
        durationMinutes: 60,
        status: "SCHEDULED",
      },
    ]);
    vi.spyOn(api, "subscriptions").mockResolvedValue([]);
    vi.spyOn(api, "capacity").mockResolvedValue(5);
    const booking = vi.spyOn(api, "book");
    const { client } = wrap(<BookingForm classId={88} onClose={() => {}} />);
    expect(
      await screen.findByText(
        "Chưa có gói còn hiệu lực. Vui lòng đăng ký hoặc gia hạn gói.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Xác nhận đăng ký" }),
    ).toBeDisabled();
    expect(booking).not.toHaveBeenCalled();
    expect(screen.queryByText(/Essential/)).not.toBeInTheDocument();
    client.clear();
  });
  it("shows the actual capacity from the backend before confirming", async () => {
    const user = userEvent.setup();
    const s = login("MEMBER");
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify({ ...s, mode: "api" }),
    );
    vi.spyOn(api, "classes").mockResolvedValue([
      {
        id: 88,
        className: "Lớp API",
        sportId: 2,
        roomId: 1,
        coachId: 3,
        maxCapacity: 20,
        scheduleTime: "2099-12-01T09:00:00",
        durationMinutes: 60,
        status: "SCHEDULED",
      },
    ]);
    vi.spyOn(api, "subscriptions").mockResolvedValue([
      {
        id: 7,
        memberId: 10,
        packageId: 3,
        startDate: "2020-01-01",
        endDate: "2099-12-31",
        status: "ACTIVE",
      },
    ]);
    vi.spyOn(api, "capacity").mockResolvedValue(0);
    const booking = vi.spyOn(api, "book");
    const { client } = wrap(<BookingForm classId={88} onClose={() => {}} />);
    expect(
      await screen.findByText("Lớp đã đủ số lượng đăng ký."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Xác nhận đăng ký" }));
    await waitFor(() => expect(booking).not.toHaveBeenCalled());
    client.clear();
  });
});
describe("Các luồng frontend còn lại trong topic", () => {
  it("keeps registration feedback when moving to login and explains demo credentials", async () => {
    const user = userEvent.setup();
    const { client } = wrap(<App />);
    await user.click(
      await screen.findByRole("link", { name: "Đăng ký thành viên" }),
    );
    await user.type(
      screen.getByLabelText("Họ và tên"),
      "TEST đăng ký giao diện",
    );
    await user.type(screen.getByLabelText("Số điện thoại"), "0919993344");
    await user.type(
      screen.getByLabelText("Địa chỉ email"),
      "complete.register@example.test",
    );
    await user.type(
      screen.getByLabelText("Mật khẩu", { exact: true }),
      "Demo@123456",
    );
    await user.type(screen.getByLabelText("Xác nhận mật khẩu"), "Demo@123456");
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    expect(
      await screen.findByText(
        /Đã tạo tài khoản demo.*mật khẩu chung Sportiva@123/,
      ),
    ).toBeVisible();
    expect(
      readDemo().users.some(
        (u) =>
          u.email === "complete.register@example.test" &&
          u.roleName === "MEMBER",
      ),
    ).toBe(true);
    client.clear();
  });
  it("answers coach schedule questions using assigned classes rather than member bookings", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const user = userEvent.setup();
    login("COACH");
    const bookings = vi.spyOn(api, "bookings");
    const { client } = wrap(<Assistant />);
    // Chờ trang xác định nguồn trả lời trước khi nhập câu hỏi.
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    await user.type(screen.getByRole("textbox"), "Lịch dạy của tôi");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(
      await screen.findByText(/Đây là các lớp bạn phụ trách trong bản demo/),
    ).toBeVisible();
    expect(bookings).not.toHaveBeenCalled();
    client.clear();
  });
  it("initializes training result date from the selected class session", async () => {
    const user = userEvent.setup();
    login("COACH");
    const db = readDemo();
    db.classes.find((c) => c.id === 1)!.scheduleTime = "2020-01-01T08:00:00";
    saveDemo(db);
    savePlan({
      title: "TEST ngày theo buổi",
      memberId: 0,
      classId: 1,
      coachId: 3,
      goal: "Kỹ thuật",
      exercises: "Khởi động",
      notes: "Ghi kết quả đúng buổi",
    });
    const { client } = wrap(<Training />);
    await user.click(
      screen
        .getByRole("row", { name: /TEST ngày theo buổi/ })
        .querySelector("button")!,
    );
    await user.click(screen.getByRole("button", { name: "Ghi nhận kết quả" }));
    expect(screen.getByLabelText("Ngày tập")).toHaveValue("2020-01-01");
    client.clear();
  });
});
