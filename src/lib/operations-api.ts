/**
 * Tập trung API cho hồ sơ, học viên, giáo án, kết quả tập và danh mục trung tâm.
 * Các interface mô tả cấu trúc JSON trao đổi với controller backend hiện tại.
 * Luồng ghi: kiểm tra dữ liệu/quyền ở FE → request dùng JWT → BE kiểm tra và lưu.
 * Kiểm tra ở FE giúp báo lỗi sớm; backend vẫn phải xác thực quyền và nghiệp vụ.
 * Lỗi từ backend được trả về màn hình, không dùng dữ liệu mẫu để giả lưu thành công.
 */
import { ApiError, getSession, request } from "./api";
export interface MemberProfileInput {
  dob: string | null;
  gender: string | null;
  address: string | null;
  fitnessGoals: string | null;
}
export interface MemberProfile extends MemberProfileInput {
  memberId: number;
}
export interface ClassStudent {
  memberId: number;
  fullName: string;
  email: string;
  phone: string;
  gender?: string;
  fitnessGoals?: string;
  bookingStatus: string;
  bookedAt: string;
}
export interface WorkoutPlan {
  id: number;
  title: string;
  coachId: number;
  memberId?: number;
  classId?: number;
  description: string;
  createdAt: string;
}
export type PlanInput = Omit<WorkoutPlan, "id" | "createdAt">;
export interface Exercise {
  id?: number;
  exerciseName: string;
  sets?: number;
  reps?: number;
  weightKg?: number;
}
export interface WorkoutLog {
  id: number;
  memberId: number;
  coachId: number;
  scheduleId?: number;
  feedbackFromCoach?: string;
  createdAt: string;
  details: Exercise[];
}
export type LogInput = Omit<WorkoutLog, "id" | "createdAt">;
export interface PackageInput {
  packageName: string;
  durationDays: number;
  price: number;
  accessLevel: "STANDARD" | "VIP";
  description: string;
  status: "ACTIVE" | "INACTIVE";
}
/** Chặn sớm thao tác ngoài vai trò; quyền thực tế vẫn do backend quyết định. */
function role(allowed: string[]) {
  const s = getSession();
  if (!s || s.mode !== "api" || !allowed.includes(s.user.roleName))
    throw new ApiError("Bạn không có quyền thực hiện thao tác này.", 403);
  return s;
}
const staff = ["CENTER_MANAGER", "MANAGER", "COACH"];
function id(n: number) {
  if (!Number.isSafeInteger(n) || n < 1)
    throw new ApiError("Chọn dữ liệu hợp lệ.");
  return n;
}
function list<T>(v: T[]): T[] {
  if (!Array.isArray(v))
    throw new ApiError("Máy chủ trả danh sách không hợp lệ.");
  return v;
}
const send = <T>(path: string, method: string, body: unknown) =>
  request<T>(path, { method, body: JSON.stringify(body) });
