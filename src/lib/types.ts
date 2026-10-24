/** Kiểu xác thực; backend quyết định vai trò thực tế. */
export type Role =
  "CENTER_MANAGER" | "MANAGER" | "COACH" | "MEMBER" | "RECEPTIONIST";

export type Mode = "demo" | "api";

export interface User {
  id: number;
  email: string;
  fullName: string;
  phone: string;
  roleName: Role;
  status: string;
}

export interface Session {
  token: string;
  user: User;
  mode: Mode;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

export const roleLabels: Record<Role, string> = {
  CENTER_MANAGER: "Quản lý trung tâm",
  MANAGER: "Quản lý trung tâm",
  COACH: "Huấn luyện viên",
  MEMBER: "Thành viên",
  RECEPTIONIST: "Nhân viên lễ tân",
};

export const isManager = (role: Role) =>
  role === "CENTER_MANAGER" || role === "MANAGER";
