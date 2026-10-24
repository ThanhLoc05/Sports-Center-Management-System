/** Demo xác thực riêng: chỉ lưu tài khoản, không kèm dữ liệu lớp/gói/hóa đơn. */
import type { Role, Session, User } from "./types";
const KEY = "sportiva-auth-demo-v1";
interface DemoAccounts {
  users: User[];
}
export function readDemo(): DemoAccounts {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      Array.isArray(data?.users) &&
      data.users.every((u: User) => u.id && u.email && u.fullName && u.roleName)
    )
      return data;
  } catch {
    /* JSON hỏng thì tạo lại tài khoản mẫu. */
  }
  const db: DemoAccounts = {
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
export function saveDemo(db: DemoAccounts) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
/** Token mẫu không có quyền truy cập backend thật. */
export function demoSession(role: Role): Session {
  const user = readDemo().users.find((user) => user.roleName === role);
  if (!user) throw new Error("Vai trò demo không tồn tại.");
  return { token: "demo-local-only", user, mode: "demo" };
}
