import { useState } from "react";

import { useNavigate } from "react-router-dom";

import "./LoginPage.css";

function LoginPage() {
  // =========================================================
  // ROUTER
  // Dùng để chuyển trang sau khi đăng nhập thành công
  // =========================================================
  const navigate = useNavigate();

  // =========================================================
  // FORM STATE
  // Lưu dữ liệu người dùng nhập
  // =========================================================
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // =========================================================
  // PASSWORD VISIBILITY
  // false = ẩn mật khẩu
  // true  = hiện mật khẩu
  // =========================================================
  const [showPassword, setShowPassword] = useState(false);

  // =========================================================
  // VALIDATION STATE
  // Lưu lỗi của Email và Password
  // =========================================================
  const [errors, setErrors] = useState({
    email: "",
    password: "",
    login: "",
  });

  // =========================================================
  // VALIDATE FORM
  // Kiểm tra dữ liệu trước khi thực hiện Login
  // =========================================================
  const validateForm = () => {
    const newErrors = {
      email: "",
      password: "",
      login: "",
    };

    // -------------------------
    // Validate Email
    // -------------------------
    if (!email.trim()) {
      newErrors.email = "Vui lòng nhập email.";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Email không đúng định dạng.";
    }

    // -------------------------
    // Validate Password
    // -------------------------
    if (!password) {
      newErrors.password = "Vui lòng nhập mật khẩu.";
    } else if (password.length < 6) {
      newErrors.password =
        "Mật khẩu phải có ít nhất 6 ký tự.";
    }

    // Cập nhật lỗi lên giao diện
    setErrors(newErrors);

    // Form hợp lệ khi không có lỗi Email và Password
    return !newErrors.email && !newErrors.password;
  };

  // =========================================================
  // HANDLE LOGIN
  // Chạy khi người dùng bấm nút "Đăng nhập"
  // =========================================================
  const handleSubmit = (e) => {
    e.preventDefault();

    // -------------------------
    // BƯỚC 1: Validate Form
    // -------------------------
    const isValid = validateForm();

    if (!isValid) {
      return;
    }

    // =====================================================
    // MOCK LOGIN - DEVELOPMENT ONLY
    //
    // Dùng tạm để Frontend test Login khi Backend
    // Spring Boot chưa cung cấp Login API.
    //
    // KHÔNG phải logic đăng nhập thật.
    //
    // TODO [BE INTEGRATION]:
    // Khi Backend hoàn thành:
    // 1. Gọi API Login
    // 2. Nhận token
    // 3. Nhận role
    // 4. Lưu thông tin authentication
    // 5. Redirect theo role
    // 6. Xóa Mock Login bên dưới
    // =====================================================

    // -------------------------
    // MOCK MEMBER ACCOUNT
    // -------------------------
    // =====================================================
    // MOCK MEMBER LOGIN
    // Tài khoản dùng để FE test khi Backend chưa hoàn thành.
    // =====================================================
    if (
      email === "member@gmail.com" &&
      password === "123456"
    ) {
      // Lưu role tạm thời trong sessionStorage
      // Khi đóng tab/browser session này sẽ bị xóa.
      sessionStorage.setItem("userRole", "MEMBER");

      console.log("Login success - MEMBER");

      // Chuyển Member tới Member Dashboard
      navigate("/member");

      return;
    }

    // =====================================================
    // LOGIN FAILED
    // Email / Password không khớp tài khoản mock
    // =====================================================
    setErrors((prevErrors) => ({
      ...prevErrors,
      login: "Email hoặc mật khẩu không chính xác.",
    }));
  };

  return (
    <div className="login-page">
      <div className="login-container">

        {/* =================================================
            LEFT SIDE - SPORTS CENTER BANNER
        ================================================== */}
        <div className="login-banner">

          {/* BRAND */}
          <div className="brand">
            <div className="brand-icon">
              S
            </div>

            <span>
              SPORTS CENTER
            </span>
          </div>

          {/* BANNER CONTENT */}
          <div className="banner-content">
            <p className="welcome-text">
              WELCOME TO
            </p>

            <h1>
              Train Stronger.
              <br />
              Live Better.
            </h1>

            <p>
              Quản lý lớp học, lịch tập và gói thành viên
              của bạn một cách dễ dàng.
            </p>

            {/* SYSTEM FEATURES */}
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
            RIGHT SIDE - LOGIN FORM
        ================================================== */}
        <div className="login-section">
          <div className="login-form-wrapper">

            {/* LOGIN HEADER */}
            <div className="login-heading">
              <p>
                SPORTS CENTER
              </p>

              <h2>
                Chào mừng trở lại!
              </h2>

              <span>
                Đăng nhập để tiếp tục sử dụng hệ thống
              </span>
            </div>

            {/* =================================================
                LOGIN FORM
            ================================================== */}

            {/* 
              Form bao bọc toàn bộ khu vực nhập Email,
              Password và nút Đăng nhập.

              onSubmit gọi handleSubmit() khi người dùng
              nhấn nút "Đăng nhập" hoặc Enter.

              noValidate tắt validation mặc định của
              trình duyệt để sử dụng validation riêng
              bằng hàm validateForm().
            */}
            <form
              onSubmit={handleSubmit}
              noValidate
            >

              {/* ================= EMAIL ================= */}
              <div className="form-group">
                <label htmlFor="email">
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);

                    // Xóa lỗi Email/Login khi người dùng nhập lại
                    setErrors((prevErrors) => ({
                      ...prevErrors,
                      email: "",
                      login: "",
                    }));
                  }}
                  className={
                    errors.email
                      ? "input-error"
                      : ""
                  }
                />

                {/* EMAIL ERROR */}
                {errors.email && (
                  <p className="error-message">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* ================= PASSWORD ================= */}
              <div className="form-group">
                <div className="password-header">
                  <label htmlFor="password">
                    Mật khẩu
                  </label>

                  <a href="#">
                    Quên mật khẩu?
                  </a>
                </div>

                <div className="password-input-wrapper">
                  <input
                    id="password"

                    // Chuyển giữa password ↔ text
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }

                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);

                      // Xóa lỗi Password/Login khi nhập lại
                      setErrors((prevErrors) => ({
                        ...prevErrors,
                        password: "",
                        login: "",
                      }));
                    }}
                    className={
                      errors.password
                        ? "input-error"
                        : ""
                    }
                  />

                  {/* SHOW / HIDE PASSWORD */}
                  <button
                    type="button"
                    className="show-password-button"
                    onClick={() =>
                      setShowPassword(
                        (prev) => !prev
                      )
                    }
                  >
                    {showPassword
                      ? "Ẩn"
                      : "Hiện"}
                  </button>
                </div>

                {/* PASSWORD ERROR */}
                {errors.password && (
                  <p className="error-message">
                    {errors.password}
                  </p>
                )}
              </div>

              {/* =================================================
                  LOGIN ERROR
                  Hiện khi Email/Password không đúng
              ================================================== */}
              {errors.login && (
                <div className="login-error-message">
                  {errors.login}
                </div>
              )}

              {/* ================= REMEMBER ME ================= */}
              <div className="remember-me">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) =>
                    setRememberMe(
                      e.target.checked
                    )
                  }
                />

                <label htmlFor="remember">
                  Ghi nhớ đăng nhập
                </label>
              </div>

              {/* ================= LOGIN BUTTON ================= */}
              <button
                className="login-button"
                type="submit"
              >
                Đăng nhập
              </button>

            </form>

            {/* ================= REGISTER ================= */}
            <p className="register-text">
              Chưa có tài khoản?{" "}

              <button
                type="button"
                className="register-link-button"
                onClick={() => navigate("/register")}
              >
                Đăng ký ngay
              </button>
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;