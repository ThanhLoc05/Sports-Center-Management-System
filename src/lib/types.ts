/** Kiểu của tài khoản/hồ sơ; không chứa mật khẩu. */
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
  createdAt?: string;
  dob?: string;
  gender?: string;
  address?: string;
  fitnessGoals?: string;
  level?: string;
  bio?: string;
  specialties?: string;
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

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
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

export const isStaff = (role: Role) =>
  isManager(role) || role === "RECEPTIONIST";
export interface DemoDatabase {
  users: User[];
  audit: AuditEntry[];
  packages: Package[];
  subscriptions: Subscription[];
  sports: Sport[];
  rooms: FacilityRoom[];
  classes: SportClass[];
  bookings: Booking[];
}

export interface Subscription {
  id: number;
  memberId: number;
  packageId: number;
  startDate: string;
  endDate: string;
  status: string;
}

export interface Package {
  id: number;
  name: string;
  durationDays: number;
  price: number;
  description: string;
  features: string[];
  sportIds?: number[];
  classLimit?: number | null;
  status?: string;
}

export interface Sport {
  id: number;
  name: string;
  description: string;
}

export interface SportClass {
  id: number;
  className: string;
  sportId: number;
  coachId: number;
  roomId: number;
  maxCapacity: number;
  scheduleTime: string;
  durationMinutes: number;
  status: string;
}

export type ClassInput = Omit<SportClass, "id">;

export interface Booking {
  id: number;
  classId: number;
  memberId: number;
  bookedAt: string;
  status: string;
  subscriptionId?: number;
}

export interface FacilityRoom {
  id: number;
  name: string;
  capacity: number;
  description: string;
}
