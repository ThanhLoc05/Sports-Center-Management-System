import type { Sport, FacilityRoom } from "./types";
/**
 * LỚP GIAO TIẾP DỮ LIỆU CỦA FRONTEND (API GATEWAY).
 * Trang gọi api.tenHam(), không tự ghép URL ở từng nơi. Mỗi hàm chọn nhánh API thật
 * hoặc demo; API lỗi sẽ báo lỗi, không tự trả dữ liệu giả để che lỗi kết nối.
 * Luồng chính: form/trang → api → request/fetch → backend → kết quả hoặc ApiError.
 * Các ràng buộc trong nhánh demo minh họa nghiệp vụ; không thay thế kiểm tra ở backend.
 */
import type {
  Attendance,
  AttendanceInput,
  Booking,
  ClassInput,
  Invoice,
  InvoiceInput,
  MembershipPackage,
  Mode,
  RegisterInput,
  Session,
  SportClass,
  Subscription,
  SupportTicket,
  SupportTicketInput,
  Feedback,
  FeedbackInput,
  CoachFeedbackResponse,
  User,
} from "./types";

import { parseDate, addDays, dateTimeLocal, localDate } from "./utils";
import { demoAudit, readDemo, saveDemo } from "./demo";
import { can } from "./permissions";
import type { Permission } from "./permissions";
import { classEligibility } from "./entitlements";
import { notify } from "./notifications";
/**
 * Bản chạy luôn dùng API thật. Dữ liệu mẫu chỉ được bật bên trong Vitest.
 * Biến VITE được Vite đưa vào frontend lúc chạy dev/build, không phải secret.
 */
export const configuredMode: Mode =
  import.meta.env.MODE === "test" && import.meta.env.VITE_DATA_MODE === "demo"
    ? "demo"
    : "api";
/**
 * Lỗi dùng chung mang cả thông báo và HTTP status. Giao diện dựa vào đây
 * để báo lỗi phù hợp; status=0 dùng cho lỗi không có phản hồi HTTP hợp lệ.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
/**
 * Đọc phiên từ sessionStorage và kiểm tra các trường cần thiết trước khi dùng.
 * Không chấp nhận phiên demo cũ khi ứng dụng cấu hình API thật.
 * Kiểm tra hình dạng phiên ở đây không chứng minh JWT hợp lệ với backend.
 */
export function getSession(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem("sportiva-session") || "null");
    if (
      !s?.user?.id ||
      !s?.token ||
      !["api", "demo"].includes(s.mode) ||
      ![
        "CENTER_MANAGER",
        "MANAGER",
        "COACH",
        "MEMBER",
        "RECEPTIONIST",
      ].includes(s.user.roleName)
    )
      return null;
    // Phiên demo lưu từ trước không được ghi đè chế độ kết nối backend thật.
    if (s.mode === "demo" && configuredMode === "api") return null;
    return s;
  } catch {
    return null;
  }
}
/**
 * Chọn nguồn dữ liệu cho các thao tác theo phiên đang dùng; khi chưa có phiên
 * thì lấy cấu hình khởi động. Dữ liệu API và localStorage demo là hai nguồn riêng.
 */
export function mode() {
  return getSession()?.mode || configuredMode;
}
/**
 * Nếu VITE_API_BASE_URL trống, trình duyệt gọi cùng origin /api/v1; proxy của Vite
 * chuyển tiếp tới backend khi dev/preview. Nếu đặt URL, chỉ đặt origin, không lặp /api/v1.
 */
