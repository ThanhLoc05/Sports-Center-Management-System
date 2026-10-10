import { useNavigate } from "react-router-dom";
import "./MemberPage.css";

function MemberPage() {
  const navigate = useNavigate();

  // =========================================================
  // MOCK MEMBER INFORMATION
  // Dữ liệu hiện đang hard-code để dựng giao diện Frontend.
  // Sau này Backend sẽ trả thông tin Member từ API.
  // =========================================================
  const memberName = "Duy";
  const memberEmail = "member@gmail.com";

  // =========================================================
  // HANDLE LOGOUT
  // Xóa role hiện tại khỏi sessionStorage rồi quay về Login.
  // =========================================================
  const handleLogout = () => {
    sessionStorage.removeItem("userRole");
    navigate("/login");
  };

  return (
    <div className="member-page">

      {/* =====================================================
          SIDEBAR
          Navigation dành cho Member.
      ====================================================== */}
      <aside className="member-sidebar">

        {/* ================= BRAND ================= */}
        <div className="member-brand">

          <div className="member-brand-icon">
            S
          </div>

          <div className="member-brand-text">
            <strong>SPORTS CENTER</strong>
            <span>Member Portal</span>
          </div>

        </div>


        {/* ================= NAVIGATION ================= */}
        <nav className="member-navigation">

          <button className="member-nav-item active">
            <span className="member-nav-icon">⌂</span>
            <span>Dashboard</span>
          </button>

          <button className="member-nav-item">
            <span className="member-nav-icon">◷</span>
            <span>My Schedule</span>
          </button>

          <button className="member-nav-item">
            <span className="member-nav-icon">▦</span>
            <span>Classes</span>
          </button>

          <button className="member-nav-item">
            <span className="member-nav-icon">▤</span>
            <span>Membership</span>
          </button>

          <button className="member-nav-item">
            <span className="member-nav-icon">♢</span>
            <span>My Workout</span>
          </button>

          <button className="member-nav-item">
            <span className="member-nav-icon">✓</span>
            <span>Attendance</span>
          </button>

          <button className="member-nav-item">
            <span className="member-nav-icon">♙</span>
            <span>Profile</span>
          </button>

        </nav>


        {/* ================= SIDEBAR FOOTER ================= */}
        <div className="member-sidebar-footer">

          <button
            className="member-logout-button"
            onClick={handleLogout}
          >
            <span className="member-nav-icon">↪</span>
            <span>Logout</span>
          </button>

        </div>

      </aside>


      {/* =====================================================
          MAIN CONTENT
      ====================================================== */}
      <main className="member-main">

        {/* ================= HEADER ================= */}
        <header className="member-header">

          <div className="member-header-title">
            <span>SPORTS CENTER</span>
            <h1>Dashboard</h1>
          </div>


          {/* MEMBER PROFILE */}
          <div className="member-profile">

            <div className="member-profile-avatar">
              D
            </div>

            <div className="member-profile-info">
              <strong>{memberName}</strong>
              <span>{memberEmail}</span>
            </div>

            <span className="member-profile-arrow">
              ▾
            </span>

          </div>

        </header>


        {/* ================= CONTENT ================= */}
        <section className="member-content">

          {/* =================================================
              WELCOME
          ================================================== */}
          <div className="member-welcome">

            <div>
              <p className="member-welcome-label">
                MEMBER PORTAL
              </p>

              <h2>
                Welcome back, {memberName}!
              </h2>

              <p>
                Theo dõi lịch tập và tiến trình luyện tập của bạn.
              </p>
            </div>

            <div className="member-motivation">
              <span>KEEP GOING</span>
              <strong>Train Stronger.</strong>
            </div>

          </div>


          {/* =================================================
              MEMBERSHIP CARD
              Đây là thông tin quan trọng nhất đối với Member.
          ================================================== */}
          <div className="member-membership-card">

            <div className="member-membership-left">

              <div className="member-membership-icon">
                S
              </div>

              <div>
                <span className="member-membership-label">
                  CURRENT MEMBERSHIP
                </span>

                <h3>
                  Premium Membership
                </h3>

                <p>
                  Full access to classes and training facilities
                </p>
              </div>

            </div>


            <div className="member-membership-right">

              <span>
                Valid until
              </span>

              <strong>
                30 Dec 2026
              </strong>

              <div className="member-membership-progress">
                <div></div>
              </div>

              <small>
                103 days remaining
              </small>

            </div>

          </div>


          {/* =================================================
              STAT CARDS
          ================================================== */}
          <div className="member-stat-grid">

            {/* UPCOMING CLASSES */}
            <div className="member-stat-card">

              <div className="member-stat-top">

                <div className="member-stat-icon">
                  ◷
                </div>

                <span className="member-stat-badge">
                  This week
                </span>

              </div>

              <span className="member-stat-label">
                Upcoming Classes
              </span>

              <strong className="member-stat-value">
                4
              </strong>

              <span className="member-stat-description">
                Classes scheduled
              </span>

            </div>


            {/* ATTENDANCE */}
            <div className="member-stat-card">

              <div className="member-stat-top">

                <div className="member-stat-icon">
                  ✓
                </div>

                <span className="member-stat-badge">
                  +5%
                </span>

              </div>

              <span className="member-stat-label">
                Monthly Attendance
              </span>

              <strong className="member-stat-value">
                87%
              </strong>

              <span className="member-stat-description">
                13 of 15 sessions
              </span>

            </div>


            {/* WORKOUT PROGRESS */}
            <div className="member-stat-card">

              <div className="member-stat-top">

                <div className="member-stat-icon">
                  ♢
                </div>

                <span className="member-stat-badge">
                  Good
                </span>

              </div>

              <span className="member-stat-label">
                Workout Progress
              </span>

              <strong className="member-stat-value">
                72%
              </strong>

              <span className="member-stat-description">
                Current training goal
              </span>

            </div>

          </div>


          {/* =================================================
              LOWER GRID
          ================================================== */}
          <div className="member-dashboard-grid">

            {/* ================= UPCOMING CLASSES ================= */}
            <div className="member-panel">

              <div className="member-panel-header">

                <div>
                  <h3>Upcoming Classes</h3>
                  <p>
                    Các lớp học sắp tới của bạn
                  </p>
                </div>

                <button className="member-view-all">
                  View all
                </button>

              </div>


              {/* CLASS 1 */}
              <div className="member-class-card">

                <div className="member-class-date">
                  <strong>18</strong>
                  <span>SEP</span>
                </div>

                <div className="member-class-info">
                  <strong>Morning Yoga</strong>

                  <span>
                    08:00 - 09:00 · Room A
                  </span>

                  <small>
                    Coach Anna
                  </small>
                </div>

                <span className="member-class-status">
                  Booked
                </span>

              </div>


              {/* CLASS 2 */}
              <div className="member-class-card">

                <div className="member-class-date">
                  <strong>19</strong>
                  <span>SEP</span>
                </div>

                <div className="member-class-info">
                  <strong>Strength Training</strong>

                  <span>
                    10:30 - 11:30 · Room B
                  </span>

                  <small>
                    Coach David
                  </small>
                </div>

                <span className="member-class-status">
                  Booked
                </span>

              </div>


              {/* CLASS 3 */}
              <div className="member-class-card">

                <div className="member-class-date">
                  <strong>21</strong>
                  <span>SEP</span>
                </div>

                <div className="member-class-info">
                  <strong>HIIT Workout</strong>

                  <span>
                    18:30 - 19:30 · Room A
                  </span>

                  <small>
                    Coach Sarah
                  </small>
                </div>

                <span className="member-class-status">
                  Booked
                </span>

              </div>

            </div>


            {/* ================= WORKOUT PROGRESS ================= */}
            <div className="member-panel member-progress-panel">

              <div className="member-panel-header">

                <div>
                  <h3>Workout Progress</h3>
                  <p>
                    Tiến trình mục tiêu hiện tại
                  </p>
                </div>

              </div>


              <div className="member-progress-content">

                {/* Circular progress giả lập bằng CSS */}
                <div className="member-progress-circle">

                  <div>
                    <strong>72%</strong>
                    <span>Progress</span>
                  </div>

                </div>


                <div className="member-goal-info">

                  <span>Current goal</span>

                  <strong>
                    Improve Strength
                  </strong>

                  <p>
                    Bạn đang duy trì tiến độ tốt.
                    Hãy tiếp tục lịch tập hiện tại.
                  </p>

                </div>

              </div>


              {/* PROGRESS ITEMS */}
              <div className="member-progress-list">

                <div>
                  <span>Strength</span>

                  <div className="member-mini-progress">
                    <span style={{ width: "78%" }}></span>
                  </div>

                  <strong>78%</strong>
                </div>


                <div>
                  <span>Endurance</span>

                  <div className="member-mini-progress">
                    <span style={{ width: "64%" }}></span>
                  </div>

                  <strong>64%</strong>
                </div>


                <div>
                  <span>Flexibility</span>

                  <div className="member-mini-progress">
                    <span style={{ width: "55%" }}></span>
                  </div>

                  <strong>55%</strong>
                </div>

              </div>

            </div>

          </div>


          {/* =================================================
              RECENT ACTIVITY
          ================================================== */}
          <div className="member-panel member-activity-panel">

            <div className="member-panel-header">

              <div>
                <h3>Recent Activity</h3>
                <p>
                  Hoạt động gần đây của bạn
                </p>
              </div>

            </div>


            <div className="member-activity-list">

              <div className="member-activity-item">

                <div className="member-activity-icon">
                  ✓
                </div>

                <div>
                  <strong>
                    Completed Morning Yoga
                  </strong>

                  <span>
                    Today · 08:00
                  </span>
                </div>

                <small>
                  Completed
                </small>

              </div>


              <div className="member-activity-item">

                <div className="member-activity-icon">
                  ♢
                </div>

                <div>
                  <strong>
                    Workout plan updated
                  </strong>

                  <span>
                    Yesterday · Coach Anna
                  </span>
                </div>

                <small>
                  Updated
                </small>

              </div>


              <div className="member-activity-item">

                <div className="member-activity-icon">
                  ▤
                </div>

                <div>
                  <strong>
                    Membership renewed
                  </strong>

                  <span>
                    10 Sep 2026
                  </span>
                </div>

                <small>
                  Success
                </small>

              </div>

            </div>

          </div>

        </section>

      </main>

    </div>
  );
}

export default MemberPage;