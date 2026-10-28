/** Nghiệp vụ frontend chưa có endpoint BE: chỉ cho ghi trong demo và kiểm tra quyền tại đây. */
import type { Package, Role, TrainingLog, TrainingPlan, User } from "./types";
import { ApiError, getSession, updateDemo } from "./api";
import { readDemo } from "./demo";
import { can, defaultPermissions } from "./permissions";
import type { Permission } from "./permissions";
import { dateTimeLocal, localDate } from "./utils";
import { coachMembers, planMembers } from "./entitlements";
import { notify } from "./notifications";

export function requireDemoPermission(permission: Permission) {
  const session = getSession();
  if (!session || session.mode !== "demo")
    throw new ApiError(
      "Backend chưa có API cho thao tác này. Thay đổi chưa được lưu.",
    );
  const user = readDemo().users.find((u) => u.id === session.user.id);
  if (
    !user ||
    user.status !== "ACTIVE" ||
    !can({ ...session, user }, permission, readDemo())
  )
    throw new ApiError("Bạn không có quyền thực hiện thao tác này.", 403);
  return user;
}
export function saveRole(userId: number, roleName: Role) {
  requireDemoPermission("roles.manage");
  return updateDemo("Đổi vai trò", `Tài khoản #${userId}`, (db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user || !defaultPermissions[roleName])
      throw new ApiError("Vai trò/tài khoản không hợp lệ.");
    const managers = db.users.filter(
      (u) =>
        ["CENTER_MANAGER", "MANAGER"].includes(u.roleName) &&
        u.status === "ACTIVE",
    );
    if (
      user.status === "ACTIVE" &&
      ["CENTER_MANAGER", "MANAGER"].includes(user.roleName) &&
      !["CENTER_MANAGER", "MANAGER"].includes(roleName) &&
      managers.length <= 1
    )
      throw new ApiError("Không thể đổi vai trò của quản lý cuối cùng.");
    user.roleName = roleName;
  });
}
export function saveUser(input: Omit<User, "id">, id?: number) {
  const actor = getSession();
  const db = readDemo();
  const currentActor = db.users.find((u) => u.id === actor?.user.id);
  if (!currentActor || currentActor.status !== "ACTIVE")
    throw new ApiError("Phiên không còn quyền cập nhật hồ sơ.", 403);
  const existing = db.users.find((u) => u.id === id);
  if (id && !existing) throw new ApiError("Không tìm thấy tài khoản cần sửa.");
  const self = id === actor?.user.id;
  if (!self)
    requireDemoPermission(
      (existing?.roleName || input.roleName) === "MEMBER"
        ? existing
          ? "members.update"
          : "members.create"
        : "team.manage",
    );
  return updateDemo(
    id ? "Cập nhật hồ sơ" : "Tạo nhân viên",
    input.fullName,
    (db) => {
      if (
        !actor ||
        !input.fullName.trim() ||
        !/^\S+@\S+\.\S+$/.test(input.email) ||
        !/^[+0-9 ()-]{9,20}$/.test(input.phone)
      )
        throw new ApiError("Kiểm tra họ tên, email và số điện thoại.");
      if (
        db.users.some(
          (u) =>
            u.id !== id &&
            (u.email.toLowerCase() === input.email.toLowerCase() ||
              u.phone === input.phone),
        )
      )
        throw new ApiError("Email hoặc số điện thoại đã được sử dụng.");
      const old = db.users.find((u) => u.id === id);
      if (!defaultPermissions[input.roleName])
        throw new ApiError("Vai trò không hợp lệ.");
      if (
        !old &&
        ["CENTER_MANAGER", "MANAGER"].includes(input.roleName) &&
        !can(actor, "roles.manage", db)
      )
        throw new ApiError("Không có quyền tạo quản lý.", 403);
      if (
        old &&
        ["CENTER_MANAGER", "MANAGER"].includes(old.roleName) &&
        input.status !== "ACTIVE" &&
        db.users.filter(
          (u) =>
            ["CENTER_MANAGER", "MANAGER"].includes(u.roleName) &&
            u.status === "ACTIVE",
        ).length <= 1
      )
        throw new ApiError("Không thể khóa quản lý cuối cùng.");
      if (
        self &&
        old &&
        (input.roleName !== old.roleName || input.status !== old.status)
      )
        throw new ApiError(
          "Không tự thay đổi vai trò hoặc trạng thái bản thân.",
          403,
        );
      const user = {
        ...input,
        roleName: old?.roleName || input.roleName,
        createdAt: old?.createdAt || dateTimeLocal(),
        id: id || Math.max(0, ...db.users.map((u) => u.id)) + 1,
      };
      if (id) db.users = db.users.map((u) => (u.id === id ? user : u));
      else db.users.push(user);
      return user;
    },
  );
}
export function savePackage(input: Omit<Package, "id">, id?: number) {
  requireDemoPermission("packages.manage");
  return updateDemo(id ? "Sửa gói tập" : "Tạo gói tập", input.name, (db) => {
    if (id && !db.packages.some((p) => p.id === id))
      throw new ApiError("Không tìm thấy gói cần sửa.");
    if (
      !input.name.trim() ||
      !Number.isInteger(input.durationDays) ||
      input.durationDays < 1 ||
      !Number.isSafeInteger(input.price) ||
      input.price < 1 ||
      !["ACTIVE", "INACTIVE"].includes(input.status || "ACTIVE") ||
      !input.sportIds?.length ||
      input.sportIds.some((id) => !db.sports.some((s) => s.id === id)) ||
      (input.classLimit != null &&
        (!Number.isInteger(input.classLimit) || input.classLimit < 1))
    )
      throw new ApiError(
        "Kiểm tra tên, học phí, thời hạn, bộ môn và số lượt lớp.",
      );
    const pkg = {
      ...input,
      id: id || Math.max(0, ...db.packages.map((p) => p.id)) + 1,
    };
    if (id) db.packages = db.packages.map((p) => (p.id === id ? pkg : p));
    else db.packages.push(pkg);
    return pkg;
  });
}
export function savePlan(
  input: Omit<TrainingPlan, "id" | "createdAt">,
  id?: number,
) {
  const actor = requireDemoPermission("training.manage");
  return updateDemo(
    id ? "Sửa kế hoạch" : "Giao kế hoạch",
    input.title,
    (db) => {
      const old = db.plans.find((p) => p.id === id);
      if (id && !old) throw new ApiError("Không tìm thấy kế hoạch cần sửa.");
      if (
        !db.users.some(
          (u) =>
            u.id === input.coachId &&
            u.roleName === "COACH" &&
            u.status === "ACTIVE",
        )
      )
        throw new ApiError("HLV không hợp lệ.");
      if (
        !input.classId &&
        !db.users.some(
          (u) =>
            u.id === input.memberId &&
            u.roleName === "MEMBER" &&
            u.status === "ACTIVE",
        )
      )
        throw new ApiError("Học viên không hoạt động.");
      if (
        actor.roleName === "COACH" &&
        ((old && old.coachId !== actor.id) || input.coachId !== actor.id)
      )
        throw new ApiError("Chỉ quản lý kế hoạch mình phụ trách.", 403);
      if (
        input.classId &&
        !db.classes.some(
          (c) =>
            c.id === input.classId &&
            (actor.roleName !== "COACH" || c.coachId === actor.id),
        )
      )
        throw new ApiError("Lớp không thuộc phạm vi phụ trách.", 403);
      if (
        !input.classId &&
        actor.roleName === "COACH" &&
        !coachMembers(db, actor.id).some((u) => u.id === input.memberId)
      )
        throw new ApiError("Học viên không thuộc phạm vi phụ trách.", 403);
      if (!input.title.trim() || !input.exercises.trim())
        throw new ApiError("Tên kế hoạch và bài tập là bắt buộc.");
      const plan = {
        ...input,
        id: id || Math.max(0, ...db.plans.map((p) => p.id)) + 1,
        createdAt: old?.createdAt || dateTimeLocal(),
      };
      if (id) db.plans = db.plans.map((p) => (p.id === id ? plan : p));
      else db.plans.push(plan);
      notify(
        db,
        planMembers(plan, db),
        "Kế hoạch / bài tập từ HLV",
        `${plan.title}. ${plan.notes}`,
        "/training",
        actor.id,
        "HOMEWORK",
      );
      return plan;
    },
  );
}
export function saveTrainingLog(input: Omit<TrainingLog, "id" | "createdAt">) {
  const actor = requireDemoPermission("training.manage");
  return updateDemo(
    "Ghi kết quả tập luyện",
    `Thành viên #${input.memberId}`,
    (db) => {
      const plan = db.plans.find((p) => p.id === input.planId);
      const clazz = db.classes.find((c) => c.id === input.classId);
      if (!clazz || clazz.scheduleTime.slice(0, 10) !== input.sessionDate)
        throw new ApiError("Ngày tập phải khớp buổi/lớp được chọn.");
      if (
        !plan ||
        (plan.classId && plan.classId !== input.classId) ||
        !planMembers(plan, db).includes(input.memberId) ||
        (actor.roleName === "COACH" && plan.coachId !== actor.id)
      )
        throw new ApiError(
          "Không có quyền ghi kết quả học viên/kế hoạch này.",
          403,
        );
      if (
        !input.result.trim() ||
        !input.sessionDate ||
        input.sessionDate > localDate() ||
        !input.classId ||
        !db.classes.some(
          (c) =>
            c.id === input.classId &&
            (actor.roleName !== "COACH" || c.coachId === actor.id),
        ) ||
        !db.bookings.some(
          (b) =>
            b.classId === input.classId &&
            b.memberId === input.memberId &&
            b.status === "BOOKED",
        )
      )
        throw new ApiError(
          "Chọn đúng buổi/lớp đã đăng ký, ngày tập không ở tương lai và nhập kết quả.",
        );
      if (
        input.metric != null &&
        (!Number.isFinite(input.metric) ||
          input.metric < 0 ||
          !input.metricLabel?.trim())
      )
        throw new ApiError("Chỉ số phải không âm và có tên/đơn vị.");
      db.logs.push({
        ...input,
        coachId: actor.id,
        id: Math.max(0, ...db.logs.map((l) => l.id)) + 1,
        createdAt: dateTimeLocal(),
      });
      notify(
        db,
        [input.memberId],
        "Kết quả và nhận xét buổi tập",
        `${input.result}. ${input.feedback}`,
        "/training",
        actor.id,
        "RESULT",
      );
    },
  );
}
export function sendNotification(
  title: string,
  content: string,
  memberId?: number,
  classId?: number,
) {
  const actor = requireDemoPermission("notifications.send");
  return updateDemo("Gửi thông báo", title, (db) => {
    if (!title.trim() || !content.trim())
      throw new ApiError("Nhập tiêu đề và nội dung.");
    if (
      classId &&
      !db.classes.some(
        (c) =>
          c.id === classId &&
          (actor.roleName !== "COACH" || c.coachId === actor.id),
      )
    )
      throw new ApiError("Không phụ trách lớp này.", 403);
    const recipients = classId
      ? db.bookings
          .filter((b) => b.classId === classId && b.status === "BOOKED")
          .map((b) => b.memberId)
      : memberId
        ? [memberId]
        : db.users.filter((u) => u.roleName === "MEMBER").map((u) => u.id);
    if (
      actor.roleName === "COACH" &&
      recipients.some(
        (id) => !coachMembers(db, actor.id).some((u) => u.id === id),
      )
    )
      throw new ApiError("Chỉ gửi cho học viên phụ trách.", 403);
    if (!recipients.length)
      throw new ApiError("Chưa có người nhận trong phạm vi này.");
    notify(db, recipients, title, content, "/notifications", actor.id);
  });
}
export function markNotificationsRead(id?: number) {
  const session = getSession();
  return updateDemo(
    "Đọc thông báo",
    id ? `#${id}` : "Tất cả thông báo của tôi",
    (db) => {
      db.notifications?.forEach((n) => {
        if (n.recipientId === session?.user.id && (!id || n.id === id))
          n.readAt = dateTimeLocal();
      });
    },
  );
}

export function reportTransfer(invoiceId: number) {
  const actor = getSession();
  return updateDemo("Báo đã chuyển khoản", `Hóa đơn #${invoiceId}`, (db) => {
    const invoice = db.invoices.find(
      (i) => i.id === invoiceId && i.memberId === actor?.user.id,
    );
    if (!invoice || invoice.paymentStatus !== "PENDING")
      throw new ApiError("Chỉ báo giao dịch cho hóa đơn chờ thu của mình.");
    if (invoice.transferReportedAt)
      throw new ApiError("Đã gửi báo giao dịch, vui lòng chờ lễ tân kiểm tra.");
    invoice.transferReportedAt = dateTimeLocal();
    notify(
      db,
      db.users
        .filter((u) =>
          can({ token: "demo", user: u, mode: "demo" }, "payments.collect", db),
        )
        .map((u) => u.id),
      "Cần đối chiếu chuyển khoản",
      `Hóa đơn #${invoiceId}. Chỉ xác nhận khi đã nhận tiền.`,
      `/payments?memberId=${invoice.memberId}`,
      actor!.user.id,
      "PAYMENT",
    );
  });
}
