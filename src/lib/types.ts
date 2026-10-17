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
}
export interface Subscription {
  id: number;
  memberId: number;
  packageId: number;
  startDate: string;
  endDate: string;
  status: string;
}
export interface Invoice {
  id: number;
  subscriptionId?: number;
  memberId: number;
  receptionistId?: number;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
}
export type InvoiceInput = Omit<Invoice, "id" | "createdAt">;
export interface Attendance {
  id: number;
  classId: number;
  memberId: number;
  checkedInBy?: number;
  checkedInAt: string;
  status: string;
}
export type AttendanceInput = Omit<Attendance, "id" | "checkedInAt">;
export interface Package {
  id: number;
  name: string;
  durationDays: number;
  price: number;
  description: string;
  features: string[];
}
export interface TrainingPlan {
  id: number;
  title: string;
  memberId: number;
  coachId: number;
  goal: string;
  notes: string;
  exercises: string;
  createdAt: string;
}
export interface TrainingLog {
  id: number;
  planId: number;
  memberId: number;
  coachId: number;
  result: string;
  feedback: string;
  createdAt: string;
}
export interface SupportRequest {
  id: number;
  memberId: number;
  title: string;
  description: string;
  status: string;
  createdAt: string;
}
export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
}
export interface FacilityRoom {
  id: number;
  name: string;
  capacity: number;
  description: string;
}
export interface Sport {
  id: number;
  name: string;
  description: string;
}
export interface DemoDatabase {
  rooms: FacilityRoom[];
  sports: Sport[];
  users: User[];
  classes: SportClass[];
  bookings: Booking[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  attendance: Attendance[];
  packages: Package[];
  plans: TrainingPlan[];
  logs: TrainingLog[];
  tickets: SupportRequest[];
  audit: AuditEntry[];
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