const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
/**
 * Điểm gửi HTTP dùng chung: ghép URL, thêm Bearer token của phiên API và timeout
 * 15 giây. T mô tả kiểu trả về cho TypeScript; không tự xác minh mọi trường JSON.
 * Đọc text trước để chấp nhận cả phản hồi rỗng và báo cáo dạng văn bản.
 */
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    /**
     * Chỉ token của phiên API mới được gắn vào Authorization; token demo không gửi
     * sang backend. Với login/register chưa có phiên thì không có Bearer token.
     */
    const token = getSession()?.mode === "api" ? getSession()?.token : null;
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const body = await response.text();
    let data: unknown;
    try {
      data = body ? JSON.parse(body) : undefined;
    } catch {
      data = body;
    }
    /**
     * fetch vẫn resolve khi server trả 4xx/5xx; phải tự kiểm tra response.ok.
     * Ưu tiên message từ backend. Lỗi 401 có token làm hết phiên; 403 chỉ báo thiếu quyền.
     */
    if (!response.ok) {
      if (response.status === 401 && token)
        window.dispatchEvent(new Event("sportiva:unauthorized"));
      const fallback: Record<number, string> = {
        400: "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.",
        401: "Email hoặc mật khẩu không đúng, hoặc phiên đăng nhập đã hết hạn.",
        403: "Tài khoản không có quyền thực hiện thao tác này.",
        404: "Không tìm thấy dữ liệu.",
        409: "Dữ liệu vừa thay đổi hoặc đã tồn tại. Vui lòng tải lại.",
        429: "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
      };
      const message =
        data &&
        typeof data === "object" &&
        "message" in data &&
        typeof data.message === "string"
          ? data.message
          : fallback[response.status] ||
            "Máy chủ gặp lỗi. Vui lòng thử lại sau.";
      throw new ApiError(message, response.status);
    }
    /**
     * Proxy sai có thể trả index.html của SPA dù HTTP là 200. Không coi HTML đó
     * là dữ liệu nghiệp vụ thành công; báo người dùng kiểm tra cấu hình kết nối.
     */
    if (response.headers.get("content-type")?.includes("text/html"))
      throw new ApiError(
        "Backend trả về HTML thay vì JSON. Kiểm tra URL API hoặc cấu hình proxy.",
      );
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.");
    throw new ApiError(
      "Không kết nối được backend. Kiểm tra máy chủ và cấu hình API.",
    );
  } finally {
    clearTimeout(timer);
  }
}
/**
 * Helper cho POST: chuyển object thành JSON rồi dùng request để giữ chung
 * cách gắn token, timeout và xử lý lỗi.
 */
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
function feedbackActor() {
  const session = getSession();
  if (session?.mode !== "api" || !["MEMBER", "COACH", "RECEPTIONIST", "CENTER_MANAGER"].includes(session.user.roleName))
    throw new ApiError("Bạn không có quyền truy cập đánh giá.", 403);
  return session.user;
}
function feedbackId(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError("ID đối tượng đánh giá không hợp lệ.");
  return id;
}
function feedbackResponse(value: Feedback): Feedback {
  if (!value || !Number.isSafeInteger(value.id) || value.id < 1 ||
      !Number.isSafeInteger(value.fromUserId) || value.fromUserId < 1 ||
      (value.toUserId !== null && (!Number.isSafeInteger(value.toUserId) || value.toUserId < 1)) ||
      (value.classId !== null && (!Number.isSafeInteger(value.classId) || value.classId < 1)) ||
      (value.rating !== null && (!Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5)) ||
      typeof value.comment !== "string" ||
      !["MEMBER_TO_COACH", "CLASS_FEEDBACK", "COACH_TO_MEMBER"].includes(value.type) ||
      (value.createdAt !== null && typeof value.createdAt !== "string"))
    throw new ApiError("Dữ liệu đánh giá từ máy chủ không hợp lệ.");
  return value;
}
function supportActor(roles = ["MEMBER", "RECEPTIONIST", "CENTER_MANAGER"]) {
  const session = getSession();
  if (session?.mode !== "api" || !roles.includes(session.user.roleName))
    throw new ApiError("Bạn không có quyền thực hiện thao tác hỗ trợ này.", 403);
  return session.user;
}
/**
 * Kiểm tra runtime rằng response danh sách là một mảng. Nếu backend trả object
 * bao trang thay vì mảng, dừng và báo lỗi thay vì để giao diện gọi .filter bị hỏng.
 */
function assertArray<T>(value: T[]): T[] {
  if (!Array.isArray(value))
    throw new ApiError("Dữ liệu API không đúng định dạng danh sách.");
  return value;
}
/**
 * Giới hạn sở hữu trong DEMO: chủ tài khoản hoặc nhóm quản lý/lễ tân mới thao tác
 * được trên thành viên. Nhánh API đi thẳng tới backend để backend quyết định quyền.
 */
function ownOrStaff(
  memberId: number,
  permission: Permission = "memberships.assist",
) {
  const s = getSession();
  const db = readDemo();
  const actor = db.users.find((u) => u.id === s?.user.id);
  if (
    !s ||
    !actor ||
    actor.status !== "ACTIVE" ||
    (actor.id !== memberId && !can({ ...s, user: actor }, permission, db))
  )
    throw new ApiError("Bạn không có quyền truy cập thành viên này.", 403);
}
function requirePermission(permission: Permission) {
  const s = getSession();
  const db = readDemo();
  const user = db.users.find((u) => u.id === s?.user.id);
  if (
    !s ||
    !user ||
    user.status !== "ACTIVE" ||
    !can({ ...s, user }, permission, db)
  )
    throw new ApiError("Bạn không có quyền thực hiện thao tác này.", 403);
}
/**
 * Bảo vệ thao tác ghi trong DEMO; managerOnly yêu cầu quản lý. Đây chỉ là
 * quy tắc mô phỏng trong trình duyệt, không phải lớp bảo mật cho SQL Server.
 */

/**
 * Sinh ID mới cho mảng demo. API thật dùng ID từ backend/database.
 */
const nextId = (items: { id: number }[]) =>
  Math.max(0, ...items.map((x) => x.id)) + 1;
