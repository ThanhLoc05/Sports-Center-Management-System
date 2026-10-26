import { dateTimeLocal } from "./utils";
/** Dữ liệu demo tài khoản/hồ sơ, giữ riêng với dữ liệu backend. */
import type { Role, Session, DemoDatabase, User } from "./types";
const KEY = "sportiva-auth-demo-v1";

export function readDemo(): DemoDatabase {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      Array.isArray(data?.users) &&
      data.users.every((u: User) => u.id && u.email && u.fullName && u.roleName)
    ) {
      data.audit ||= [];
      return data;
    }
  } catch {
    /* JSON hỏng thì tạo lại tài khoản mẫu. */
  }
  const db: DemoDatabase = {
    audit: [],
    users: [
      {
        id: 1,
        fullName: "Nguyễn Thanh Lộc",
        email: "manager@sportiva.demo",
        phone: "0901234567",
        roleName: "CENTER_MANAGER",
        status: "ACTIVE",
      },
      {
        id: 2,
        fullName: "Lê Thu Trang",
        email: "reception@sportiva.demo",
        phone: "0902345678",
        roleName: "RECEPTIONIST",
        status: "ACTIVE",
      },
      {
        id: 3,
        fullName: "Trần Thanh Hương",
        email: "coach1@sportiva.demo",
        phone: "0903456780",
        roleName: "COACH",
        status: "ACTIVE",
      },
      {
        id: 10,
        fullName: "Nguyễn Minh Anh",
        email: "member1@sportiva.demo",
        phone: "0912340000",
        roleName: "MEMBER",
        status: "ACTIVE",
      },
    ],
  };
  saveDemo(db);
  return db;
}
export function saveDemo(db: DemoDatabase) {
  localStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new Event("sportiva:demo-changed"));
}
/** Token mẫu không có quyền truy cập backend thật. */
export function demoSession(role: Role): Session {
  const user = readDemo().users.find((user) => user.roleName === role);
  if (!user) throw new Error("Vai trò demo không tồn tại.");
  return { token: "demo-local-only", user, mode: "demo" };
}

export function demoAudit(db: DemoDatabase, action: string, detail: string) {
  let actor = "Người dùng demo";
  try {
    actor =
      JSON.parse(sessionStorage.getItem("sportiva-session") || "{}").user
        ?.fullName || actor;
  } catch {
    /* Không đọc được phiên thì dùng tên người thao tác demo mặc định. */
  }
  db.audit.unshift({
    id: Date.now(),
    actor,
    action,
    detail,
    createdAt: dateTimeLocal(),
  });
  db.audit = db.audit.slice(0, 500);
  saveDemo(db);
}
