import type { Role, Session, DemoDatabase } from "./types";
/** Quyền cố định theo vai trò; bỏ qua mọi cấu hình cấp/thu hồi quyền cũ trong trình duyệt. Backend vẫn kiểm tra quyền API. */
export const permissionLabels = {
  "members.read": "Xem danh sách thành viên",
  "members.create": "Tạo thành viên",
  "members.update": "Sửa hồ sơ/trạng thái",
  "team.manage": "Quản lý nhân viên",
  "roles.manage": "Phân vai trò tài khoản",
  "classes.manage": "Tạo/sửa/hủy lớp",
  "classes.roster": "Xem danh sách học viên của lớp",
  "packages.manage": "Quản lý danh mục gói",
  "bookings.assist": "Đặt/hủy lớp hộ thành viên",
  "memberships.assist": "Đăng ký gói hộ",
  "attendance.record": "Điểm danh lớp",
  "training.manage": "Quản lý tập luyện",
  "notifications.send": "Gửi thông báo/bài tập",
  "payments.collect": "Lập hóa đơn/xác nhận thu",
  "payments.refund": "Ghi nhận hoàn tiền",
  "reports.read": "Xem báo cáo",
  "facilities.manage": "Quản lý phòng/bộ môn",
  "audit.read": "Xem nhật ký",
  "support.manage": "Xử lý hỗ trợ",
} as const;
export type Permission = keyof typeof permissionLabels;
const all = Object.keys(permissionLabels) as Permission[];
export const defaultPermissions: Record<Role, Permission[]> = {
  CENTER_MANAGER: [...all],
  MANAGER: [...all],
  MEMBER: [],
  COACH: [
    "classes.roster",
    "attendance.record",
    "training.manage",
    "notifications.send",
  ],
  RECEPTIONIST: [
    "classes.roster",
    "members.read",
    "members.create",
    "bookings.assist",
    "memberships.assist",
    "attendance.record",
    "payments.collect",
    "support.manage",
  ],
};
export function can(
  session: Session | null,
  permission: Permission,
  db?: DemoDatabase,
) {
  if (!session) return false;
  // Đọc lại tài khoản demo để phiên cũ không giữ quyền sau khi bị đổi vai trò/khóa.
  const user =
    session.mode === "demo" && db
      ? db.users.find((u) => u.id === session.user.id)
      : session.user;
  if (!user || user.status !== "ACTIVE") return false;
  const role = user.roleName === "MANAGER" ? "CENTER_MANAGER" : user.roleName;
  return defaultPermissions[role].includes(permission);
}
export const routePermissions: Record<string, Permission> = {
  "/members": "members.read",
  "/team": "team.manage",
  "/facilities": "facilities.manage",
  "/reports": "reports.read",
  "/audit": "audit.read",
  "/students": "training.manage",
  "/packages": "packages.manage",
};
/** Các trang tự phục vụ luôn giữ quyền xem dữ liệu của chính thành viên.
 * Với nhân viên, menu và URL cùng xét quyền thao tác cố định của từng vai trò. */
export function routeAllowed(
  session: Session | null,
  path: string,
  db?: DemoDatabase,
): boolean | undefined {
  const permission = routePermissions[path];
  if (permission) return can(session, permission, db);
  const own = session?.user.roleName === "MEMBER";
  if (path === "/memberships")
    return own || can(session, "memberships.assist", db);
  if (path === "/payments")
    return (
      own ||
      can(session, "payments.collect", db) ||
      can(session, "payments.refund", db)
    );
  if (path === "/training") return own || can(session, "training.manage", db);
  return undefined;
}
