import { describe, expect, it } from "vitest";
import { api, getSession } from "../lib/api";
import { demoSession, readDemo, saveDemo } from "../lib/demo";
import { can, defaultPermissions, routeAllowed } from "../lib/permissions";
import {
  markNotificationsRead,
  reportTransfer,
  savePackage,
  savePlan,
  saveRole,
  saveTrainingLog,
  saveUser,
  sendNotification,
} from "../lib/center";
import { classEligibility, planMembers } from "../lib/entitlements";
import { workoutSuggestion } from "../lib/recommendation";
import { addDays, localDate } from "../lib/utils";
import type { Role } from "../lib/types";
function login(role: Role) {
  sessionStorage.setItem("sportiva-session", JSON.stringify(demoSession(role)));
}
async function newMember() {
  login("CENTER_MANAGER");
  const member = await api.register({
    fullName: "TEST luồng gói",
    email: "topic@example.test",
    phone: "0919991101",
    password: "not-stored",
  });
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({ token: "demo", mode: "demo", user: member }),
  );
  const sub = await api.subscribe(member.id, 1);
  return { member, sub };
}
async function paidMember() {
  const result = await newMember();
  login("RECEPTIONIST");
  await api.pay(
    readDemo().invoices.find((i) => i.subscriptionId === result.sub.id)!.id,
  );
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({ token: "demo", mode: "demo", user: result.member }),
  );
  return result;
}
describe("Quyền và quản lý nhân sự", () => {
  it("uses fixed role permissions even when a legacy snapshot grants or revokes actions", () => {
    const db = readDemo();
    db.permissions = { RECEPTIONIST: ["training.manage"] };
    saveDemo(db);
    const reception = demoSession("RECEPTIONIST");
    expect(routeAllowed(reception, "/training", db)).toBe(false);
    for (const path of ["/memberships", "/payments", "/members"])
      expect(routeAllowed(reception, path, db)).toBe(true);
    const member = demoSession("MEMBER");
    for (const path of ["/training", "/payments", "/memberships"])
      expect(routeAllowed(member, path, db)).toBe(true);
  });
  it("blocks role changes by reception", () => {
    login("RECEPTIONIST");
    expect(() => saveRole(10, "COACH")).toThrow("quyền");
  });
  it("keeps the last manager", () => {
    login("CENTER_MANAGER");
    expect(() => saveRole(1, "MEMBER")).toThrow("cuối cùng");
    expect(readDemo().users.find((u) => u.id === 1)?.roleName).toBe(
      "CENTER_MANAGER",
    );
  });
  it("changes an account role and preserves a manager", () => {
    login("CENTER_MANAGER");
    saveRole(10, "COACH");
    expect(readDemo().users.find((u) => u.id === 10)?.roleName).toBe("COACH");
  });
  it("keeps manager actions fixed instead of accepting permission removal in storage", async () => {
    login("CENTER_MANAGER");
    const db = readDemo();
    db.permissions = { CENTER_MANAGER: [] };
    saveDemo(db);
    const { id, ...input } = db.classes[6];
    await expect(
      api.saveClass(
        { ...input, scheduleTime: localDate(addDays(50)) + "T11:00:00" },
        id,
      ),
    ).resolves.toMatchObject({ id });
  });
  it("keeps role assignment as a fixed manager permission", () => {
    const db = readDemo();
    db.permissions = { CENTER_MANAGER: [] };
    expect(can(demoSession("CENTER_MANAGER"), "roles.manage", db)).toBe(true);
  });
  it("does not use demo role permissions for an API session", () => {
    const s = { ...demoSession("MEMBER"), mode: "api" as const };
    const db = readDemo();
    db.permissions = { MEMBER: ["roles.manage"] };
    expect(can(s, "roles.manage", db)).toBe(false);
  });
  it("creates staff without storing a password", () => {
    login("CENTER_MANAGER");
    const u = saveUser({
      fullName: "HLV mới",
      email: "coach.new@example.test",
      phone: "0919991102",
      roleName: "COACH",
      status: "ACTIVE",
    });
    expect(u.roleName).toBe("COACH");
    expect(u.createdAt).toBeTruthy();
    expect(u).not.toHaveProperty("password");
  });
  it("does not give staff management the power to create a manager", () => {
    login("CENTER_MANAGER");
    {
      const legacy = readDemo();
      legacy.permissions = {
        COACH: [...defaultPermissions.COACH, "team.manage"],
      };
      saveDemo(legacy);
    }
    login("COACH");
    expect(() =>
      saveUser({
        fullName: "Không hợp lệ",
        email: "bad@example.test",
        phone: "0919991102",
        roleName: "CENTER_MANAGER",
        status: "ACTIVE",
      }),
    ).toThrow("quyền");
  });
  it("preserves profile data on duplicate contact error", () => {
    login("CENTER_MANAGER");
    const db = readDemo();
    expect(() =>
      saveUser(
        {
          ...db.users.find((u) => u.id === 10)!,
          phone: db.users.find((u) => u.id === 11)!.phone,
        },
        10,
      ),
    ).toThrow("đã được sử dụng");
    expect(readDemo().users.find((u) => u.id === 10)?.phone).toBe(
      db.users.find((u) => u.id === 10)?.phone,
    );
  });
});
describe("Gói → hóa đơn → lớp học", () => {
  it("requires reception confirmation before an unpaid package can book", async () => {
    const { member, sub } = await newMember();
    expect(
      readDemo().invoices.find((i) => i.subscriptionId === sub.id)
        ?.paymentStatus,
    ).toBe("PENDING");
    await expect(api.book(8, member.id)).rejects.toThrow(
      "chờ xác nhận thanh toán",
    );
  });
  it("allows a paid member to book an included sport and tracks subscription", async () => {
    const { member, sub } = await paidMember();
    const booking = await api.book(8, member.id);
    expect(booking.subscriptionId).toBe(sub.id);
  });
  it("rejects an excluded sport", async () => {
    const { member } = await paidMember();
    await expect(api.book(7, member.id)).rejects.toThrow("không thuộc gói");
  });
  it("checks the class date against the subscription expiration", async () => {
    const { member, sub } = await paidMember();
    const db = readDemo();
    db.subscriptions.find((s) => s.id === sub.id)!.endDate = localDate();
    saveDemo(db);
    expect(classEligibility(readDemo(), 8, member.id).reason).toContain(
      "sau ngày hết hạn",
    );
  });
  it("enforces quota and releases it after cancellation", async () => {
    const { member } = await paidMember();
    let db = readDemo();
    db.packages.find((p) => p.id === 1)!.classLimit = 1;
    saveDemo(db);
    const booking = await api.book(8, member.id);
    db = readDemo();
    db.classes.push({
      ...db.classes.find((c) => c.id === 8)!,
      id: 999,
      scheduleTime: `${localDate(addDays(2))}T10:00:00`,
    });
    saveDemo(db);
    expect(classEligibility(readDemo(), 999, member.id).reason).toContain(
      "hết số lượt",
    );
    await api.cancelBooking(booking.id);
    expect(classEligibility(readDemo(), 999, member.id).allowed).toBe(true);
  });
  it("rejects schedule collisions for a member", () => {
    login("MEMBER");
    const db = readDemo();
    db.classes.push({ ...db.classes.find((c) => c.id === 8)!, id: 999 });
    expect(classEligibility(db, 999, 10).reason).toContain("Trùng giờ");
  });
  it("supports changing package fee, term and allowed sports", () => {
    login("CENTER_MANAGER");
    const pkg = readDemo().packages[0];
    savePackage(
      { ...pkg, price: 950000, durationDays: 45, sportIds: [1], classLimit: 8 },
      pkg.id,
    );
    expect(readDemo().packages[0]).toMatchObject({
      price: 950000,
      durationDays: 45,
      sportIds: [1],
      classLimit: 8,
    });
  });
  it("does not sell an inactive package", async () => {
    login("CENTER_MANAGER");
    const db = readDemo();
    db.packages[0].status = "INACTIVE";
    saveDemo(db);
    await expect(api.subscribe(33, 1)).rejects.toThrow("ngừng bán");
  });
  it("reporting a transfer never marks an invoice paid", async () => {
    const { member, sub } = await newMember();
    const invoice = readDemo().invoices.find(
      (i) => i.subscriptionId === sub.id,
    )!;
    reportTransfer(invoice.id);
    expect(
      readDemo().invoices.find((i) => i.id === invoice.id)?.paymentStatus,
    ).toBe("PENDING");
    expect(
      readDemo().notifications?.some(
        (n) => n.recipientId === 2 && n.kind === "PAYMENT",
      ),
    ).toBe(true);
    await expect(api.pay(invoice.id)).rejects.toMatchObject({ status: 403 });
    expect(getSession()?.user.id).toBe(member.id);
  });
});
describe("HLV, thông báo và ra/vào", () => {
  it("assigns a plan to a class and only enrolled members can see it", () => {
    login("COACH");
    const plan = savePlan({
      title: "Kế hoạch cả lớp",
      memberId: 0,
      classId: 1,
      coachId: 3,
      goal: "Sức bền",
      exercises: "Khởi động",
      notes: "Bài tập về nhà",
    });
    expect(planMembers(plan, readDemo())).toContain(10);
    expect(planMembers(plan, readDemo())).not.toContain(33);
    expect(
      readDemo().notifications?.some(
        (n) => n.recipientId === 10 && n.kind === "HOMEWORK",
      ),
    ).toBe(true);
  });
  it("does not assign a coach plan to someone else's class", () => {
    login("COACH");
    expect(() =>
      savePlan({
        title: "Sai lớp",
        memberId: 0,
        classId: 2,
        coachId: 3,
        goal: "Sức bền",
        exercises: "Khởi động",
        notes: "",
      }),
    ).toThrow("phụ trách");
  });
  it("links results to a session and notifies the selected member", () => {
    login("COACH");
    saveTrainingLog({
      planId: 1,
      memberId: 10,
      coachId: 3,
      classId: 1,
      sessionDate: localDate(),
      result: "Hoàn thành",
      feedback: "Giữ kỹ thuật",
      metric: 40,
      metricLabel: "Plank (giây)",
    });
    expect(readDemo().logs.at(-1)).toMatchObject({
      memberId: 10,
      classId: 1,
      sessionDate: localDate(),
      metric: 40,
    });
    expect(readDemo().notifications?.at(0)?.recipientId).toBe(10);
  });
  it("rejects another member in the selected training plan", () => {
    login("COACH");
    expect(() =>
      saveTrainingLog({
        planId: 1,
        memberId: 33,
        coachId: 3,
        classId: 1,
        sessionDate: localDate(),
        result: "X",
        feedback: "",
      }),
    ).toThrow("quyền");
  });
  it("limits notification recipients to the coach's students", () => {
    login("COACH");
    expect(() => sendNotification("Test", "Nội dung thử", 33)).toThrow(
      "phụ trách",
    );
    sendNotification("Bài tập", "Tập thả lỏng", 10);
    expect(readDemo().notifications?.[0].recipientId).toBe(10);
  });
  it("only marks the current member's notifications as read", () => {
    login("COACH");
    sendNotification("Lớp học", "Kiểm tra lịch", undefined, 1);
    const before = readDemo().notifications?.filter(
      (n) => n.recipientId === 11,
    ).length;
    login("MEMBER");
    markNotificationsRead();
    expect(
      readDemo()
        .notifications?.filter((n) => n.recipientId === 10)
        .every((n) => n.readAt),
    ).toBe(true);
    expect(
      readDemo().notifications?.filter((n) => n.recipientId === 11 && !n.readAt)
        .length,
    ).toBe(before);
  });

  it("uses goal, level and member training history in the demo recommendation", () => {
    login("COACH");
    const text = workoutSuggestion(
      readDemo(),
      getSession()!,
      10,
      "Tăng sức mạnh",
      "Mới bắt đầu",
      30,
    );
    expect(text).toContain("Lịch sử: 1");
    expect(text).toContain("Nguyễn Minh Anh");
    expect(text).toContain("CHƯA GỌI MÔ HÌNH AI");
    expect(() =>
      workoutSuggestion(
        readDemo(),
        getSession()!,
        33,
        "Sức bền",
        "Mới bắt đầu",
        30,
      ),
    ).toThrow("phụ trách");
  });
});