function profileResponse(value: MemberProfile, memberId: number): MemberProfile {
  if (!value || value.memberId !== memberId ||
      [value.dob, value.gender, value.address, value.fitnessGoals]
        .some((field) => field !== null && typeof field !== "string"))
    throw new ApiError("Dữ liệu hồ sơ không hợp lệ hoặc không thuộc thành viên đang xem.");
  return value;
}
export const operations = {
  async students(classId: number) {
    return list(
      await request<ClassStudent[]>(`/classes/${id(classId)}/students`),
    );
  },
  async profile(userId: number): Promise<MemberProfile | null> {
    const memberId = id(userId);
    try {
      return profileResponse(await request<MemberProfile>(`/users/${memberId}/profile`), memberId);
    } catch (error) {
      // Chỉ 404 là chưa có hồ sơ; lỗi quyền/kết nối không được biến thành dữ liệu trống.
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  async saveProfile(userId: number, input: MemberProfileInput): Promise<MemberProfile> {
    const actor = role(["CENTER_MANAGER", "MANAGER", "RECEPTIONIST", "MEMBER"]);
    const memberId = id(userId);
    if (actor.user.roleName === "MEMBER" && actor.user.id !== memberId)
      throw new ApiError("Bạn chỉ được cập nhật hồ sơ của chính mình.", 403);
    const { dob, gender, address, fitnessGoals } = input;
    return profileResponse(await send<MemberProfile>(`/users/${memberId}/profile`, "PUT", {
      dob, gender, address, fitnessGoals,
    }), memberId);
  },
  async plans(kind: "coach" | "member" | "class", target: number) {
    return list(
      await request<WorkoutPlan[]>(`/workout-plans/${kind}/${id(target)}`),
    );
  },
  /** Có planId thì sửa giáo án; chưa có thì tạo mới cho cá nhân hoặc lớp. */
  savePlan(input: PlanInput, planId?: number) {
    const actor = role(staff);
    if (
      !input.title.trim() ||
      !input.description.trim() ||
      (!input.memberId && !input.classId)
    )
      throw new ApiError("Nhập tiêu đề, giáo án và chọn người/lớp nhận.");
    if (actor.user.roleName === "COACH" && input.coachId !== actor.user.id)
      throw new ApiError("Chỉ soạn giáo án dưới tài khoản của bạn.", 403);
    return send<WorkoutPlan>(
      `/workout-plans${planId ? "/" + id(planId) : ""}`,
      planId ? "PUT" : "POST",
      input,
    );
  },
  deletePlan(planId: number) {
    role(staff);
    return request<void>(`/workout-plans/${id(planId)}`, { method: "DELETE" });
  },
  async logs(kind: "coach" | "member", target: number) {
    return list(
      await request<WorkoutLog[]>(`/workout-logs/${kind}/${id(target)}`),
    );
  },
  /** Một nhật ký chứa nhiều bài tập; chỉ gửi số hiệp/lần và mức tạ hợp lệ. */
  saveLog(input: LogInput) {
    const actor = role(staff);
    id(input.memberId);
    if (actor.user.roleName === "COACH" && input.coachId !== actor.user.id)
      throw new ApiError("Không ghi kết quả dưới tên HLV khác.", 403);
    if (
      !input.details.length ||
      input.details.some(
        (e) =>
          !e.exerciseName.trim() ||
          [e.sets, e.reps].some(
            (n) => n !== undefined && (!Number.isSafeInteger(n) || n < 1),
          ) ||
          (e.weightKg !== undefined &&
            (!Number.isFinite(e.weightKg) || e.weightKg < 0)),
      )
    )
      throw new ApiError("Kiểm tra bài tập, số hiệp, số lần và mức tạ.");
    return send<WorkoutLog>("/workout-logs", "POST", input);
  },
  feedback(logId: number, feedback: string) {
    role(staff);
    if (!feedback.trim()) throw new ApiError("Nhập nhận xét buổi tập.");
    return request<WorkoutLog>(
      `/workout-logs/${id(logId)}/feedback?feedback=${encodeURIComponent(feedback.trim())}`,
      { method: "PATCH" },
    );
  },
  createPackage(input: PackageInput) {
    role(["CENTER_MANAGER", "MANAGER"]);
    if (
      !input.packageName.trim() ||
      !Number.isSafeInteger(input.durationDays) ||
      input.durationDays < 1 ||
      !Number.isSafeInteger(input.price) ||
      input.price < 1
    )
      throw new ApiError("Tên, thời hạn và giá gói phải hợp lệ.");
    return send("/memberships/packages", "POST", input);
  },
  createSport(sportName: string, description: string) {
    role(["CENTER_MANAGER", "MANAGER"]);
    if (!sportName.trim()) throw new ApiError("Nhập tên bộ môn.");
    // Cột mô tả NVARCHAR(255): chặn sớm thay vì để database từ chối khi lưu.
    if (description.trim().length > 255)
      throw new ApiError("Mô tả bộ môn không được vượt quá 255 ký tự.");
    return send("/sports", "POST", {
      sportName: sportName.trim(),
      description: description.trim(),
    });
  },
  createRoom(roomName: string, capacity: number) {
    role(["CENTER_MANAGER", "MANAGER"]);
    if (!roomName.trim() || !Number.isSafeInteger(capacity) || capacity < 1)
      throw new ApiError("Nhập tên và sức chứa phòng hợp lệ.");
    return send("/rooms", "POST", { roomName: roomName.trim(), capacity });
  },
};
