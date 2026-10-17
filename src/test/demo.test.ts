import { describe, expect, it } from "vitest";
import { api, updateDemo } from "../lib/api";
import { demoSession, readDemo, resetDemo, saveDemo } from "../lib/demo";
import { addDays, dateTimeLocal, localDate } from "../lib/utils";
import type { Role } from "../lib/types";
const login = (role: Role) =>
  sessionStorage.setItem("sportiva-session", JSON.stringify(demoSession(role)));
describe("Demo workflows and ownership boundaries", () => {
  it("persists mutations and resets independently of authentication", async () => {
    login("CENTER_MANAGER");
    await api.register({
      fullName: "Thành viên thử nghiệm",
      email: "test@example.test",
      phone: "0909999999",
      password: "not-stored",
    });
    expect(readDemo().users.some((u) => u.email === "test@example.test")).toBe(
      true,
    );
    expect(localStorage.getItem("sportiva-demo-v1")).not.toContain(
      "not-stored",
    );
    resetDemo();
    expect(readDemo().users.some((u) => u.email === "test@example.test")).toBe(
      false,
    );
  });
  it("prevents duplicate registrations", async () => {
    login("CENTER_MANAGER");
    const input = {
      fullName: "Test",
      email: "member1@sportiva.demo",
      phone: "0909999999",
      password: "test",
    };
    await expect(api.register(input)).rejects.toThrow("Email");
  });
  it("prevents duplicate class booking", async () => {
    login("MEMBER");
    await expect(api.book(7, 10)).rejects.toThrow("đã đăng ký");
  });
  it("releases capacity after cancellation and allows booking again", async () => {
    login("MEMBER");
    const db = readDemo();
    const b = db.bookings.find((b) => b.classId === 7 && b.memberId === 10)!;
    const before = await api.capacity(7);
    await api.cancelBooking(b.id);
    expect(await api.capacity(7)).toBe(before + 1);
    await api.book(7, 10);
    expect(await api.capacity(7)).toBe(before);
  });
  it("prevents a member from accessing another membership", async () => {
    login("MEMBER");
    await expect(api.subscriptions(11)).rejects.toMatchObject({ status: 403 });
  });
  it("prevents a member from booking for someone else", async () => {
    login("MEMBER");
    await expect(api.book(8, 33)).rejects.toMatchObject({ status: 403 });
  });
  it("protects manager-only mutations in demo", async () => {
    login("RECEPTIONIST");
    await expect(api.status(10, "BLOCKED")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("cancels all bookings along with a class", async () => {
    login("CENTER_MANAGER");
    await api.cancelClass(7);
    expect(
      readDemo()
        .bookings.filter((b) => b.classId === 7)
        .every((b) => b.status === "CANCELLED"),
    ).toBe(true);
    expect(readDemo().classes.find((c) => c.id === 7)?.status).toBe(
      "CANCELLED",
    );
  });
  it("rejects room/coach schedule collisions", async () => {
    login("CENTER_MANAGER");
    const c = readDemo().classes.find((c) => c.id === 7)!;
    const { id: _, ...input } = c;
    await expect(api.saveClass(input)).rejects.toThrow("Trùng lịch");
  });
  it("rejects capacity exceeding the room", async () => {
    login("CENTER_MANAGER");
    const c = readDemo().classes.find((c) => c.id === 7)!;
    await expect(
      api.saveClass({ ...c, maxCapacity: 500 }, c.id),
    ).rejects.toThrow("sức chứa phòng");
  });
  it("refuses duplicate attendance", async () => {
    login("COACH");
    const a = readDemo().attendance[0];
    await expect(
      api.checkIn({
        classId: a.classId,
        memberId: a.memberId,
        status: "PRESENT",
      }),
    ).rejects.toThrow("đã được điểm danh");
  });
  it("rejects another active subscription rather than stacking it", async () => {
    login("MEMBER");
    await expect(api.subscribe(10, 2)).rejects.toThrow("đã có gói");
  });
  it("renewal mirrors BE behavior: replaces old subscription, starts today", async () => {
    login("MEMBER");
    const old = readDemo().subscriptions.find((s) => s.memberId === 10)!;
    const fresh = await api.subscribe(10, 2, old.id);
    expect(fresh.startDate).toBe(localDate());
    expect(fresh.endDate).toBe(localDate(addDays(90)));
    expect(readDemo().subscriptions.find((s) => s.id === old.id)?.status).toBe(
      "EXPIRED",
    );
    expect(readDemo().invoices.length).toBe(90);
  });
  it("creates pending invoices, pays once and only managers can refund", async () => {
    login("RECEPTIONIST");
    const invoice = await api.invoice({
      memberId: 10,
      amount: 800000,
      paymentMethod: "CASH",
      paymentStatus: "PENDING",
    });
    await api.pay(invoice.id);
    await expect(api.pay(invoice.id)).rejects.toThrow("Trạng thái");
    await expect(api.pay(invoice.id, true)).rejects.toMatchObject({
      status: 403,
    });
    login("CENTER_MANAGER");
    expect((await api.pay(invoice.id, true)).paymentStatus).toBe("REFUNDED");
  });
  it("excludes pending/refunded invoices from revenue and honors the date range", async () => {
    login("CENTER_MANAGER");
    const db = readDemo();
    db.invoices = [
      {
        id: 1,
        memberId: 10,
        amount: 100,
        paymentMethod: "CASH",
        paymentStatus: "PAID",
        createdAt: "2026-10-10T10:00:00",
      },
      {
        id: 2,
        memberId: 10,
        amount: 500,
        paymentMethod: "CASH",
        paymentStatus: "PENDING",
        createdAt: "2026-10-10T10:00:00",
      },
      {
        id: 3,
        memberId: 10,
        amount: 900,
        paymentMethod: "CASH",
        paymentStatus: "REFUNDED",
        createdAt: "2026-10-10T10:00:00",
      },
      {
        id: 4,
        memberId: 10,
        amount: 200,
        paymentMethod: "CASH",
        paymentStatus: "PAID",
        createdAt: "2026-09-10T10:00:00",
      },
    ];
    saveDemo(db);
    expect(
      await api.revenue("2026-10-01T00:00:00", "2026-10-31T23:59:59"),
    ).toBe(100);
  });
  it("does not save a partial demo transaction when validation fails", () => {
    login("CENTER_MANAGER");
    expect(() =>
      updateDemo("Fail", "test", (db) => {
        db.packages.length = 0;
        throw new Error("invalid");
      }),
    ).toThrow("invalid");
    expect(readDemo().packages.length).toBe(3);
  });
  it("recovers from malformed local JSON", () => {
    localStorage.setItem("sportiva-demo-v1", "{invalid");
    expect(readDemo().users.length).toBeGreaterThan(0);
  });
  it("records meaningful actions for local review", async () => {
    login("CENTER_MANAGER");
    await api.status(10, "INACTIVE");
    expect(readDemo().audit[0]).toMatchObject({
      actor: "Nguyễn Thanh Lộc",
      action: "Cập nhật trạng thái",
    });
    expect(new Date(readDemo().audit[0].createdAt).getTime()).toBeGreaterThan(
      0,
    );
    expect(dateTimeLocal()).toContain("T");
  });
});
