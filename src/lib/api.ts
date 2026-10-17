import type {
  Attendance,
  AttendanceInput,
  Booking,
  ClassInput,
  Invoice,
  InvoiceInput,
  Mode,
  RegisterInput,
  Session,
  SportClass,
  Subscription,
  User,
} from "./types";
import { isManager, isStaff } from "./types";
import { parseDate, addDays, dateTimeLocal, localDate } from "./utils";
import { demoAudit, readDemo, saveDemo } from "./demo";
export const configuredMode: Mode =
  import.meta.env.VITE_DATA_MODE === "api" ? "api" : "demo";
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
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
    return s;
  } catch {
    return null;
  }
}
export function mode() {
  return getSession()?.mode || configuredMode;
}
const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
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
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
function assertArray<T>(value: T[]): T[] {
  if (!Array.isArray(value))
    throw new ApiError("Dữ liệu API không đúng định dạng danh sách.");
  return value;
}
function ownOrStaff(memberId: number) {
  const s = getSession();
  if (!s || (s.user.id !== memberId && !isStaff(s.user.roleName)))
    throw new ApiError("Bạn không có quyền truy cập thành viên này.", 403);
}
function staffOnly(managerOnly = false) {
  const s = getSession();
  if (
    !s ||
    !(managerOnly ? isManager(s.user.roleName) : isStaff(s.user.roleName))
  )
    throw new ApiError("Thao tác yêu cầu quyền nhân viên phù hợp.", 403);
}
const nextId = (items: { id: number }[]) =>
  Math.max(0, ...items.map((x) => x.id)) + 1;
