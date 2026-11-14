import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, Notice } from "../components/ui";
import { api, configuredMode } from "../lib/api";

export default function MemberRegistrationVerification() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = (params.get("email") || "").trim();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    email ? "Nhập mã 6 chữ số đã gửi tới email của bạn. Mã có hiệu lực trong 10 phút." : "",
  );

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (configuredMode !== "api") throw new Error("Xác minh email cần kết nối backend.");
      await api.verifyMemberRegistration(email, code);
      navigate("/login", { replace: true, state: { registrationComplete: true } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể xác minh mã.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (configuredMode !== "api") throw new Error("Gửi mã xác minh cần kết nối backend.");
      const result = await api.resendMemberRegistrationCode(email);
      setMessage((result.message || "Nếu yêu cầu còn hiệu lực, mã xác minh sẽ được gửi tới email.")
        + " Nếu bạn vừa yêu cầu mã, hãy chờ ít nhất 1 phút rồi thử lại.");
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
              <p>Mã được gửi đến <strong>{email}</strong>. Tài khoản chỉ được tạo sau khi mã hợp lệ.</p>
              {message && <Notice>{message}</Notice>}
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
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </Field>
                <Button type="submit" loading={busy} disabled={code.length !== 6}>
                  Xác minh và tạo tài khoản
                </Button>
              </form>
              <Button type="button" variant="secondary" onClick={resend} loading={busy}>
                Gửi lại mã
              </Button>
            </>
          ) : (
            <>
              <Notice>Thiếu địa chỉ email cần xác minh. Hãy quay lại đăng ký để bắt đầu.</Notice>
              <p><Link to="/register">Quay lại đăng ký</Link></p>
            </>
          )}
          <p><Link to="/login">Quay lại đăng nhập</Link></p>
        </div>
      </section>
    </main>
  );
}