export const api = {
  async coachFeedback(coachId: number): Promise<CoachFeedbackResponse> {
    feedbackActor();
    const result = await request<CoachFeedbackResponse>(`/feedbacks/coach/${feedbackId(coachId)}`);
    if (!result || result.coachId !== coachId || !Number.isFinite(result.averageRating) ||
        !Number.isInteger(result.totalReviews) || result.totalReviews < 0)
      throw new ApiError("Dữ liệu tổng hợp đánh giá HLV không hợp lệ.");
    return { ...result, feedbacks: assertArray(result.feedbacks).map(feedbackResponse) };
  },
  async classFeedback(classId: number): Promise<Feedback[]> {
    feedbackActor();
    return assertArray(await request<Feedback[]>(`/feedbacks/class/${feedbackId(classId)}`)).map(feedbackResponse);
  },
  async memberFeedback(memberId: number): Promise<Feedback[]> {
    const actor = feedbackActor();
    if (actor.id !== memberId && !["RECEPTIONIST", "CENTER_MANAGER"].includes(actor.roleName))
      throw new ApiError("Bạn không có quyền xem nhận xét của thành viên này.", 403);
    return assertArray(await request<Feedback[]>(`/feedbacks/member/${feedbackId(memberId)}`)).map(feedbackResponse);
  },
  async createFeedback(input: FeedbackInput): Promise<Feedback> {
    const actor = feedbackActor();
    if (!["MEMBER", "COACH"].includes(actor.roleName)) throw new ApiError("Vai trò này không được gửi đánh giá.", 403);
    if (!input.comment.trim()) throw new ApiError("Nội dung đánh giá không được để trống.");
    const rating = input.rating ?? null;
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5))
      throw new ApiError("Điểm đánh giá phải là số nguyên từ 1 đến 5.");
    const classTarget = input.classId !== undefined;
    if ((input.toUserId !== undefined) === classTarget || (actor.roleName === "COACH" && classTarget))
      throw new ApiError("Chọn đúng đối tượng nhận đánh giá.");
    // Không gửi fromUserId/type; Backend xác định người gửi và loại từ phiên đăng nhập.
    const target = classTarget ? { classId: feedbackId(input.classId!) } : { toUserId: feedbackId(input.toUserId!) };
    const result = feedbackResponse(await post<Feedback>("/feedbacks", { ...target, rating, comment: input.comment.trim() }));
    const expectedType = actor.roleName === "COACH" ? "COACH_TO_MEMBER" : classTarget ? "CLASS_FEEDBACK" : "MEMBER_TO_COACH";
    if (result.fromUserId !== actor.id || result.type !== expectedType ||
        (classTarget ? result.classId !== input.classId : result.toUserId !== input.toUserId))
      throw new ApiError("Phản hồi đánh giá không khớp yêu cầu đã gửi.");
    return result;
  },
  async supportTickets(): Promise<SupportTicket[]> {
    const actor = supportActor();
    return assertArray(await request<SupportTicket[]>(
      actor.roleName === "MEMBER" ? "/support-tickets/my" : "/support-tickets",
    ));
  },
  async supportTicket(id: number): Promise<SupportTicket> {
    const actor = supportActor();
    if (!Number.isSafeInteger(id) || id < 1) throw new ApiError("Mã phiếu không hợp lệ.");
    const ticket = await request<SupportTicket>(`/support-tickets/${id}`);
    if (!ticket || ticket.id !== id || (actor.roleName === "MEMBER" && ticket.memberId !== actor.id))
      throw new ApiError("Phiếu trả về không thuộc yêu cầu đang xem.");
    return ticket;
  },
  createSupportTicket(input: SupportTicketInput): Promise<SupportTicket> {
    // Chỉ MEMBER tạo cho mình; không mở tạo hộ dù Backend có tùy chọn memberId.
    supportActor(["MEMBER"]);
    const subject = input.subject.trim(), content = input.content.trim();
    if (!subject || !content) throw new ApiError("Tiêu đề và nội dung không được để trống.");
    return post<SupportTicket>("/support-tickets", { subject, content });
  },
  resolveSupportTicket(id: number, response: string): Promise<SupportTicket> {
    supportActor(["RECEPTIONIST", "CENTER_MANAGER"]);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApiError("Mã phiếu không hợp lệ.");
    if (!response.trim()) throw new ApiError("Nội dung phản hồi không được để trống.");
    return request<SupportTicket>(`/support-tickets/${id}/resolve`, {
      method: "PATCH", body: JSON.stringify({ response: response.trim() }),
    });
  },
  /**
   * Đăng nhập: demo so với tài khoản mẫu và mật khẩu chung; API POST /users/login
   * nhận token + user. Kiểm tra response tối thiểu rồi trả Session cho AuthProvider.
   */
  async login(email: string, password: string): Promise<Session> {
    if (configuredMode === "demo") {
      const user = readDemo().users.find(
        (u) => u.email === email && u.status === "ACTIVE",
      );
      if (!user || password !== "Sportiva@123")
        throw new ApiError(
          "Dùng tài khoản demo và mật khẩu Sportiva@123, hoặc chọn vai trò bên dưới.",
          401,
        );
      return { token: "demo-local-only", user, mode: "demo" };
    }
    const data = await post<{ token: string; user: User }>("/users/login", {
      email,
      password,
    });
    if (
      !data?.token ||
      !data.user?.id ||
      ![
        "CENTER_MANAGER",
        "MANAGER",
        "COACH",
        "MEMBER",
        "RECEPTIONIST",
      ].includes(data.user.roleName)
    )
      throw new ApiError("Phản hồi đăng nhập không hợp lệ.");
    return { ...data, mode: "api" };
  },
  /**
   * Flow 1: tạo thành viên qua POST /users/register. Nhánh demo kiểm tra trùng
   * email/điện thoại, luôn gán MEMBER và không lưu mật khẩu nhập từ form.
   */
  async register(input: RegisterInput): Promise<User> {
    if (configuredMode === "api" || mode() === "api")
      return post("/users/register", input);
    const db = readDemo();
    if (db.users.some((u) => u.phone === input.phone))
      throw new ApiError("Số điện thoại đã được sử dụng.");
    if (
      db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())
    )
      throw new ApiError("Email đã được sử dụng.");
    const user: User = {
      id: nextId(db.users),
      email: input.email,
      fullName: input.fullName,
      phone: input.phone,
      roleName: "MEMBER",
      status: "ACTIVE",
      createdAt: dateTimeLocal(),
    };
    db.users.push(user);
    demoAudit(db, "Tạo thành viên", user.fullName);
    return user;
  },
  /**
   * Flow 1: lấy danh sách tài khoản. Việc gọi danh sách ở UI được giới hạn
   * trong useUsers; quyền truy cập API thực tế vẫn do backend kiểm tra.
   */
  async users(): Promise<User[]> {
    if (mode() === "api") return assertArray(await request<User[]>("/users"));
    return readDemo().users;
  },
  /**
   * Đọc hồ sơ một người theo ID, dùng cho màn hồ sơ/tra cứu.
   * Nhánh demo kiểm tra người sở hữu; API xử lý quyền trên tài nguyên ở backend.
   */
  async user(id: number): Promise<User> {
    if (mode() === "api") return request(`/users/${id}`);
    ownOrStaff(id, "members.read");
    const user = readDemo().users.find((x) => x.id === id);
    if (!user) throw new ApiError("Không tìm thấy thành viên.", 404);
    return user;
  },
  /**
   * Flow 1: đổi trạng thái ACTIVE/INACTIVE/BLOCKED của tài khoản, không đổi vai trò.
   * Dùng PATCH /users/{id}/status với query status được encode.
   */
  async status(id: number, status: string): Promise<User> {
    if (mode() === "api")
      return request(
        `/users/${id}/status?status=${encodeURIComponent(status)}`,
        { method: "PATCH" },
      );
    requirePermission("members.update");
    const db = readDemo();
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new ApiError("Không tìm thấy tài khoản.");
    if (!["ACTIVE", "INACTIVE", "BLOCKED"].includes(status))
      throw new ApiError("Trạng thái không hợp lệ.");
    if (
      status !== "ACTIVE" &&
      ["CENTER_MANAGER", "MANAGER"].includes(user.roleName) &&
      db.users.filter(
        (u) =>
          ["CENTER_MANAGER", "MANAGER"].includes(u.roleName) &&
          u.status === "ACTIVE",
      ).length <= 1
    )
      throw new ApiError("Không thể khóa quản lý cuối cùng.");
    user.status = status;
    demoAudit(db, "Cập nhật trạng thái", `${user.fullName}: ${status}`);
    return user;
  },
  /** HLV dùng endpoint tự lấy ID từ JWT; tham số client không được mở rộng lịch của HLV. */
  async classes(coachId?: number): Promise<SportClass[]> {
    const actor = getSession();
    const ownCoach = actor?.user.roleName === "COACH";
    if (ownCoach) coachId = actor.user.id;
    if (mode() === "api")
      return assertArray(
        await request<SportClass[]>(
          ownCoach
            ? "/classes/my-classes"
            : `/classes${coachId ? `?coachId=${coachId}` : ""}`,
        ),
      );
    return readDemo().classes.filter((c) => !coachId || c.coachId === coachId);
  },
  /**
   * Flow 2: chưa có id thì POST tạo lớp, có id thì PUT cập nhật lớp.
   * Nhánh demo kiểm tra sức chứa phòng, ID liên quan, lịch trùng phòng/HLV
   * và không giảm sức chứa dưới số người đã đặt; API phải tự bảo đảm các quy tắc của nó.
   */
  async saveClass(input: ClassInput, id?: number): Promise<SportClass> {
    if (mode() === "api")
      return id
        ? request(`/classes/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
          })
        : post("/classes", input);
    requirePermission("classes.manage");
    if (
      !input.className.trim() ||
      input.maxCapacity < 1 ||
      input.durationMinutes < 1 ||
      parseDate(input.scheduleTime) <= new Date()
    )
      throw new ApiError(
        "Kiểm tra thông tin lớp và thời gian trong tương lai.",
      );
    const db = readDemo();
    if (id && !db.classes.some((c) => c.id === id))
      throw new ApiError("Không tìm thấy lớp cần sửa.");
    if (
      !Number.isSafeInteger(input.maxCapacity) ||
      !Number.isSafeInteger(input.durationMinutes) ||
      !Number.isFinite(parseDate(input.scheduleTime).getTime())
    )
      throw new ApiError("Sức chứa, thời lượng hoặc ngày giờ không hợp lệ.");
    const room = db.rooms.find((r) => r.id === input.roomId);
    if (
      !room ||
      !db.sports.some((s) => s.id === input.sportId) ||
      !db.users.some(
        (u) =>
          u.id === input.coachId &&
          u.roleName === "COACH" &&
          u.status === "ACTIVE",
      )
    )
      throw new ApiError("Phòng, bộ môn hoặc HLV không hợp lệ.");
    if (input.maxCapacity > room.capacity)
      throw new ApiError("Sức chứa lớp không được vượt sức chứa phòng.");
    const collision = db.classes.find(
      (c) =>
        c.id !== id &&
        c.status !== "CANCELLED" &&
        (c.coachId === input.coachId || c.roomId === input.roomId) &&
        parseDate(c.scheduleTime).getTime() <
          parseDate(input.scheduleTime).getTime() +
            input.durationMinutes * 60000 &&
        parseDate(input.scheduleTime).getTime() <
          parseDate(c.scheduleTime).getTime() + c.durationMinutes * 60000,
    );
    if (collision)
      throw new ApiError(
        `Trùng lịch phòng hoặc huấn luyện viên với lớp ${collision.className}.`,
      );
    if (
      id &&
      db.bookings.filter((b) => b.classId === id && b.status === "BOOKED")
        .length > input.maxCapacity
    )
      throw new ApiError("Sức chứa nhỏ hơn số người đã đăng ký.");
    const c = { ...input, id: id || nextId(db.classes) };
    const previous = db.classes.find((x) => x.id === id);
    if (id) db.classes = db.classes.map((x) => (x.id === id ? c : x));
    else db.classes.push(c);
    if (
      previous &&
      (previous.scheduleTime !== c.scheduleTime ||
        previous.coachId !== c.coachId ||
        previous.roomId !== c.roomId)
    )
      notify(
        db,
        db.bookings
          .filter((b) => b.classId === id && b.status === "BOOKED")
          .map((b) => b.memberId),
        "Thay đổi lịch học",
        `${c.className}: ${c.scheduleTime}. Vui lòng kiểm tra lịch mới.`,
        "/schedule",
        getSession()!.user.id,
        "SCHEDULE",
      );
    notify(
      db,
      [c.coachId],
      id ? "Cập nhật lớp phụ trách" : "Phân công lớp học",
      `${c.className} · ${c.scheduleTime}`,
      "/schedule",
      getSession()!.user.id,
      "SCHEDULE",
    );
    demoAudit(db, id ? "Cập nhật lớp học" : "Tạo lớp học", c.className);
    return c;
  },
  /**
   * Hủy chính lớp học khác với hủy một booking. Demo đổi lớp và các booking
   * của lớp sang CANCELLED để thể hiện việc lớp không còn tổ chức.
   */
  async cancelClass(id: number) {
    if (mode() === "api") return post(`/classes/${id}/cancel`);
    requirePermission("classes.manage");
    const db = readDemo();
    const c = db.classes.find((x) => x.id === id);
    if (!c) throw new ApiError("Lớp không tồn tại.");
    notify(
      db,
      [
        c.coachId,
        ...db.bookings
          .filter((b) => b.classId === id && b.status === "BOOKED")
          .map((b) => b.memberId),
      ],
      "Lớp học đã hủy",
      c.className,
      "/schedule",
      getSession()!.user.id,
      "SCHEDULE",
    );
    c.status = "CANCELLED";
    db.bookings.forEach((b) => {
      if (b.classId === id) b.status = "CANCELLED";
    });
    demoAudit(db, "Hủy lớp học", c.className);
  },
  /**
   * Đọc số chỗ còn lại để khóa nút đăng ký nếu đầy. Dữ liệu này chỉ là ảnh chụp
   * tại thời điểm tải; backend phải kiểm tra lại khi nhận yêu cầu đặt chỗ.
   */
  async capacity(id: number): Promise<number> {
    if (mode() === "api") return request(`/classes/${id}/capacity`);
    const db = readDemo();
    return Math.max(
      0,
      (db.classes.find((c) => c.id === id)?.maxCapacity || 0) -
        db.bookings.filter((b) => b.classId === id && b.status === "BOOKED")
          .length,
    );
  },
  async bookings(memberId?: number, classId?: number): Promise<Booking[]> {
    if (mode() === "api") {
      if (!memberId && !classId)
        throw new ApiError("Chọn lớp hoặc thành viên để tải đăng ký.");
      return assertArray(
        await request<Booking[]>(
          classId
            ? `/classes/${classId}/bookings`
            : `/members/${memberId}/bookings`,
        ),
      );
    }
    const actor = getSession();
    if (classId) {
      requirePermission("classes.roster");
      if (
        actor?.user.roleName === "COACH" &&
        !readDemo().classes.some(
          (c) => c.id === classId && c.coachId === actor.user.id,
        )
      )
        throw new ApiError("Lớp không thuộc phạm vi phụ trách.", 403);
    } else if (memberId) ownOrStaff(memberId);
    else throw new ApiError("Chọn lớp hoặc thành viên.");
    return readDemo().bookings.filter(
      (b) =>
        (!memberId || b.memberId === memberId) &&
        (!classId || b.classId === classId),
    );
  },
  /**
   * Flow 2: POST /classes/{classId}/book?memberId=...; memberId nằm ở query,
   * không gửi JSON body. Demo kiểm tra lớp còn mở/chưa bắt đầu, trùng đăng ký
   * và còn chỗ rồi lưu BOOKED. Lỗi API không được coi là đăng ký thành công.
   */
  async book(classId: number, memberId: number): Promise<Booking> {
    if (mode() === "api")
      return post(`/classes/${classId}/book?memberId=${memberId}`);
    ownOrStaff(memberId, "bookings.assist");
    const db = readDemo();
    const c = db.classes.find((x) => x.id === classId);
    if (
      !c ||
      c.status !== "SCHEDULED" ||
      parseDate(c.scheduleTime) <= new Date()
    )
      throw new ApiError("Lớp không còn mở đăng ký.");
    if (
      db.bookings.some(
        (b) =>
          b.memberId === memberId &&
          b.classId === classId &&
          b.status === "BOOKED",
      )
    )
      throw new ApiError("Thành viên đã đăng ký lớp này.");
    // Kiểm tra và ghi trong cùng lượt xử lý demo, tránh hai thao tác cùng lấy chỗ cuối.
    const eligibility = classEligibility(db, classId, memberId);
    if (!eligibility.allowed) throw new ApiError(eligibility.reason);
    const booking = {
      id: nextId(db.bookings),
      classId,
      memberId,
      status: "BOOKED",
      bookedAt: dateTimeLocal(),
      subscriptionId: eligibility.subscription?.id,
    };
    db.bookings.push(booking);
    demoAudit(db, "Đăng ký lớp", `${c.className} · TV${memberId}`);
    return booking;
  },
  /**
   * Hủy một lượt đăng ký bằng DELETE /bookings/{id}. Demo giữ bản ghi và chuyển
   * sang CANCELLED để trả chỗ; không xóa lớp học.
   */
  async cancelBooking(id: number) {
    if (mode() === "api")
      return request(`/bookings/${id}`, { method: "DELETE" });
    const db = readDemo();
    const b = db.bookings.find((x) => x.id === id);
    if (!b) throw new ApiError("Không tìm thấy đăng ký.");
    ownOrStaff(b.memberId, "bookings.assist");
    b.status = "CANCELLED";
    demoAudit(db, "Hủy đăng ký lớp", `Đăng ký #${id}`);
  },
  /**
   * Đọc gói đang hiệu lực do backend xác định theo ngày hiện tại.
   */
  async activeSubscription(memberId: number): Promise<Subscription | null> {
    if (!Number.isSafeInteger(memberId) || memberId < 1)
      throw new ApiError("Mã thành viên không hợp lệ.");
    try {
      const subscription = await request<Subscription>(
        `/memberships/members/${memberId}/active`,
      );
      if (
        !subscription ||
        typeof subscription !== "object" ||
        Array.isArray(subscription)
      )
        throw new ApiError("Dữ liệu gói đang hiệu lực không hợp lệ.");
      return subscription;
    } catch (error) {
      // Chỉ 404 là chưa có gói; lỗi quyền/kết nối phải được giữ nguyên.
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  async membershipPackages(): Promise<MembershipPackage[]> {
    // Gói ngừng bán vẫn có thể cấp quyền cho subscription còn hiệu lực.
    return assertArray(
      await request<MembershipPackage[]>("/memberships/packages"),
    );
  },
  /** Flow 1: lịch sử các kỳ gói đã đăng ký, khác danh mục gói bán. */
  async subscriptions(memberId: number): Promise<Subscription[]> {
    if (mode() === "api")
      return assertArray(
        await request<Subscription[]>(`/memberships/members/${memberId}`),
      );
    ownOrStaff(memberId);
    return readDemo().subscriptions.filter((s) => s.memberId === memberId);
  },
  /**
   * Có renewId: gọi gia hạn bằng POST /memberships/{id}/renew?packageId=...;
   * không có renewId: POST /memberships/subscribe với memberId và packageId.
   * Demo tạo hóa đơn chờ thu cùng đăng ký; API hiện vẫn tách hai thao tác ở backend.
   */
  async subscribe(
    memberId: number,
    packageId: number,
    renewId?: number,
  ): Promise<Subscription> {
    if (mode() === "api")
      return renewId
        ? post(`/memberships/${renewId}/renew?packageId=${packageId}`)
        : post("/memberships/subscribe", { memberId, packageId });
    ownOrStaff(memberId);
    const db = readDemo();
    if (
      !db.users.some(
        (u) =>
          u.id === memberId && u.roleName === "MEMBER" && u.status === "ACTIVE",
      )
    )
      throw new ApiError("Thành viên không hoạt động hoặc không đúng vai trò.");
    const pkg = db.packages.find((p) => p.id === packageId);
    if (!pkg || pkg.status === "INACTIVE")
      throw new ApiError("Gói tập không tồn tại hoặc ngừng bán.");
    if (
      !renewId &&
      db.subscriptions.some(
        (s) =>
          s.memberId === memberId &&
          s.status === "ACTIVE" &&
          s.endDate >= localDate(),
      )
    )
      throw new ApiError(
        "Thành viên đã có gói đang hoạt động. Vui lòng chọn Gia hạn.",
      );
    // Gia hạn một bản ghi cũ không được tạo thêm gói song song với gói đang dùng.
    if (
      renewId &&
      db.subscriptions.some(
        (s) =>
          s.memberId === memberId &&
          s.id !== renewId &&
          s.status === "ACTIVE" &&
          s.endDate >= localDate(),
      )
    )
      throw new ApiError(
        "Thành viên đang có gói khác còn hiệu lực. Hãy gia hạn gói đang dùng.",
      );
    if (renewId) {
      const old = db.subscriptions.find(
        (s) => s.id === renewId && s.memberId === memberId,
      );
      if (!old) throw new ApiError("Không tìm thấy gói cần gia hạn.");
      old.status = "EXPIRED";
    }
    const sub = {
      id: nextId(db.subscriptions),
      memberId,
      packageId,
      startDate: localDate(),
      endDate: localDate(addDays(pkg.durationDays)),
      status: "ACTIVE",
    };
    db.subscriptions.push(sub);
    const invoice = {
      id: nextId(db.invoices),
      memberId,
      subscriptionId: sub.id,
      amount: pkg.price,
      paymentMethod: "BANK_TRANSFER",
      paymentStatus: "PENDING",
      createdAt: dateTimeLocal(),
    };
    db.invoices.unshift(invoice);
    notify(
      db,
      [memberId],
      "Gói tập đang chờ thu tiền",
      `${pkg.name}. Mở hóa đơn #${invoice.id} để xem thông tin thanh toán.`,
      "/payments",
      getSession()!.user.id,
      "MEMBERSHIP",
    );
    demoAudit(
      db,
      renewId ? "Gia hạn gói tập" : "Đăng ký gói tập",
      `${pkg.name} · TV${memberId}`,
    );
    return sub;
  },
  /**
   * Hủy hiệu lực gói; thao tác này không tự hoàn tiền hóa đơn đã thanh toán.
   */
  async cancelSubscription(id: number, memberId: number) {
    if (mode() === "api") return post(`/memberships/${id}/cancel`);
    ownOrStaff(memberId);
    const db = readDemo();
    const s = db.subscriptions.find(
      (x) => x.id === id && x.memberId === memberId,
    );
    if (!s) throw new ApiError("Không tìm thấy gói tập.");
    s.status = "CANCELLED";
    demoAudit(db, "Hủy gói tập", `Gói đăng ký #${id}`);
  },
  /**
   * Flow 3: có memberId thì lấy hóa đơn của thành viên. Chưa chọn memberId thì
   * API chỉ trả hóa đơn PENDING, không phải toàn bộ lịch sử thu tiền của trung tâm.
   */
  async invoices(memberId?: number): Promise<Invoice[]> {
    if (mode() === "api")
      return assertArray(
        await request<Invoice[]>(
          memberId
            ? `/payments/members/${memberId}/invoices`
            : "/payments/invoices/pending",
        ),
      );
    if (memberId) ownOrStaff(memberId, "payments.collect");
    else requirePermission("payments.collect");
    return readDemo()
      .invoices.filter((i) => !memberId || i.memberId === memberId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  /**
   * Tạo bản ghi hóa đơn từ payload. Màn Payments chủ động gửi PENDING;
   * chỉ tạo hóa đơn không đồng nghĩa tiền đã thực nhận.
   */
  async invoice(input: InvoiceInput): Promise<Invoice> {
    if (mode() === "api") return post("/payments/invoices", input);
    requirePermission("payments.collect");
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
      throw new ApiError("Số tiền phải là số nguyên VND lớn hơn 0.");
    const db = readDemo();
    if (
      !db.users.some((u) => u.id === input.memberId && u.roleName === "MEMBER")
    )
      throw new ApiError("Không tìm thấy thành viên nhận hóa đơn.");
    if (input.paymentStatus !== "PENDING")
      throw new ApiError(
        "Hóa đơn mới phải chờ thanh toán; xác nhận thu tiền là thao tác riêng.",
      );
    if (
      !["BANK_TRANSFER", "CASH", "CREDIT_CARD", "VNPAY"].includes(
        input.paymentMethod,
      )
    )
      throw new ApiError("Phương thức thanh toán không hợp lệ.");
    if (
      input.subscriptionId &&
      !db.subscriptions.some(
        (s) => s.id === input.subscriptionId && s.memberId === input.memberId,
      )
    )
      throw new ApiError("Đăng ký gói không thuộc thành viên trên hóa đơn.");
    const inv = {
      ...input,
      id: nextId(db.invoices),
      createdAt: dateTimeLocal(),
    };
    db.invoices.unshift(inv);
    demoAudit(db, "Tạo hóa đơn", `HD${inv.id} · ${inv.amount} VND`);
    return inv;
  },
  /**
   * Flow 3: gọi /pay để xác nhận thu tiền hoặc /refund để ghi nhận hoàn tiền.
   * Đây là cập nhật trạng thái nghiệp vụ; code không tự chuyển khoản ngân hàng
   * và không tích hợp cổng VNPay chỉ vì có lựa chọn phương thức VNPAY.
   */
  async pay(id: number, refund = false): Promise<Invoice> {
    if (mode() === "api")
      return post(`/payments/invoices/${id}/${refund ? "refund" : "pay"}`);
    requirePermission(refund ? "payments.refund" : "payments.collect");
    const db = readDemo();
    const inv = db.invoices.find((i) => i.id === id);
    if (!inv) throw new ApiError("Không tìm thấy hóa đơn.");
    if (refund ? inv.paymentStatus !== "PAID" : inv.paymentStatus !== "PENDING")
      throw new ApiError("Trạng thái hóa đơn không phù hợp.");
    inv.paymentStatus = refund ? "REFUNDED" : "PAID";
    if (!refund) inv.paidAt = dateTimeLocal();
    notify(
      db,
      [inv.memberId],
      refund ? "Đã ghi nhận hoàn tiền" : "Đã xác nhận thu tiền",
      `Hóa đơn #${id}`,
      "/payments",
      getSession()!.user.id,
      "PAYMENT",
    );
    demoAudit(db, refund ? "Hoàn tiền" : "Xác nhận thanh toán", `HD${id}`);
    return inv;
  },
  /**
   * Đọc tổng doanh thu theo khoảng LocalDateTime. Tham số được encode và không
   * thêm Z vì backend dùng giờ địa phương trung tâm. Demo chỉ cộng hóa đơn PAID.
   */
  async revenue(start: string, end: string): Promise<number> {
    if (mode() === "api")
      return request(
        `/payments/revenue?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
      );
    return readDemo()
      .invoices.filter(
        (i) =>
          i.paymentStatus === "PAID" &&
          i.createdAt >= start &&
          i.createdAt <= end,
      )
      .reduce((sum, i) => sum + i.amount, 0);
  },
  /**
   * Flow 4: đọc điểm danh theo lớp hoặc lịch sử một thành viên trong khoảng ngày.
   * Sau phản hồi, frontend lọc ngày để màn hình nhất quán với khoảng đang chọn.
   */
  async attendance(
    memberId?: number,
    classId?: number,
    start = localDate(addDays(-30)),
    end = localDate(),
  ): Promise<Attendance[]> {
    if (mode() === "api") {
      if (!memberId && !classId)
        throw new ApiError("Chọn lớp hoặc thành viên để xem điểm danh.");
      return assertArray(
        await request<Attendance[]>(
          classId
            ? `/attendance/classes/${classId}`
            : `/attendance/members/${memberId}?startDate=${start}&endDate=${end}`,
        ),
      ).filter(
        (a) =>
          a.checkedInAt.slice(0, 10) >= start &&
          a.checkedInAt.slice(0, 10) <= end,
      );
    }
    return readDemo().attendance.filter(
      (a) =>
        (!memberId || a.memberId === memberId) &&
        (!classId || a.classId === classId) &&
        a.checkedInAt.slice(0, 10) >= start &&
        a.checkedInAt.slice(0, 10) <= end,
    );
  },
  /**
   * Gửi classId, memberId, checkedInBy, status để ghi nhận điểm danh.
   * Trong demo: thành viên không tự điểm danh và không được ghi trùng một lớp.
   */
  async checkIn(input: AttendanceInput): Promise<Attendance> {
    if (mode() === "api") return post("/attendance", input);
    requirePermission("attendance.record");
    const s = getSession();
    if (!s || s.user.roleName === "MEMBER")
      throw new ApiError("Bạn không có quyền điểm danh.", 403);
    const db = readDemo();
    if (
      db.attendance.some(
        (a) => a.classId === input.classId && a.memberId === input.memberId,
      )
    )
      throw new ApiError("Thành viên đã được điểm danh trong lớp này.");
    const clazz = db.classes.find((c) => c.id === input.classId);
    if (
      !clazz ||
      clazz.status === "CANCELLED" ||
      !db.bookings.some(
        (b) =>
          b.classId === input.classId &&
          b.memberId === input.memberId &&
          b.status === "BOOKED",
      )
    )
      throw new ApiError("Chỉ điểm danh học viên đang đăng ký lớp hợp lệ.");
    if (s.user.roleName === "COACH" && clazz.coachId !== s.user.id)
      throw new ApiError("Bạn không phụ trách lớp này.", 403);
    const a = {
      ...input,
      checkedInBy: s.user.id,
      id: nextId(db.attendance),
      checkedInAt: dateTimeLocal(),
    };
    db.attendance.push(a);
    demoAudit(db, "Điểm danh", `TV${input.memberId} · Lớp #${input.classId}`);
    return a;
  },

  /** API danh mục mới của backend: đổi tên trường DTO sang kiểu frontend, không lấy tên demo thay thế. */
  async sports(): Promise<Sport[]> {
    if (mode() !== "api") return readDemo().sports;
    const rows = assertArray(
      await request<{ id: number; sportName: string; description?: string }[]>(
        "/sports",
      ),
    );
    return rows.map((s) => ({
      id: s.id,
      name: s.sportName,
      description: s.description || "",
    }));
  },
  async rooms(): Promise<FacilityRoom[]> {
    if (mode() !== "api") return readDemo().rooms;
    const rows = assertArray(
      await request<{ id: number; roomName: string; capacity: number }[]>(
        "/rooms",
      ),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.roomName,
      capacity: r.capacity,
      description: "",
    }));
  },
};
/**
 * Cổng ghi dữ liệu cho module chưa có API. Chỉ chạy trong demo, nhận callback
 * đổi dữ liệu rồi lưu localStorage và ghi nhật ký. API mode sẽ báo chưa có endpoint
 * thay vì âm thầm ghi dữ liệu cục bộ và khiến người dùng tưởng đã lưu lên server.
 */
export function updateDemo<T>(
  action: string,
  detail: string,
  fn: (db: ReturnType<typeof readDemo>) => T,
): T {
  if (mode() !== "demo") throw new ApiError("Chức năng chưa có API backend.");
  const db = readDemo();
  const result = fn(db);
  saveDemo(db);
  demoAudit(db, action, detail);
  return result;
}
