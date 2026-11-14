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
import { Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { api, configuredMode } from "../lib/api";
import { useAuth } from "../lib/auth";

import { Button, Field } from "../components/ui";
import { errorText } from "../lib/utils";

type RegistrationField =
  | "fullName"
  | "phone"
  | "email"
  | "password"
  | "confirmPassword";
type RegistrationFieldErrors = Partial<Record<RegistrationField, string>>;

function validateRegistration(data: FormData): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};
  const fullName = String(data.get("fullName") || "").trim();
  const phone = String(data.get("phone") || "").trim();
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  const confirmation = String(data.get("confirmPassword") || "");

  if (fullName.length < 2 || fullName.length > 100)
    errors.fullName = "Họ và tên phải có từ 2 đến 100 ký tự.";
  if (!/^[+0-9 ()-]{9,20}$/.test(phone))
    errors.phone = "Số điện thoại phải có 9–20 ký tự số hoặc dấu +, khoảng trắng, ngoặc, dấu gạch.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !email.endsWith(".com"))
    errors.email = "Email phải đúng định dạng và kết thúc bằng .com viết thường.";
  if (password.length < 6 || password.length > 128)
    errors.password = "Mật khẩu phải có từ 6 đến 128 ký tự.";
  if (!confirmation || confirmation !== password)
    errors.confirmPassword = "Mật khẩu xác nhận chưa khớp.";
  return errors;
}

function registrationErrorField(message: string): RegistrationField | undefined {
  const value = message.toLocaleLowerCase();
  if (value.includes("email")) return "email";
  if (value.includes("phone") || value.includes("số điện thoại")) return "phone";
  if (value.includes("password") || value.includes("mật khẩu")) return "password";
  if (value.includes("fullname") || value.includes("họ và tên")) return "fullName";
  return undefined;
}

