import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Field, Notice } from "../components/ui";
import { api, ApiError, configuredMode } from "../lib/api";
import { useAuth } from "../lib/auth";

type Step = "email" | "code" | "password" | "done";

export default function ForgotPassword() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [blocked, setBlocked] = useState(false);
  const [expiredOnServer, setExpiredOnServer] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
  const expired = expiredOnServer || secondsLeft === 0;

  useEffect(() => {
    if (step !== "code" && step !== "password") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  async function requestCode(resend = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (configuredMode !== "api")
        throw new Error("Quên mật khẩu cần kết nối backend.");
      const normalized = email.trim().toLowerCase();
      const delivery = resend
        ? await api.resendPasswordResetCode(normalized)
        : await api.forgotPassword(normalized);
      setEmail(normalized);
      setDeadline(delivery.expiresAtEpochMs);
      setNow(Date.now());
      setCode("");
      setToken("");
      setBlocked(false);
      setExpiredOnServer(false);
      setMessage(delivery.message);
      setStep("code");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không thể yêu cầu mã xác minh.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked || code.length !== 6) return;
    if (expired || Date.now() >= deadline) {
      setExpiredOnServer(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const grant = await api.verifyPasswordResetCode(email, code);
      setToken(grant.token);
      setDeadline(grant.expiresAtEpochMs);
      setNow(Date.now());
      setCode("");
      setMessage("");
      setStep("password");
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 429) {
          setBlocked(true);
        } else if (cause.status === 410) {
          setExpiredOnServer(true);
        }
      }
      setCode("");
      setError(
        cause instanceof Error ? cause.message : "Không thể xác minh mã.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token || expired) return;
    setError("");
    if (password.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError("Mật khẩu mới không được vượt quá 72 byte UTF-8.");
      return;
    }
    if (password !== confirmation) {
      setError("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setToken("");
      setPassword("");
      setConfirmation("");
      signOut();
      setStep("done");
      setMessage("Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể đặt lại mật khẩu.",
      );
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setToken("");
    setCode("");
    setPassword("");
    setConfirmation("");
    setError("");
    setMessage("");
    setStep("email");
  }

  const title = {
    email: "Quên mật khẩu",
    code: "Xác minh đặt lại mật khẩu",
    password: "Đặt mật khẩu mới",
    done: "Đã đặt lại mật khẩu",
  }[step];

  return (
    <main className="auth-page">
      <section className="auth-form-section">
        <div className="auth-form-content">
          <span className="eyebrow">SPORTIVA</span>
          <h1>{title}</h1>
          {message && <Notice>{message}</Notice>}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {step === "email" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void requestCode();
              }}
            >
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
              <Button type="submit" loading={busy}>
                Gửi mã OTP
              </Button>
            </form>
          )}
          {step === "code" && (
            <>
              <p>
                Nhập mã 6 chữ số gửi đến <strong>{email}</strong>.
              </p>
              <div aria-live="polite">
                {blocked ? (
                  <Notice>
                    Bạn đã nhập sai 5 lần. Hãy yêu cầu mã mới sau thời gian chờ.
                  </Notice>
                ) : expired ? (
                  <Notice>Mã đã hết hạn. Hãy bấm Gửi lại mã.</Notice>
                ) : (
                  <Notice>
                    Mã hết hạn sau {secondsLeft} giây. Nhập sai 5 lần phải yêu
                    cầu mã mới.
                  </Notice>
                )}
              </div>
              <form onSubmit={verifyCode}>
                <Field label="Mã OTP đặt lại mật khẩu">
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    disabled={blocked || expired || busy}
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </Field>
                <Button
                  type="submit"
                  loading={busy}
                  disabled={blocked || expired || code.length !== 6}
                >
                  Xác minh mã
                </Button>
              </form>
              <Button
                type="button"
                variant="secondary"
                loading={busy}
                disabled={!expired}
                onClick={() => void requestCode(true)}
              >
                Gửi lại mã
              </Button>
              {blocked && !expired && (
                <p>Chờ {secondsLeft} giây để gửi lại mã.</p>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={restart}
              >
                Đổi địa chỉ email
              </Button>
            </>
          )}
          {step === "password" &&
            (expired ? (
              <>
                <Notice>
                  Phiên đặt lại mật khẩu đã hết hạn. Hãy yêu cầu mã mới.
                </Notice>
                <Button onClick={restart}>Yêu cầu mã mới</Button>
              </>
            ) : (
              <form onSubmit={resetPassword}>
                <Field label="Mật khẩu mới">
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
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
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </Field>
                <Button type="submit" loading={busy}>
                  Đặt lại mật khẩu
                </Button>
              </form>
            ))}
          {step === "done" && (
            <Button onClick={() => navigate("/login")}>Đến đăng nhập</Button>
          )}
          <p>
            <Link to="/login">Quay lại đăng nhập</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
