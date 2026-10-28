import type { DemoDatabase, TrainingPlan, Subscription } from "./types";
import { localDate, parseDate } from "./utils";
/** Gói còn hiệu lực theo ngày trung tâm, không chỉ dựa vào nhãn ACTIVE. */
export function activeSubscription(db: DemoDatabase, memberId: number) {
  return db.subscriptions.find(
    (s) =>
      s.memberId === memberId &&
      s.status === "ACTIVE" &&
      s.startDate <= localDate() &&
      s.endDate >= localDate(),
  );
}
export function membershipAccess(db: DemoDatabase, memberId: number) {
  const member = db.users.find(
    (u) => u.id === memberId && u.roleName === "MEMBER",
  );
  if (!member || member.status !== "ACTIVE")
    return { allowed: false, reason: "Thành viên không hoạt động." };
  const subscription = activeSubscription(db, memberId);
  if (!subscription)
    return {
      allowed: false,
      reason: "Chưa có gói tập còn hiệu lực. Vui lòng đăng ký/gia hạn gói.",
    };
  const pkg = db.packages.find((p) => p.id === subscription.packageId);
  if (!pkg)
    return { allowed: false, reason: "Không tìm thấy quyền lợi của gói." };
  const invoices = db.invoices.filter(
    (i) => i.subscriptionId === subscription.id && i.memberId === memberId,
  );
  if (invoices.length && !invoices.some((i) => i.paymentStatus === "PAID"))
    return {
      allowed: false,
      reason:
        "Gói đang chờ xác nhận thanh toán. Mở Hóa đơn để xem QR hoặc liên hệ lễ tân.",
      subscription,
      pkg,
    };
  return { allowed: true, reason: "Gói còn hiệu lực.", subscription, pkg };
}
/** Kiểm tra quyền lợi, thời hạn, hạn mức và trùng lịch mỗi lần lưu booking demo. */
export function classEligibility(
  db: DemoDatabase,
  classId: number,
  memberId: number,
) {
  const access = membershipAccess(db, memberId);
  if (!access.allowed || !access.subscription || !access.pkg) return access;
  const clazz = db.classes.find((c) => c.id === classId);
  if (
    !clazz ||
    clazz.status !== "SCHEDULED" ||
    parseDate(clazz.scheduleTime) <= new Date()
  )
    return { ...access, allowed: false, reason: "Lớp không còn mở đăng ký." };
  if (clazz.scheduleTime.slice(0, 10) > access.subscription.endDate)
    return {
      ...access,
      allowed: false,
      reason: "Buổi học diễn ra sau ngày hết hạn gói.",
    };
  const roster = db.bookings.filter(
    (b) => b.classId === classId && b.status === "BOOKED",
  );
  if (roster.some((b) => b.memberId === memberId))
    return { ...access, allowed: false, reason: "Bạn đã đăng ký lớp này." };
  if (roster.length >= clazz.maxCapacity)
    return { ...access, allowed: false, reason: "Lớp đã đủ số lượng đăng ký." };
  if (
    access.pkg.sportIds?.length &&
    !access.pkg.sportIds.includes(clazz.sportId)
  )
    return {
      ...access,
      allowed: false,
      reason: "Bộ môn này không thuộc gói tập đã đăng ký.",
    };
  const used = subscriptionUsage(db, access.subscription);
  if (access.pkg.classLimit && used >= access.pkg.classLimit)
    return {
      ...access,
      allowed: false,
      used,
      reason: "Đã sử dụng hết số lượt đăng ký lớp của gói.",
    };
  const collision = db.bookings.some(
    (b) =>
      b.memberId === memberId &&
      b.status === "BOOKED" &&
      b.classId !== classId &&
      db.classes.some(
        (c) =>
          c.id === b.classId &&
          c.status !== "CANCELLED" &&
          parseDate(c.scheduleTime).getTime() <
            parseDate(clazz.scheduleTime).getTime() +
              clazz.durationMinutes * 60000 &&
          parseDate(clazz.scheduleTime).getTime() <
            parseDate(c.scheduleTime).getTime() + c.durationMinutes * 60000,
      ),
  );
  return {
    ...access,
    used,
    allowed: !collision,
    reason: collision
      ? "Trùng giờ với lớp thành viên đã đăng ký."
      : "Lớp phù hợp quyền lợi gói tập.",
  };
}
export function planMembers(plan: TrainingPlan, db: DemoDatabase) {
  return plan.classId
    ? [
        ...new Set(
          db.bookings
            .filter((b) => b.classId === plan.classId && b.status === "BOOKED")
            .map((b) => b.memberId),
        ),
      ]
    : [plan.memberId];
}
export function coachMembers(db: DemoDatabase, coachId: number) {
  const classes = new Set(
    db.classes.filter((c) => c.coachId === coachId).map((c) => c.id),
  );
  const ids = new Set(
    db.bookings
      .filter((b) => classes.has(b.classId) && b.status === "BOOKED")
      .map((b) => b.memberId),
  );
  db.plans
    .filter((p) => p.coachId === coachId && !p.classId)
    .forEach((p) => ids.add(p.memberId));
  return db.users.filter((u) => ids.has(u.id) && u.roleName === "MEMBER");
}

/** Lượt BOOKED của kỳ gói; hủy booking trả lại lượt, không xóa lịch sử. */
export function subscriptionUsage(
  db: DemoDatabase,
  subscription: Subscription,
) {
  return db.bookings.filter(
    (b) =>
      b.memberId === subscription.memberId &&
      b.status === "BOOKED" &&
      (b.subscriptionId === subscription.id ||
        (!b.subscriptionId &&
          b.bookedAt.slice(0, 10) >= subscription.startDate &&
          b.bookedAt.slice(0, 10) <= subscription.endDate)),
  ).length;
}
