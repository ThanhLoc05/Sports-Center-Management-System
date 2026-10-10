import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./RegisterPage.css";

function RegisterPage() {
  const navigate = useNavigate();

  // ================= FORM STATE =================
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ================= PASSWORD VISIBILITY =================
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ================= UI STATE =================
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // ================= VALIDATION =================
  const [errors, setErrors] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const validateForm = () => {
    const newErrors = {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    };

    // Full name
    if (!fullName.trim()) {
      newErrors.fullName = "Vui lòng nhập họ và tên.";
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = "Họ và tên phải có ít nhất 2 ký tự.";
    }

    // Email
    if (!email.trim()) {
      newErrors.email = "Vui lòng nhập email.";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Email không đúng định dạng.";
    }

    // Phone
    if (!phone.trim()) {
      newErrors.phone = "Vui lòng nhập số điện thoại.";
    } else if (!/^(0|\+84)[0-9]{9,10}$/.test(phone.trim())) {
      newErrors.phone = "Số điện thoại không hợp lệ.";
    }

    // Password
    if (!password) {
      newErrors.password = "Vui lòng nhập mật khẩu.";
    } else if (password.length < 6) {
      newErrors.password =
        "Mật khẩu phải có ít nhất 6 ký tự.";
    }

    // Confirm password
    if (!confirmPassword) {
      newErrors.confirmPassword =
        "Vui lòng xác nhận mật khẩu.";
    } else if (confirmPassword !== password) {
      newErrors.confirmPassword =
        "Mật khẩu xác nhận không khớp.";
    }

    setErrors(newErrors);

    return Object.values(newErrors).every(
      (error) => !error
    );
  };

  // ================= HANDLE REGISTER =================
  const handleSubmit = (e) => {
    e.preventDefault();

    setSuccessMessage("");

    const isValid = validateForm();

    if (!isValid) {
      return;
    }

    /*
      =====================================================
      MOCK REGISTER - DEVELOPMENT ONLY

      Chưa gọi Backend/API.
      Chỉ dùng để Frontend kiểm tra UI và validation.
      =====================================================
    */

    setIsSubmitting(true);

    // Giả lập thời gian xử lý đăng ký
    setTimeout(() => {
      setIsSubmitting(false);

      setSuccessMessage(
        "Đăng ký tài khoản thành công!"
      );

      // Chuyển về Login sau 1.2 giây
      setTimeout(() => {
        navigate("/login");
      }, 1200);
    }, 800);
  };

  // ================= CLEAR FIELD ERROR =================
  const clearError = (field) => {
    setErrors((prevErrors) => ({
      ...prevErrors,
      [field]: "",
    }));

    setSuccessMessage("");
  };

  return (
    <div className="register-page">
      <div className="register-container">

        {/* =================================================
            LEFT SIDE - SPORTS CENTER BANNER
        ================================================== */}
        <div className="register-banner">

          <div className="brand">
            <div className="brand-icon">
              S
            </div>

            <span>
              SPORTS CENTER
            </span>
          </div>

          <div className="banner-content">

            <p className="welcome-text">
              JOIN US TODAY
            </p>

            <h1>
              Start Stronger.
              <br />
              Live Better.
            </h1>

            <p>
              Tạo tài khoản để quản lý lớp học,
              lịch tập và gói thành viên của bạn
              một cách dễ dàng.
            </p>

            <div className="features">
              <span>
                ✓ Quản lý lịch tập
              </span>

              <span>
                ✓ Theo dõi quá trình luyện tập
              </span>

              <span>
                ✓ Quản lý gói thành viên
              </span>
            </div>

          </div>
        </div>

        {/* =================================================
            RIGHT SIDE - REGISTER FORM
        ================================================== */}
        <div className="register-section">

          <div className="register-form-wrapper">

            {/* HEADER */}
            <div className="register-heading">

              <p>
                SPORTS CENTER
              </p>

              <h2>
                Tạo tài khoản
              </h2>

              <span>
                Đăng ký để bắt đầu sử dụng hệ thống
              </span>

            </div>

            {/* SUCCESS MESSAGE */}
            {successMessage && (
              <div className="register-success-message">
                {successMessage}
              </div>
            )}

            {/* FORM */}
            <form
              onSubmit={handleSubmit}
              noValidate
            >

              {/* ================= FULL NAME ================= */}
              <div className="form-group">

                <label htmlFor="fullName">
                  Họ và tên
                </label>

                <input
                  id="fullName"
                  type="text"
                  placeholder="Nhập họ và tên"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    clearError("fullName");
                  }}
                  className={
                    errors.fullName
                      ? "input-error"
                      : ""
                  }
                />

                {errors.fullName && (
                  <p className="error-message">
                    {errors.fullName}
                  </p>
                )}

              </div>

              {/* ================= EMAIL ================= */}
              <div className="form-group">

                <label htmlFor="registerEmail">
                  Email
                </label>

                <input
                  id="registerEmail"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError("email");
                  }}
                  className={
                    errors.email
                      ? "input-error"
                      : ""
                  }
                />

                {errors.email && (
                  <p className="error-message">
                    {errors.email}
                  </p>
                )}

              </div>

              {/* ================= PHONE ================= */}
              <div className="form-group">

                <label htmlFor="phone">
                  Số điện thoại
                </label>

                <input
                  id="phone"
                  type="tel"
                  placeholder="Nhập số điện thoại"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    clearError("phone");
                  }}
                  className={
                    errors.phone
                      ? "input-error"
                      : ""
                  }
                />

                {errors.phone && (
                  <p className="error-message">
                    {errors.phone}
                  </p>
                )}

              </div>

              {/* ================= PASSWORD ================= */}
              <div className="form-group">

                <label htmlFor="registerPassword">
                  Mật khẩu
                </label>

                <div className="password-input-wrapper">

                  <input
                    id="registerPassword"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearError("password");
                    }}
                    className={
                      errors.password
                        ? "input-error"
                        : ""
                    }
                  />

                  <button
                    type="button"
                    className="show-password-button"
                    onClick={() =>
                      setShowPassword(
                        !showPassword
                      )
                    }
                  >
                    {showPassword
                      ? "Ẩn"
                      : "Hiện"}
                  </button>

                </div>

                {errors.password && (
                  <p className="error-message">
                    {errors.password}
                  </p>
                )}

              </div>

              {/* ================= CONFIRM PASSWORD ================= */}
              <div className="form-group">

                <label htmlFor="confirmPassword">
                  Xác nhận mật khẩu
                </label>

                <div className="password-input-wrapper">

                  <input
                    id="confirmPassword"
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(
                        e.target.value
                      );
                      clearError(
                        "confirmPassword"
                      );
                    }}
                    className={
                      errors.confirmPassword
                        ? "input-error"
                        : ""
                    }
                  />

                  <button
                    type="button"
                    className="show-password-button"
                    onClick={() =>
                      setShowConfirmPassword(
                        !showConfirmPassword
                      )
                    }
                  >
                    {showConfirmPassword
                      ? "Ẩn"
                      : "Hiện"}
                  </button>

                </div>

                {errors.confirmPassword && (
                  <p className="error-message">
                    {errors.confirmPassword}
                  </p>
                )}

              </div>

              {/* ================= REGISTER BUTTON ================= */}
              <button
                className="register-button"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Đang đăng ký..."
                  : "Đăng ký"}
              </button>

            </form>

            {/* ================= LOGIN LINK ================= */}
            <p className="login-text">
              Đã có tài khoản?{" "}

              <button
                type="button"
                onClick={() => navigate("/login")}
              >
                Đăng nhập
              </button>
            </p>

          </div>
        </div>

      </div>
    </div>
  );
}

export default RegisterPage;