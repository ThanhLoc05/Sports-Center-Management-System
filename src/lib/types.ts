/**
 * HỢP ĐỒNG DỮ LIỆU TYPESCRIPT DÙNG TRONG FRONTEND.
 * Interface/type mô tả hình dạng dữ liệu để phát hiện dùng sai trường khi biên dịch;
 * chúng không tự kiểm tra JSON lúc chạy và không tự tạo bảng SQL.
 * Các kiểu TrainingPlan, Package, SupportRequest... còn phục vụ dữ liệu demo.
 */
/**
 * Vai trò dùng để chọn menu, route và nút thao tác. Vai trò thực tế của phiên API
 * được nhận từ backend sau đăng nhập, không lấy từ nút đổi vai trò demo.
 */
export type Role =
  "CENTER_MANAGER" | "MANAGER" | "COACH" | "MEMBER" | "RECEPTIONIST";
export type Mode = "demo" | "api";
/**
 * Thông tin tài khoản hiển thị trên frontend; không giữ mật khẩu hay password hash.
 */
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
/**
 * Một phiên gồm token, người đăng nhập và nguồn dữ liệu (api/demo).
 * Token API đi kèm yêu cầu tới backend; token demo chỉ là giá trị minh họa.
 */
export interface Session {
  token: string;
  user: User;
  mode: Mode;
}
/**
 * Dữ liệu gửi khi tạo tài khoản. Backend tự quyết định vai trò MEMBER;
 * form đăng ký không được dùng để tự cấp quyền quản lý.
 */
export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}
/**
 * Lớp học nối bộ môn, phòng và HLV bằng các ID; scheduleTime là giờ bắt đầu
 * và durationMinutes là thời lượng. Đây là dữ liệu nguồn để dựng lịch học.
 */
export type AccessLevel = "STANDARD" | "VIP";

export interface SportClass {
  id: number;
  className: string;
  sportId: number;
  coachId: number;
  roomId: number;
  maxCapacity: number;
  scheduleTime: string;
  durationMinutes: number;
  requiredAccessLevel: AccessLevel;
  status: string;
}
/**
 * Payload tạo/sửa lớp bỏ id vì ID bản ghi do backend quản lý.
 */
export type ClassInput = Omit<SportClass, "id">;
/**
 * Một đăng ký nối một thành viên với một lớp. Hủy đăng ký thay đổi trạng thái
 * để phân biệt với hủy chính lớp học và giữ được lịch sử.
 */
export interface Booking {
  id: number;
  classId: number;
  memberId: number;
  bookedAt: string;
  status: string;
  subscriptionId?: number;
}
/**
 * Gói mà thành viên đã đăng ký, có khoảng ngày sử dụng và trạng thái.
 * Khác với Package là danh mục sản phẩm/gói tập được chào bán.
 */
export interface Subscription {
  id: number;
  memberId: number;
  packageId: number;
  startDate: string;
  endDate: string;
  status: string;
}
/**
 * Hóa đơn ghi nhận số tiền, phương thức và trạng thái thu tiền. subscriptionId
 * có thể trống nếu hóa đơn không gắn với một đăng ký gói cụ thể.
 */
export interface Invoice {
  /** Hóa đơn yêu cầu gói phải xác nhận qua API order để thu tiền và kích hoạt cùng giao dịch. */
  membershipOrderId?: number;
  id: number;
  subscriptionId?: number;
  memberId: number;
  receptionistId?: number;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  paidAt?: string;
  transferReportedAt?: string;
}
export type InvoiceInput = Omit<Invoice, "id" | "createdAt">;
/**
 * Kết quả điểm danh một thành viên trong lớp; checkedInBy là ID người ghi nhận,
 * không phải ID học viên được điểm danh.
 */
export interface Attendance {
  id: number;
  classId: number;
  memberId: number;
  checkedInBy?: number;
  checkedInAt: string;
  status: string;
}
export type AttendanceInput = Omit<Attendance, "id" | "checkedInAt">;
/**
 * Mô tả gói tập để hiển thị thẻ giá và quyền lợi trong demo. Hiện backend
 * chưa cung cấp API danh mục tương ứng cho màn hình này.
 */
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
/**
 * Kế hoạch tập luyện cá nhân hoặc cả lớp. Có classId thì lấy học viên từ booking
 * của lớp; không có classId thì memberId là người nhận kế hoạch cá nhân.
 */
export interface TrainingPlan {
  id: number;
  title: string;
  memberId: number;
  coachId: number;
  goal: string;
  notes: string;
  exercises: string;
  createdAt: string;
  classId?: number;
  dueDate?: string;
}
/**
 * Kết quả và nhận xét gắn với một kế hoạch; hiện được dùng trong luồng demo.
 */
export interface TrainingLog {
  id: number;
  planId: number;
  memberId: number;
  coachId: number;
  result: string;
  feedback: string;
  createdAt: string;
  classId?: number;
  sessionDate?: string;
  metric?: number;
  metricLabel?: string;
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
/**
 * Tập các mảng dữ liệu giả lập để chạy web demo trên localStorage.
 * Các bản ghi ở đây không tự đồng bộ sang database của backend.
 */
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
  permissions?: Partial<Record<Role, string[]>>;
  notifications?: CenterNotification[];
  visits?: CenterVisit[];
}
export interface CenterNotification {
  id: number;
  recipientId: number;
  senderId: number;
  title: string;
  content: string;
  createdAt: string;
  readAt?: string;
  link: string;
  kind: string;
}
export interface CenterVisit {
  id: number;
  memberId: number;
  checkedInBy: number;
  checkedInAt: string;
  checkedOutAt?: string;
}
export const roleLabels: Record<Role, string> = {
  CENTER_MANAGER: "Quản lý trung tâm",
  MANAGER: "Quản lý trung tâm",
  COACH: "Huấn luyện viên",
  MEMBER: "Thành viên",
  RECEPTIONIST: "Nhân viên lễ tân",
};
/**
 * Gom hai tên vai trò quản lý. isStaff bên dưới gồm quản lý và lễ tân;
 * COACH không thuộc nhóm isStaff trong thiết kế helper này.
 */
export const isManager = (role: Role) =>
  role === "CENTER_MANAGER" || role === "MANAGER";
export const isStaff = (role: Role) =>
  isManager(role) || role === "RECEPTIONIST";
