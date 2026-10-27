/** API đã đưa lên main: xác thực, hồ sơ, gói tập, lớp học và lịch hoạt động. Backend kiểm tra quyền trên dữ liệu thật. */
import type {
  Mode,
  RegisterInput,
  Session,
  User,
  Subscription,
  SportClass,
  ClassInput,
  Booking,
  Sport,
  FacilityRoom,
} from "./types";
import { readDemo, saveDemo, demoAudit } from "./demo";
import { can } from "./permissions";
import type { Permission } from "./permissions";
import { addDays, localDate, dateTimeLocal, parseDate } from "./utils";
export const configuredMode: Mode =
  import.meta.env.VITE_DATA_MODE === "demo" ? "demo" : "api";

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
    // Phiên demo lưu từ trước không được ghi đè chế độ kết nối backend thật.
    if (s.mode === "demo" && configuredMode === "api") return null;
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

function ownOrStaff(
  memberId: number,
  permission: Permission = "memberships.assist",
) {
  const s = getSession();
  if (!s || (s.user.id !== memberId && !can(s, permission, readDemo())))
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

const nextId = (items: { id: number }[]) =>
  Math.max(0, ...items.map((x) => x.id)) + 1;

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
export const api = {
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

    if (id) db.classes = db.classes.map((x) => (x.id === id ? c : x));
    else db.classes.push(c);

    demoAudit(db, id ? "Cập nhật lớp học" : "Tạo lớp học", c.className);
    return c;
  },
  async cancelClass(id: number) {
    if (mode() === "api") return post(`/classes/${id}/cancel`);
    requirePermission("classes.manage");
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
      createdAt: dateTimeLocal(),
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
    ownOrStaff(id, "members.read");
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
  /** Lịch sử gói theo thành viên; giữ các bản ghi hết hạn/đã hủy để tra cứu. */
  async subscriptions(memberId: number): Promise<Subscription[]> {
    if (mode() === "api")
      return assertArray(
        await request<Subscription[]>(`/memberships/members/${memberId}`),
      );
    ownOrStaff(memberId);
    return readDemo().subscriptions.filter((s) => s.memberId === memberId);
  },
  /** Có renewId thì gia hạn; không có thì đăng ký mới. Backend tự tính ngày hiệu lực.
   * Đăng ký gói và xác nhận thu tiền là hai nghiệp vụ riêng. */
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
      throw new ApiError("Thành viên không hoạt động.");
    const pkg = db.packages.find((p) => p.id === packageId);
    if (!pkg || pkg.status === "INACTIVE")
      throw new ApiError("Gói tập không tồn tại.");
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
  /** Hủy hiệu lực gói, giữ lịch sử; thao tác này không tự hoàn tiền. */
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
};
