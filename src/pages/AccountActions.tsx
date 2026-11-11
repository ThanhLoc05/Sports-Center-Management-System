import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, Notice } from "../components/ui";
import { api, configuredMode } from "../lib/api";
import { useAuth } from "../lib/auth";

type Action = "verify" | "forgot" | "reset" | "resend";

export default function AccountActions({ action }: { action: Action }) {
  const [params, setParams] = useSearchParams();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (configuredMode !== "api") {
        throw new Error("Tác vụ này chỉ khả dụng khi kết nối backend.");
      }
      if (action === "verify") {
        if (!token) throw new Error("Liên kết xác minh thiếu token.");
        await api.verifyEmail(token);
        setParams({}, { replace: true });
        setMessage("Email đã được xác minh. Bạn có thể đăng nhập.");
      } else if (action === "reset") {
        if (!token) throw new Error("Liên kết đặt lại mật khẩu thiếu token.");
        if (password !== confirm)
          throw new Error("Mật khẩu xác nhận chưa khớp.");
        await api.resetPassword(token, password);
        setParams({}, { replace: true });
        setMessage("Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.");
      } else {
        if (action === "forgot") await api.forgotPassword(email);
        else await api.resendVerification(email);
        setMessage("Nếu email phù hợp với tài khoản, hướng dẫn sẽ được gửi.");
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể hoàn tất yêu cầu.",
      );
    } finally {
      setBusy(false);
    }
  }

  const title: Record<Action, string> = {
    verify: "Xác minh email",
    forgot: "Quên mật khẩu",
    reset: "Đặt mật khẩu mới",
    resend: "Gửi lại email xác minh",
  };

  return (
    <main className="auth-page">
      <section className="auth-form-section">
        <div className="auth-form-content">
          <span className="eyebrow">SPORTIVA</span>
          <h1>{title[action]}</h1>
          {message && <Notice>{message}</Notice>}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <form onSubmit={submit}>
            {(action === "forgot" || action === "resend") && (
              <Field label="Địa chỉ email">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={255}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            )}
            {action === "reset" && (
              <>
                <Field label="Mật khẩu mới">
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <Field label="Nhập lại mật khẩu">
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </Field>
              </>
            )}
            {action === "verify" && (
              <p>Chỉ xác minh sau khi bạn bấm nút bên dưới.</p>
            )}
            <Button
              type="submit"
              loading={busy}
              disabled={busy || (action === "verify" && !token)}
            >
              Xác nhận
            </Button>
          </form>
          {message && (
            <Button
              onClick={() => {
                signOut();
                navigate("/login");
              }}
            >
              Đến đăng nhập
            </Button>
          )}
          <p>
            <Link to="/login">Quay lại đăng nhập</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