export const api = {
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
    };
    db.users.push(user);
    demoAudit(db, "Tạo thành viên", user.fullName);
    return user;
  },
  async users(): Promise<User[]> {
    if (mode() === "api") return assertArray(await request<User[]>("/users"));
    return readDemo().users;
  },
  async user(id: number): Promise<User> {
    if (mode() === "api") return request(`/users/${id}`);
    ownOrStaff(id);
    const user = readDemo().users.find((x) => x.id === id);
    if (!user) throw new ApiError("Không tìm thấy thành viên.", 404);
    return user;
  },
  async status(id: number, status: string): Promise<User> {
    if (mode() === "api")
      return request(
        `/users/${id}/status?status=${encodeURIComponent(status)}`,
        { method: "PATCH" },
      );
    staffOnly(true);
    const db = readDemo();
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new ApiError("Không tìm thấy tài khoản.");
    user.status = status;
    demoAudit(db, "Cập nhật trạng thái", `${user.fullName}: ${status}`);
    return user;
  },
  async classes(coachId?: number): Promise<SportClass[]> {
    if (mode() === "api")
      return assertArray(
        await request<SportClass[]>(
          `/classes${coachId ? `?coachId=${coachId}` : ""}`,
        ),
      );
    return readDemo().classes.filter((c) => !coachId || c.coachId === coachId);
  },
  async saveClass(input: ClassInput, id?: number): Promise<SportClass> {
    if (mode() === "api")
      return id
        ? request(`/classes/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
          })
        : post("/classes", input);
    staffOnly(true);
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
    if (id) db.classes = db.classes.map((x) => (x.id === id ? c : x));
    else db.classes.push(c);
    demoAudit(db, id ? "Cập nhật lớp học" : "Tạo lớp học", c.className);
    return c;
  },
  async cancelClass(id: number) {
    if (mode() === "api") return post(`/classes/${id}/cancel`);
    staffOnly(true);
    const db = readDemo();
    const c = db.classes.find((x) => x.id === id);
    if (!c) throw new ApiError("Lớp không tồn tại.");
    c.status = "CANCELLED";
    db.bookings.forEach((b) => {
      if (b.classId === id) b.status = "CANCELLED";
    });
    demoAudit(db, "Hủy lớp học", c.className);
  },
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
    return readDemo().bookings.filter(
      (b) =>
        (!memberId || b.memberId === memberId) &&
        (!classId || b.classId === classId),
    );
  },
  async book(classId: number, memberId: number): Promise<Booking> {
    if (mode() === "api")
      return post(`/classes/${classId}/book?memberId=${memberId}`);
    ownOrStaff(memberId);
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
    if ((await api.capacity(classId)) <= 0)
      throw new ApiError("Lớp đã đủ số lượng tối đa.");
    const booking = {
      id: nextId(db.bookings),
      classId,
      memberId,
      status: "BOOKED",
      bookedAt: dateTimeLocal(),
    };
    db.bookings.push(booking);
    demoAudit(db, "Đăng ký lớp", `${c.className} · TV${memberId}`);
    return booking;
  },
  async cancelBooking(id: number) {
    if (mode() === "api")
      return request(`/bookings/${id}`, { method: "DELETE" });
    const db = readDemo();
    const b = db.bookings.find((x) => x.id === id);
    if (!b) throw new ApiError("Không tìm thấy đăng ký.");
    ownOrStaff(b.memberId);
    b.status = "CANCELLED";
    demoAudit(db, "Hủy đăng ký lớp", `Đăng ký #${id}`);
  },
  async subscriptions(memberId: number): Promise<Subscription[]> {
    if (mode() === "api")
      return assertArray(
        await request<Subscription[]>(`/memberships/members/${memberId}`),
      );
    ownOrStaff(memberId);
    return readDemo().subscriptions.filter((s) => s.memberId === memberId);
  },
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
    const pkg = db.packages.find((p) => p.id === packageId);
    if (!pkg) throw new ApiError("Gói tập không tồn tại.");
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
    demoAudit(
      db,
      renewId ? "Gia hạn gói tập" : "Đăng ký gói tập",
      `${pkg.name} · TV${memberId}`,
    );
    return sub;
  },
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
  async invoices(memberId?: number): Promise<Invoice[]> {
    if (mode() === "api")
      return assertArray(
        await request<Invoice[]>(
          memberId
            ? `/payments/members/${memberId}/invoices`
            : "/payments/invoices/pending",
        ),
      );
    return readDemo()
      .invoices.filter((i) => !memberId || i.memberId === memberId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async invoice(input: InvoiceInput): Promise<Invoice> {
    if (mode() === "api") return post("/payments/invoices", input);
    staffOnly();
    if (input.amount <= 0) throw new ApiError("Số tiền phải lớn hơn 0.");
    const db = readDemo();
    const inv = {
      ...input,
      id: nextId(db.invoices),
      createdAt: dateTimeLocal(),
    };
    db.invoices.unshift(inv);
    demoAudit(db, "Tạo hóa đơn", `HD${inv.id} · ${inv.amount} VND`);
    return inv;
  },
  async pay(id: number, refund = false): Promise<Invoice> {
    if (mode() === "api")
      return post(`/payments/invoices/${id}/${refund ? "refund" : "pay"}`);
    staffOnly(refund);
    const db = readDemo();
    const inv = db.invoices.find((i) => i.id === id);
    if (!inv) throw new ApiError("Không tìm thấy hóa đơn.");
    if (refund ? inv.paymentStatus !== "PAID" : inv.paymentStatus !== "PENDING")
      throw new ApiError("Trạng thái hóa đơn không phù hợp.");
    inv.paymentStatus = refund ? "REFUNDED" : "PAID";
    demoAudit(db, refund ? "Hoàn tiền" : "Xác nhận thanh toán", `HD${id}`);
    return inv;
  },
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
  async checkIn(input: AttendanceInput): Promise<Attendance> {
    if (mode() === "api") return post("/attendance", input);
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
    const a = {
      ...input,
      id: nextId(db.attendance),
      checkedInAt: dateTimeLocal(),
    };
    db.attendance.push(a);
    demoAudit(db, "Điểm danh", `TV${input.memberId} · Lớp #${input.classId}`);
    return a;
  },
};
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
