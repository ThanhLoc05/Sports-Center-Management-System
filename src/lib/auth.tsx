/**
 * TRẠNG THÁI ĐĂNG NHẬP DÙNG CHUNG. Context giúp mọi trang đọc cùng một session
 * thay vì truyền props qua nhiều tầng. sessionStorage giữ phiên theo tab;
 * React Query cache được xóa khi đổi tài khoản hoặc đăng xuất để tránh lẫn dữ liệu.
 */
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSession } from "./api";
import type { Session } from "./types";
interface AuthContextType {
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => void;
}
const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(getSession);
  const client = useQueryClient();
  /**
   * Đăng xuất ở frontend: bỏ phiên lưu trong tab, cập nhật React state và xóa cache.
   * Hàm này không gọi endpoint thu hồi JWT trên backend.
   */
  const signOut = () => {
    sessionStorage.removeItem("sportiva-session");
    setSession(null);
    client.clear();
  };
  /**
   * Nhận kết quả đăng nhập đã qua api.login, lưu phiên rồi cho các trang render lại.
   * Không lưu mật khẩu; chỉ giữ token và thông tin người dùng.
   */
  const signIn = (s: Session) => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(s));
    client.clear();
    setSession(s);
  };
  /**
   * request phát sự kiện sportiva:unauthorized khi API trả 401 với token hiện tại.
   * Listener xóa phiên/cache; Protected sau đó chuyển người dùng về đăng nhập.
   */
  useEffect(() => {
    const expire = () => {
      sessionStorage.removeItem("sportiva-session");
      setSession(null);
      client.clear();
    };
    window.addEventListener("sportiva:unauthorized", expire);
    return () => window.removeEventListener("sportiva:unauthorized", expire);
  }, [client]);
  /**
   * Đọc exp trong JWT để chủ động kết thúc phiên trên giao diện khi hết hạn.
   * Giải mã payload bằng atob không xác minh chữ ký; backend mới xác thực token.
   * Cleanup hủy timer cũ khi phiên thay đổi hoặc Provider bị tháo khỏi giao diện.
   */
  useEffect(() => {
    if (session?.mode !== "api") return;
    try {
      const payload = JSON.parse(
        atob(session.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.exp) {
        const delay = payload.exp * 1000 - Date.now();
        if (delay <= 0) {
          window.dispatchEvent(new Event("sportiva:unauthorized"));
          return;
        }
        const id = setTimeout(
          () => window.dispatchEvent(new Event("sportiva:unauthorized")),
          Math.min(delay, 2147483647),
        );
        return () => clearTimeout(id);
      }
    } catch {
      /* Token không giải mã được ở trình duyệt vẫn do backend kiểm tra khi gọi API. */
    }
  }, [session]);
  return (
    <AuthContext.Provider value={{ session, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
/**
 * Hook giúp các component lấy session, signIn, signOut từ AuthProvider.
 * Báo lỗi nếu component nằm ngoài Provider để dễ phát hiện cấu hình sai.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("Auth provider missing");
  return ctx;
}