export default function AuthPage({ register = false }: { register?: boolean }) {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({});
  // Giữ kết quả đăng ký qua lần đổi route; không lưu mật khẩu vào dữ liệu demo.
  const success = location.state?.registrationComplete
    ? configuredMode === "demo"
      ? "Đã tạo tài khoản demo. Đăng nhập bằng email vừa đăng ký và mật khẩu chung Sportiva@123."
      : "Email đã được xác minh và tài khoản đã được tạo. Bạn có thể đăng nhập."
    : "";
  if (session) return <Navigate to="/" replace />;
  /**
   * Đọc FormData và kiểm tra mật khẩu xác nhận nếu đăng ký. API mode yêu cầu OTP
   * trước khi tạo tài khoản; demo mode tiếp tục tạo user preview tại chỗ. Đăng nhập
   * xong đưa Session vào AuthProvider rồi về dashboard. catch hiện lỗi,
   * finally mở lại nút; navigate chỉ đổi route, không gọi trực tiếp backend.
   */
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      const email = String(data.get("email")).trim(),
        password = String(data.get("password"));
      if (register) {
        const errors = validateRegistration(data);
        if (Object.keys(errors).length) {
          setFieldErrors(errors);
          return;
        }
        const input = {
          email,
          password,
          fullName: String(data.get("fullName")).trim(),
          phone: String(data.get("phone")).trim(),
        };
        if (configuredMode === "api") {
          await api.beginMemberRegistration(input);
          navigate(`/verify-registration?email=${encodeURIComponent(email)}`);
        } else {
          await api.register(input);
          navigate("/login", { state: { registrationComplete: true } });
        }
      } else {
        signIn(await api.login(email, password));
        navigate("/");
      }
    } catch (e) {
      const message = errorText(e);
      const field = register ? registrationErrorField(message) : undefined;
      if (field) setFieldErrors({ [field]: message });
      else setError(message);
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
          <form onSubmit={submit} noValidate={register}>
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
                    aria-invalid={!!fieldErrors.fullName}
                    onBlur={(event) => {
                      const message = validateRegistration(new FormData(event.currentTarget.form!)).fullName;
                      setFieldErrors((current) => ({ ...current, fullName: message }));
                    }}
                    onChange={(event) => {
                      const message = validateRegistration(new FormData(event.currentTarget.form!)).fullName;
                      setFieldErrors((current) => ({ ...current, fullName: message }));
                    }}
                  />
                  {fieldErrors.fullName && <p role="alert" className="form-error">{fieldErrors.fullName}</p>}
                </Field>
                <Field label="Số điện thoại">
                  <input
                    autoComplete="tel"
                    type="tel"
                    name="phone"
                    required
                    pattern="[+0-9 ()-]{9,20}"
                    placeholder="090 123 4567"
                    aria-invalid={!!fieldErrors.phone}
                    onBlur={(event) => {
                      const message = validateRegistration(new FormData(event.currentTarget.form!)).phone;
                      setFieldErrors((current) => ({ ...current, phone: message }));
                    }}
                    onChange={(event) => {
                      const message = validateRegistration(new FormData(event.currentTarget.form!)).phone;
                      setFieldErrors((current) => ({ ...current, phone: message }));
                    }}
                  />
                  {fieldErrors.phone && <p role="alert" className="form-error">{fieldErrors.phone}</p>}
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
                pattern={register ? "[^\\s@]+@[^\\s@]+\\.com" : undefined}
                title={register ? "Email phải kết thúc bằng .com viết thường." : undefined}
                placeholder="ban@example.com"
                aria-invalid={!!fieldErrors.email}
                onBlur={(event) => {
                  const message = validateRegistration(new FormData(event.currentTarget.form!)).email;
                  if (register) setFieldErrors((current) => ({ ...current, email: message }));
                }}
                onChange={(event) => {
                  if (!register) return;
                  const message = validateRegistration(new FormData(event.currentTarget.form!)).email;
                  setFieldErrors((current) => ({ ...current, email: message }));
                }}
              />
              {register && fieldErrors.email && <p role="alert" className="form-error">{fieldErrors.email}</p>}
            </Field>
            <Field label="Mật khẩu">
              <div className="password-field">
                <input
                  type={show ? "text" : "password"}
                  name="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={register ? 6 : 1}
                  maxLength={128}
                  required
                  placeholder={
                    register ? "Tối thiểu 6 ký tự" : "Nhập mật khẩu của bạn"
                  }
                  aria-invalid={!!fieldErrors.password}
                  onBlur={(event) => {
                    if (!register) return;
                    const errors = validateRegistration(new FormData(event.currentTarget.form!));
                    setFieldErrors((current) => ({ ...current, password: errors.password }));
                  }}
                  onChange={(event) => {
                    if (!register) return;
                    const errors = validateRegistration(new FormData(event.currentTarget.form!));
                    setFieldErrors((current) => ({ ...current, password: errors.password, confirmPassword: errors.confirmPassword }));
                  }}
                />
                <button
                  type="button"
                  aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {register && fieldErrors.password && <p role="alert" className="form-error">{fieldErrors.password}</p>}
            </Field>
            {register && (
              <Field label="Xác nhận mật khẩu">
                <input
                  type={show ? "text" : "password"}
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  placeholder="Nhập lại mật khẩu"
                  aria-invalid={!!fieldErrors.confirmPassword}
                  onBlur={(event) => {
                    const message = validateRegistration(new FormData(event.currentTarget.form!)).confirmPassword;
                    setFieldErrors((current) => ({ ...current, confirmPassword: message }));
                  }}
                  onChange={(event) => {
                    const message = validateRegistration(new FormData(event.currentTarget.form!)).confirmPassword;
                    setFieldErrors((current) => ({ ...current, confirmPassword: message }));
                  }}
                />
                {fieldErrors.confirmPassword && <p role="alert" className="form-error">{fieldErrors.confirmPassword}</p>}
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
          {!register && configuredMode === "api" && (
            <p><Link to="/forgot-password">Quên mật khẩu</Link>{" · "}<Link to="/resend-verification">Gửi lại email xác minh</Link></p>
          )}
          <p className="auth-switch">
            {register ? "Đã có tài khoản?" : "Bạn chưa có tài khoản?"}{" "}
            <Link
              to={register ? "/login" : "/register"}
              onClick={() => {
                setError("");
                setFieldErrors({});
              }}
            >
              {register ? "Đăng nhập" : "Đăng ký thành viên"}
              <ArrowUpRight size={13} />
            </Link>
          </p>

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
