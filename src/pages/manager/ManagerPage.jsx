import { useNavigate } from "react-router-dom";
import "./ManagerPage.css";

function ManagerPage() {
  const navigate = useNavigate();

  // =========================================================
  // MOCK MANAGER INFORMATION
  // Dữ liệu hiện đang hard-code để Frontend dựng UI.
  // Sau này Backend sẽ trả thông tin Manager từ API.
  // =========================================================
  const managerName = "Center Manager";
  const managerEmail = "manager@gmail.com";

  // =========================================================
  // HANDLE LOGOUT
  // Xóa role đang lưu trong sessionStorage và quay lại Login.
  //
  // Hiện tại đây chỉ là logout Frontend.
  // Sau này khi có Backend/API có thể cần thêm:
  // - Xóa access token
  // - Gọi API logout nếu hệ thống yêu cầu
  // - Clear user information
  // =========================================================
  const handleLogout = () => {
    sessionStorage.removeItem("userRole");
    navigate("/login");
  };

  return (
    <div className="manager-page">

      {/* =====================================================
          SIDEBAR
          Khu vực điều hướng chính dành cho Center Manager.
      ====================================================== */}
      <aside className="manager-sidebar">

        {/* ================= BRAND ================= */}
        <div className="manager-brand">

          {/* Icon chữ S được giữ cùng tinh thần với LoginPage */}
          <div className="manager-brand-icon">
            S
          </div>

          <div className="manager-brand-text">
            <strong>SPORTS CENTER</strong>
            <span>Management System</span>
          </div>

        </div>


        {/* ================= NAVIGATION ================= */}
        <nav className="manager-navigation">

          {/* Dashboard đang là trang hiện tại nên có class active */}
          <button className="manager-nav-item active">
            <span className="manager-nav-icon">⌂</span>
            <span>Dashboard</span>
          </button>

          <button className="manager-nav-item">
            <span className="manager-nav-icon">♙</span>
            <span>Members</span>
          </button>

          <button className="manager-nav-item">
            <span className="manager-nav-icon">♟</span>
            <span>Coaches</span>
          </button>

          <button className="manager-nav-item">
            <span className="manager-nav-icon">▦</span>
            <span>Classes</span>
          </button>

          <button className="manager-nav-item">
            <span className="manager-nav-icon">▤</span>
            <span>Memberships</span>
          </button>

          <button className="manager-nav-item">
            <span className="manager-nav-icon">₫</span>
            <span>Payments</span>
          </button>

          <button className="manager-nav-item">
            <span className="manager-nav-icon">◔</span>
            <span>Reports</span>
          </button>

          <button className="manager-nav-item">
            <span className="manager-nav-icon">⚙</span>
            <span>Settings</span>
          </button>

        </nav>


        {/* ================= SIDEBAR FOOTER ================= */}
        <div className="manager-sidebar-footer">

          {/* Nút logout dùng button thay vì thẻ a
              vì đây là một action chứ không phải navigation */}
          <button
            className="manager-logout-button"
            onClick={handleLogout}
          >
            <span className="manager-nav-icon">↪</span>
            <span>Logout</span>
          </button>

        </div>

      </aside>


      {/* =====================================================
          MAIN CONTENT
          Toàn bộ nội dung Dashboard của Manager.
      ====================================================== */}
      <main className="manager-main">

        {/* ================= TOP HEADER ================= */}
        <header className="manager-header">

          <div className="manager-header-title">
            <span>SPORTS CENTER</span>
            <h1>Dashboard</h1>
          </div>


          {/* Thông tin Manager bên phải Header */}
          <div className="manager-profile">

            <div className="manager-profile-avatar">
              M
            </div>

            <div className="manager-profile-info">
              <strong>{managerName}</strong>
              <span>{managerEmail}</span>
            </div>

            <span className="manager-profile-arrow">
              ▾
            </span>

          </div>

        </header>


        {/* ================= PAGE CONTENT ================= */}
        <section className="manager-content">

          {/* ================= WELCOME ================= */}
          <div className="manager-welcome">

            <div>
              <p className="manager-welcome-label">
                OVERVIEW
              </p>

              <h2>
                Welcome back, Manager!
              </h2>

              <p>
                Đây là tổng quan hoạt động của Sports Center hôm nay.
              </p>
            </div>

            {/* Ngày hiện tại dùng dữ liệu JS để tránh phải
                hard-code ngày khi giao diện được mở lại. */}
            <div className="manager-date">
              <span>Today</span>
              <strong>
                {new Date().toLocaleDateString("vi-VN")}
              </strong>
            </div>

          </div>


          {/* =================================================
              STAT CARDS
              Các chỉ số quan trọng của trung tâm.
          ================================================== */}
          <div className="manager-stat-grid">

            {/* TOTAL MEMBERS */}
            <div className="manager-stat-card">

              <div className="manager-stat-top">
                <div className="manager-stat-icon">
                  ♙
                </div>

                <span className="manager-stat-status">
                  +8.2%
                </span>
              </div>

              <span className="manager-stat-label">
                Total Members
              </span>

              <strong className="manager-stat-value">
                1,248
              </strong>

              <span className="manager-stat-description">
                Compared with last month
              </span>

            </div>


            {/* ACTIVE CLASSES */}
            <div className="manager-stat-card">

              <div className="manager-stat-top">
                <div className="manager-stat-icon">
                  ▦
                </div>

                <span className="manager-stat-status">
                  Active
                </span>
              </div>

              <span className="manager-stat-label">
                Active Classes
              </span>

              <strong className="manager-stat-value">
                24
              </strong>

              <span className="manager-stat-description">
                Classes running this week
              </span>

            </div>


            {/* COACHES */}
            <div className="manager-stat-card">

              <div className="manager-stat-top">
                <div className="manager-stat-icon">
                  ♟
                </div>

                <span className="manager-stat-status">
                  Active
                </span>
              </div>

              <span className="manager-stat-label">
                Coaches
              </span>

              <strong className="manager-stat-value">
                18
              </strong>

              <span className="manager-stat-description">
                Coaches currently working
              </span>

            </div>


            {/* REVENUE */}
            <div className="manager-stat-card">

              <div className="manager-stat-top">
                <div className="manager-stat-icon">
                  ₫
                </div>

                <span className="manager-stat-status">
                  +12.5%
                </span>
              </div>

              <span className="manager-stat-label">
                Monthly Revenue
              </span>

              <strong className="manager-stat-value manager-revenue">
                86.4M
              </strong>

              <span className="manager-stat-description">
                Compared with last month
              </span>

            </div>

          </div>


          {/* =================================================
              DASHBOARD LOWER GRID
              Chia thành Revenue Overview và Today's Classes.
          ================================================== */}
          <div className="manager-dashboard-grid">

            {/* ================= REVENUE ================= */}
            <div className="manager-panel manager-revenue-panel">

              <div className="manager-panel-header">

                <div>
                  <h3>Revenue Overview</h3>
                  <p>
                    Doanh thu trong 6 tháng gần nhất
                  </p>
                </div>

                <button className="manager-period-button">
                  Last 6 months ▾
                </button>

              </div>


              {/* =================================================
                  MOCK CHART
                  Chưa có API nên biểu đồ được dựng bằng CSS.
                  Sau này có thể thay phần này bằng:
                  - Recharts
                  - Chart.js
                  - API data thực tế
              ================================================== */}
              <div className="manager-chart">

                <div className="manager-chart-y-axis">
                  <span>100M</span>
                  <span>75M</span>
                  <span>50M</span>
                  <span>25M</span>
                  <span>0</span>
                </div>

                <div className="manager-chart-area">

                  <div className="manager-chart-lines">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>

                  {/* Mock bars */}
                  <div className="manager-chart-bars">

                    <div className="manager-chart-column">
                      <div
                        className="manager-chart-bar"
                        style={{ height: "48%" }}
                      ></div>
                      <span>Apr</span>
                    </div>

                    <div className="manager-chart-column">
                      <div
                        className="manager-chart-bar"
                        style={{ height: "61%" }}
                      ></div>
                      <span>May</span>
                    </div>

                    <div className="manager-chart-column">
                      <div
                        className="manager-chart-bar"
                        style={{ height: "54%" }}
                      ></div>
                      <span>Jun</span>
                    </div>

                    <div className="manager-chart-column">
                      <div
                        className="manager-chart-bar"
                        style={{ height: "72%" }}
                      ></div>
                      <span>Jul</span>
                    </div>

                    <div className="manager-chart-column">
                      <div
                        className="manager-chart-bar"
                        style={{ height: "67%" }}
                      ></div>
                      <span>Aug</span>
                    </div>

                    <div className="manager-chart-column">
                      <div
                        className="manager-chart-bar current"
                        style={{ height: "84%" }}
                      ></div>
                      <span>Sep</span>
                    </div>

                  </div>

                </div>

              </div>

            </div>


            {/* ================= TODAY'S CLASSES ================= */}
            <div className="manager-panel manager-classes-panel">

              <div className="manager-panel-header">

                <div>
                  <h3>Today's Classes</h3>
                  <p>
                    Lịch học hôm nay
                  </p>
                </div>

                <button className="manager-view-all">
                  View all
                </button>

              </div>


              {/* CLASS 1 */}
              <div className="manager-class-item">

                <div className="manager-class-time">
                  <strong>08:00</strong>
                  <span>09:00</span>
                </div>

                <div className="manager-class-line"></div>

                <div className="manager-class-info">
                  <strong>Morning Yoga</strong>
                  <span>
                    Room A · Coach Anna
                  </span>
                </div>

                <span className="manager-class-count">
                  12/15
                </span>

              </div>


              {/* CLASS 2 */}
              <div className="manager-class-item">

                <div className="manager-class-time">
                  <strong>10:30</strong>
                  <span>11:30</span>
                </div>

                <div className="manager-class-line"></div>

                <div className="manager-class-info">
                  <strong>Strength Training</strong>
                  <span>
                    Room B · Coach David
                  </span>
                </div>

                <span className="manager-class-count">
                  10/12
                </span>

              </div>


              {/* CLASS 3 */}
              <div className="manager-class-item">

                <div className="manager-class-time">
                  <strong>14:00</strong>
                  <span>15:00</span>
                </div>

                <div className="manager-class-line"></div>

                <div className="manager-class-info">
                  <strong>Boxing Basics</strong>
                  <span>
                    Room C · Coach Mike
                  </span>
                </div>

                <span className="manager-class-count">
                  8/10
                </span>

              </div>


              {/* CLASS 4 */}
              <div className="manager-class-item">

                <div className="manager-class-time">
                  <strong>18:30</strong>
                  <span>19:30</span>
                </div>

                <div className="manager-class-line"></div>

                <div className="manager-class-info">
                  <strong>HIIT Workout</strong>
                  <span>
                    Room A · Coach Sarah
                  </span>
                </div>

                <span className="manager-class-count">
                  15/15
                </span>

              </div>

            </div>

          </div>


          {/* =================================================
              QUICK ACTIONS
              Các thao tác thường dùng cho Manager.
          ================================================== */}
          <div className="manager-quick-section">

            <div className="manager-section-title">
              <div>
                <h3>Quick Actions</h3>
                <p>
                  Các thao tác quản lý thường dùng
                </p>
              </div>
            </div>


            <div className="manager-quick-grid">

              <button className="manager-quick-card">
                <span className="manager-quick-icon">+</span>
                <div>
                  <strong>Add Member</strong>
                  <span>Thêm thành viên mới</span>
                </div>
                <span className="manager-quick-arrow">→</span>
              </button>


              <button className="manager-quick-card">
                <span className="manager-quick-icon">+</span>
                <div>
                  <strong>Create Class</strong>
                  <span>Tạo lớp học mới</span>
                </div>
                <span className="manager-quick-arrow">→</span>
              </button>


              <button className="manager-quick-card">
                <span className="manager-quick-icon">▤</span>
                <div>
                  <strong>View Reports</strong>
                  <span>Xem báo cáo trung tâm</span>
                </div>
                <span className="manager-quick-arrow">→</span>
              </button>

            </div>

          </div>

        </section>

      </main>

    </div>
  );
}

export default ManagerPage;