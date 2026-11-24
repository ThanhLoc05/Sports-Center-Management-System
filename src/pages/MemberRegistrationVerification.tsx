import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, Notice } from "../components/ui";
import { api, ApiError, configuredMode } from "../lib/api";

export default function MemberRegistrationVerification() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const email = (params.get("email") || "").trim();
  const deadline = location.state?.expiresAtEpochMs;
  const storedDeadlineValue = email ? sessionStorage.getItem(`otp-deadline:${email}`) : null;
  const storedDeadline =
    storedDeadlineValue !== null && Number.isFinite(Number(storedDeadlineValue))
      ? Number(storedDeadlineValue)
      : null;
  const expiresAt =
    typeof deadline === "number" && Number.isFinite(deadline)
      ? deadline
      : storedDeadline;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const [expiredOnServer, setExpiredOnServer] = useState(false);
  const secondsLeft = expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const expired = expiredOnServer || secondsLeft === 0;

  useEffect(() => {
    if (expiresAt === null) return;
    if (expiresAt > Date.now()) {
      sessionStorage.setItem(`otp-deadline:${email}`, String(expiresAt));
    } else {
      sessionStorage.removeItem(`otp-deadline:${email}`);
    }
  }, [email, expiresAt]);

  useEffect(() => {
    if (expiresAt === null || expired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, expired]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || expired || code.length !== 6) return;
    const currentTime = Date.now();
    if (expiresAt !== null && currentTime >= expiresAt) {
      setNow(currentTime);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (configuredMode !== "api") throw new Error("Xác minh email cần kết nối backend.");
      await api.verifyMemberRegistration(email, code);
      sessionStorage.removeItem(`otp-deadline:${email}`);
      navigate("/login", { replace: true, state: { registrationComplete: true } });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 410) {
        setExpiredOnServer(true);
        setCode("");
      } else if (cause instanceof ApiError && cause.status === 404) {
        setError("Yêu cầu đăng ký không còn hiệu lực. Vui lòng quay lại đăng ký.");
      } else {
        setError(cause instanceof Error ? cause.message : "Không thể xác minh mã.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    try {
      if (configuredMode !== "api") throw new Error("Gửi mã xác minh cần kết nối backend.");
      const delivery = await api.resendMemberRegistrationCode(email);
      setCode("");
      setExpiredOnServer(false);
      setNow(Date.now());
      sessionStorage.setItem(`otp-deadline:${email}`, String(delivery.expiresAtEpochMs));
      navigate(location.pathname + location.search, {
        replace: true,
        state: { expiresAtEpochMs: delivery.expiresAtEpochMs },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gửi lại mã.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-form-section">
        <div className="auth-form-content">
          <span className="eyebrow">SPORTIVA</span>
          <h1>Xác minh email</h1>
          {email ? (
            <>
              <p>Nhập mã 6 chữ số được gửi đến <strong>{email}</strong>.</p>
              {expired ? (
                <div role="alert">
                  <Notice tone="warning">
                    Mã xác minh đã hết hạn. Hãy bấm <strong>Gửi lại mã</strong> để nhận mã mới.
                  </Notice>
                </div>
              ) : (
                <Notice>
                  {secondsLeft === null ? "Mã có hiệu lực trong 1 phút." : `Mã hết hạn sau ${secondsLeft} giây.`}
                </Notice>
              )}
              {error && <p role="alert" className="form-error">{error}</p>}
              <form onSubmit={verify}>
                <Field label="Mã xác minh">
                  <input
                    aria-label="Mã xác minh"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    disabled={expired}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </Field>
                <Button type="submit" loading={busy} disabled={expired || code.length !== 6}>
                  Xác minh và tạo tài khoản
                </Button>
              </form>
              <Button
                type="button"
                variant="secondary"
                onClick={resend}
                loading={busy}
                disabled={!expired && secondsLeft !== null}
              >
                Gửi lại mã
              </Button>
            </>
          ) : (
            <Notice>Thiếu địa chỉ email cần xác minh. Hãy quay lại đăng ký để bắt đầu.</Notice>
          )}
          <p><Link to="/register">Quay lại đăng ký</Link>{" · "}<Link to="/login">Quay lại đăng nhập</Link></p>
        </div>
      </section>
    </main>
  );
}
