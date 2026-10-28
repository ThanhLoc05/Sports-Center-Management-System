import type { TrainingPlan } from "./types";
import { coachMembers, planMembers } from "./entitlements";
import { notify } from "./notifications";
/** Ghi hồ sơ demo; không giả lập thành công khi thiếu API cập nhật. */
import type { User, Package } from "./types";
import { ApiError, getSession, updateDemo } from "./api";
import { readDemo } from "./demo";
import { can, defaultPermissions } from "./permissions";
import type { Permission } from "./permissions";
import { dateTimeLocal } from "./utils";
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
export function saveUser(input: Omit<User, "id">, id?: number) {
  const actor = getSession();
  const self = id === actor?.user.id;
  if (!self)
    requireDemoPermission(
      input.roleName === "MEMBER" ? "members.update" : "team.manage",
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
    if (
      !input.name.trim() ||
      !Number.isInteger(input.durationDays) ||
      input.durationDays < 1 ||
      !Number.isFinite(input.price) ||
      input.price < 1 ||
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
