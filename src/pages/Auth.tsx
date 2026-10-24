/**
 * ĐĂNG NHẬP/ĐĂNG KÝ — điểm vào Flow 1. Cùng component, prop register chọn form.
 * Trang gom dữ liệu và điều hướng; api.ts chịu trách nhiệm chọn API hoặc demo.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Dumbbell,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  Activity,
} from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, configuredMode } from "../lib/api";
import { useAuth } from "../lib/auth";
import { demoSession } from "../lib/demo";
import { roleLabels } from "../lib/types";
import type { Role } from "../lib/types";
import { Button, Field } from "../components/ui";
import { errorText } from "../lib/utils";
export default function AuthPage({ register = false }: { register?: boolean }) {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  if (session) return <Navigate to="/" replace />;
  /**
   * Đọc FormData và kiểm tra mật khẩu xác nhận nếu đăng ký. Đăng ký xong về login;
   * đăng nhập xong đưa Session vào AuthProvider rồi về dashboard. catch hiện lỗi,
   * finally mở lại nút; navigate chỉ đổi route, không gọi trực tiếp backend.
   */
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const email = String(data.get("email")).trim(),
        password = String(data.get("password"));
      if (register) {
        if (password !== data.get("confirmPassword"))
          throw new Error("Mật khẩu xác nhận chưa khớp.");
        await api.register({
          email,
          password,
          fullName: String(data.get("fullName")).trim(),
          phone: String(data.get("phone")).trim(),
        });
        setSuccess("Tạo tài khoản thành công. Bạn có thể đăng nhập ngay.");
        navigate("/login");
      } else {
        signIn(await api.login(email, password));
        navigate("/");
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Link className="brand brand-light" to="/login">
          <span className="brand-symbol">
            <Activity size={27} />
          </span>
          sportiva<span className="brand-dot">.</span>
        </Link>
        <div className="auth-story-content">
          <span className="pill-light">
            <span />
            MOVE BETTER. LIVE BETTER.
          </span>
          <h1>
            Mỗi chuyển động,
            <br />
            một khởi đầu <em>tốt hơn.</em>
          </h1>
          <p>
            Một không gian kết nối thành viên, huấn luyện viên và mọi hoạt động
            của trung tâm.
          </p>
          <div className="auth-visual">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="visual-core">
              <Dumbbell size={74} strokeWidth={1.2} />
            </div>
            <div className="floating-label label-one">
              <span className="tiny-icon">
                <Activity size={17} />
              </span>
              <div>
                <strong>Không ngừng tiến bộ</strong>
                <small>Mỗi ngày một phiên bản tốt hơn</small>
              </div>
            </div>
            <div className="floating-label label-two">
              <Sparkles size={18} />
              <span>Stronger, together.</span>
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>KHÔNG GIAN CỦA NHỮNG CHUYỂN ĐỘNG</span>
          <ArrowUpRight size={22} />
        </div>
      </section>
      <section className="auth-form-section">
        <div className="auth-topline">
          <span>SPORTS CENTER MANAGEMENT</span>
          <span className="online-dot">
            {configuredMode === "demo" ? "Local preview" : "Kết nối backend"}
          </span>
        </div>
        <div className="auth-form-content">
          <span className="eyebrow">CHÀO MỪNG ĐẾN VỚI SPORTIVA</span>
          <h2>
            {register
              ? "Bắt đầu hành trình của bạn."
              : "Rất vui được gặp lại bạn."}
          </h2>
          <p>
            {register
              ? "Tạo tài khoản thành viên và khám phá lịch tập của bạn."
              : "Đăng nhập để tiếp tục quản lý và kết nối."}
          </p>
          {success && <p className="notice">{success}</p>}
          <form onSubmit={submit}>
            {register && (
              <>
                <Field label="Họ và tên">
                  <input
                    autoComplete="name"
                    name="fullName"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Nguyễn Minh Anh"
                  />
                </Field>
                <Field label="Số điện thoại">
                  <input
                    autoComplete="tel"
                    type="tel"
                    name="phone"
                    required
                    pattern="[+0-9 ()-]{9,20}"
                    placeholder="090 123 4567"
                  />
                </Field>
              </>
            )}
            <Field label="Địa chỉ email">
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={255}
                placeholder="ban@example.com"
              />
            </Field>
            <Field label="Mật khẩu">
              <div className="password-field">
                <input
                  type={show ? "text" : "password"}
                  name="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={register ? 8 : 1}
                  maxLength={128}
                  required
                  placeholder={
                    register ? "Tối thiểu 8 ký tự" : "Nhập mật khẩu của bạn"
                  }
                />
                <button
                  type="button"
                  aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            {register && (
              <Field label="Xác nhận mật khẩu">
                <input
                  type={show ? "text" : "password"}
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Nhập lại mật khẩu"
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button type="submit" loading={busy} className="auth-submit">
              {register ? "Tạo tài khoản" : "Đăng nhập"}
              <ArrowRight size={18} />
            </Button>
          </form>
          <p className="auth-switch">
            {register ? "Đã có tài khoản?" : "Bạn chưa có tài khoản?"}{" "}
            <Link
              to={register ? "/login" : "/register"}
              onClick={() => setError("")}
            >
              {register ? "Đăng nhập" : "Đăng ký thành viên"}
              <ArrowUpRight size={13} />
            </Link>
          </p>
          {configuredMode === "demo" && !register && (
            <div className="demo-entrance">
              <div className="divider">
                <span>HOẶC KHÁM PHÁ BẢN DEMO</span>
              </div>
              <div className="demo-role-grid">
                {(
                  [
                    "CENTER_MANAGER",
                    "COACH",
                    "MEMBER",
                    "RECEPTIONIST",
                  ] as Role[]
                ).map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      signIn(demoSession(role));
                      navigate("/");
                    }}
                  >
                    {roleLabels[role]}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
              <small>
                Dữ liệu minh họa lưu trên trình duyệt. Không cần tài khoản thật.
              </small>
            </div>
          )}
          <div className="auth-secure">
            <ShieldCheck size={15} />
            <span>Không gian tập luyện của bạn. Được kết nối.</span>
          </div>
        </div>
        <footer className="auth-footer">
          © {new Date().getFullYear()} Sportiva. All rights reserved.
          <span>Designed to move you.</span>
        </footer>
      </section>
    </div>
  );
}
