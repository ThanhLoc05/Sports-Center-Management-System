/** Kiểm thử HTTP contract các module đưa lên main. Không thay thế kiểm thử backend/SQL thật. */
import { describe, it, expect, vi } from "vitest";
import { api } from "../lib/api";
const input = {
  memberId: 10,
  receptionistId: 2,
  amount: 800000,
  paymentMethod: "BANK_TRANSFER",
  paymentStatus: "PENDING",
};
const attendance = {
  memberId: 10,
  classId: 8,
  checkedInBy: 3,
  status: "PRESENT",
};
const cases: [string, () => Promise<unknown>, string, string, unknown][] = [
  [
    "đặt lớp",
    () => api.book(8, 10),
    "/classes/8/book?memberId=10",
    "POST",
    undefined,
  ],
  [
    "hủy đăng ký",
    () => api.cancelBooking(44),
    "/bookings/44",
    "DELETE",
    undefined,
  ],
  [
    "lập hóa đơn",
    () => api.invoice(input),
    "/payments/invoices",
    "POST",
    input,
  ],
  [
    "xác nhận thu",
    () => api.pay(30),
    "/payments/invoices/30/pay",
    "POST",
    undefined,
  ],
  [
    "điểm danh",
    () => api.checkIn(attendance),
    "/attendance",
    "POST",
    attendance,
  ],
];
function session() {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({
      mode: "api",
      token: "test-contract-token",
      user: { id: 2, roleName: "RECEPTIONIST", fullName: "TEST" },
    }),
  );
}
describe("HTTP contract đăng ký lớp, thanh toán và điểm danh", () => {
  it.each(cases)(
    "gửi đúng JWT, method và payload khi %s",
    async (_name, call, url, method, body) => {
      session();
      const fetch = vi.fn(async () => Response.json({ id: 30 }));
      vi.stubGlobal("fetch", fetch);
      await call();
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1" + url,
        expect.objectContaining({
          method,
          headers: expect.objectContaining({
            Authorization: "Bearer test-contract-token",
          }),
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    },
  );
  it("đọc hóa đơn đúng member và tổng doanh thu đúng khoảng ngày", async () => {
    session();
    const fetch = vi.fn(async (url: string) =>
      Response.json(url.includes("/revenue") ? 800000 : []),
    );
    vi.stubGlobal("fetch", fetch);
    await api.invoices(10);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/payments/members/10/invoices");
    await expect(
      api.revenue("2026-10-01T00:00:00", "2026-10-28T23:59:59"),
    ).resolves.toBe(800000);
    expect(fetch.mock.calls[1][0]).toContain(
      "/payments/revenue?startDate=2026-10-01T00%3A00%3A00",
    );
  });
  it("không coi lỗi thanh toán là thành công hoặc tự chuyển sang fixture", async () => {
    session();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ message: "Không có quyền xác nhận" }, { status: 403 }),
      ),
    );
    await expect(api.pay(30)).rejects.toMatchObject({
      status: 403,
      message: "Không có quyền xác nhận",
    });
  });
});
