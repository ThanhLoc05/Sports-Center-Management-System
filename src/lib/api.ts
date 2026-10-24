/** Xác thực được tách từ api.ts hiện có. Chỉ gồm đăng nhập/đăng ký; chưa đưa API nghiệp vụ lên main. */
import type { Mode, RegisterInput, Session, User } from "./types";
import { readDemo, saveDemo } from "./demo";

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
    saveDemo(db);
    return user;
  },
};
