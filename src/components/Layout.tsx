import { useEffect, useState } from "react";
import {
  Activity,
  DoorOpen,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  UserRoundCog,
  ArrowUpRight,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isStaff, roleLabels } from "../lib/types";
import type { Role } from "../lib/types";
import { demoSession, readDemo } from "../lib/demo";
import { useClasses, useUsers } from "../lib/hooks";
import { dateLabel, localDate, matches } from "../lib/utils";
import { Avatar, Empty, Modal, Notice, SearchInput } from "./ui";
interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}
const all: Role[] = [
  "CENTER_MANAGER",
  "MANAGER",
  "COACH",
  "MEMBER",
  "RECEPTIONIST",
];
const staff: Role[] = ["CENTER_MANAGER", "MANAGER", "RECEPTIONIST"];
const navigation: { label: string; items: NavItem[] }[] = [
  {
    label: "KHÔNG GIAN LÀM VIỆC",
    items: [
      { to: "/", label: "Tổng quan", icon: LayoutDashboard, roles: all },
      { to: "/members", label: "Thành viên", icon: Users, roles: staff },
      {
        to: "/facilities",
        label: "Bộ môn & phòng tập",
        icon: DoorOpen,
        roles: ["CENTER_MANAGER", "MANAGER"],
      },
      {
        to: "/team",
        label: "Đội ngũ",
        icon: UserRoundCog,
        roles: ["CENTER_MANAGER", "MANAGER"],
      },
      { to: "/classes", label: "Lớp học", icon: Dumbbell, roles: all },
      {
        to: "/schedule",
        label: "Lịch hoạt động",
        icon: CalendarDays,
        roles: all,
      },
      { to: "/bookings", label: "Đăng ký lớp", icon: Ticket, roles: all },
    ],
  },
  {
    label: "VẬN HÀNH & TẬP LUYỆN",
    items: [
      {
        to: "/memberships",
        label: "Gói thành viên",
        icon: CreditCard,
        roles: staff.concat("MEMBER"),
      },
      {
        to: "/attendance",
        label: "Điểm danh",
        icon: ClipboardCheck,
        roles: all,
      },
      {
        to: "/payments",
        label: "Thanh toán",
        icon: CreditCard,
        roles: staff.concat("MEMBER"),
      },
      {
        to: "/reports",
        label: "Báo cáo",
        icon: ChartNoAxesCombined,
        roles: ["CENTER_MANAGER", "MANAGER"],
      },
      {
        to: "/training",
        label: "Kế hoạch tập luyện",
        icon: Activity,
        roles: ["CENTER_MANAGER", "MANAGER", "COACH", "MEMBER"],
      },
      {
        to: "/assistant",
        label: "Trợ lý tập luyện",
        icon: Sparkles,
        roles: all,
      },
    ],
  },
  {
    label: "TRUNG TÂM",
    items: [
      {
        to: "/support",
        label: "Yêu cầu hỗ trợ",
        icon: MessageCircle,
        roles: all,
      },
      {
        to: "/audit",
        label: "Nhật ký hoạt động",
        icon: ScrollText,
        roles: ["CENTER_MANAGER", "MANAGER"],
      },
      { to: "/settings", label: "Cài đặt", icon: Settings2, roles: all },
    ],
  },
];
export default function Layout() {
  const { session, signOut, signIn } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [profile, setProfile] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const users = useUsers();
  const classes = useClasses();
  const role = session!.user.roleName;
  useEffect(() => {
    setMobile(false);
    setProfile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
      if (e.key === "Escape") {
        setProfile(false);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const current =
    navigation.flatMap((g) => g.items).find((i) => i.to === location.pathname)
      ?.label || "Hồ sơ cá nhân";
  const expiring =
    session!.mode === "demo"
      ? readDemo().subscriptions.filter(
          (s) =>
            s.status === "ACTIVE" &&
            s.endDate >= localDate() &&
            s.endDate <= localDate(new Date(Date.now() + 7 * 86400000)) &&
            (isStaff(role) || s.memberId === session!.user.id),
        )
      : [];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      {mobile && (
        <div className="sidebar-backdrop" onClick={() => setMobile(false)} />
      )}
      <aside
        id="main-sidebar"
        className={`sidebar ${mobile ? "sidebar-open" : ""}`}
      >
        <Link to="/" className="brand">
          <span className="brand-symbol">
            <Activity size={25} />
          </span>
          sportiva<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-card">
          <span className="workspace-icon">
            <Dumbbell size={18} />
          </span>
          <div>
            <strong>Sportiva Center</strong>
            <small>Không gian của chuyển động</small>
          </div>
          <ShieldCheck size={16} />
        </div>
        <nav aria-label="Điều hướng chính">
          {navigation.map((group) => {
            const items = group.items.filter((i) => i.roles.includes(role));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group.label}>
                <p>{group.label}</p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <item.icon size={18} strokeWidth={1.7} />
                    <span>{item.label}</span>
                    {item.to === "/assistant" && (
                      <span className="nav-new">BETA</span>
                    )}
                    {item.to === "/members" && session!.mode === "demo" && (
                      <span className="nav-count">
                        {users.data?.filter((u) => u.roleName === "MEMBER")
                          .length || 0}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span className="help-icon">
              <Sparkles size={19} />
            </span>
            <h4>Một chút hỗ trợ?</h4>
            <p>Mọi thứ bạn cần cho một ngày vận hành suôn sẻ.</p>
            <button onClick={() => setHelp(true)}>
              Khám phá hướng dẫn
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="sidebar-signature">
            <span className="status-dot" />{" "}
            {session!.mode === "demo"
              ? "Chế độ demo local"
              : "Chế độ API backend"}
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Mở điều hướng"
              aria-expanded={mobile}
              aria-controls="main-sidebar"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span className="desktop-only">Không gian làm việc</span>
            <ChevronRight size={14} className="desktop-only" />
            <strong>{current}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="global-search"
              onClick={() => setSearch(true)}
              aria-label="Tìm kiếm toàn hệ thống"
            >
              <Search size={17} />
              <span>Tìm kiếm nhanh...</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="topbar-divider" />
            <button
              className="icon-btn"
              aria-label="Hướng dẫn sử dụng"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="icon-btn notification-trigger"
              aria-label="Thông báo"
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
              {expiring.length > 0 && <span />}
            </button>
            <div className="profile-area">
              <button
                className="profile-trigger"
                aria-label="Mở menu tài khoản"
                aria-expanded={profile}
                onClick={() => setProfile(!profile)}
              >
                <Avatar name={session!.user.fullName} size="small" />
                <ChevronDown size={13} />
              </button>
              {profile && (
                <>
                  <div
                    className="dropdown-dismiss"
                    onClick={() => setProfile(false)}
                  />
                  <div className="profile-menu">
                    <strong>{session!.user.fullName}</strong>
                    <small>{roleLabels[role]}</small>
                    <Link to="/profile">
                      Hồ sơ cá nhân
                      <ArrowUpRight size={15} />
                    </Link>
                    {session!.mode === "demo" && (
                      <>
                        <span className="dropdown-label">
                          TRẢI NGHIỆM VAI TRÒ
                        </span>
                        {(
                          [
                            "CENTER_MANAGER",
                            "COACH",
                            "MEMBER",
                            "RECEPTIONIST",
                          ] as Role[]
                        ).map((r) => (
                          <button
                            key={r}
                            onClick={() => {
                              signIn(demoSession(r));
                              setProfile(false);
                              navigate("/");
                            }}
                          >
                            {roleLabels[r]}
                            {r === role && <span className="status-dot" />}
                          </button>
                        ))}
                      </>
                    )}
                    <button className="logout" onClick={signOut}>
                      <LogOut size={15} />
                      Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main
          id="main-content"
          className="main-content"
          key={location.pathname}
        >
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} Sportiva Center</span>
          <span>
            Chuyển động mỗi ngày. Tốt hơn mỗi ngày.
            <span className="footer-dot" />
            Giờ Việt Nam (GMT+7)
          </span>
        </footer>
      </div>
      {search && (
        <Modal
          title="Bạn đang tìm gì?"
          description="Tìm trong các mục, thành viên và lớp học bạn có quyền xem."
          onClose={() => setSearch(false)}
        >
          <div className="search-modal-body">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Tên thành viên, lớp học, chức năng..."
            />
            <div className="search-results">
              {navigation
                .flatMap((g) => g.items)
                .filter(
                  (i) => i.roles.includes(role) && matches(query, i.label),
                )
                .slice(0, 5)
                .map((i) => (
                  <Link to={i.to} key={i.to} onClick={() => setSearch(false)}>
                    <i.icon size={18} />
                    <span>{i.label}</span>
                    <ChevronRight size={16} />
                  </Link>
                ))}
              {query &&
                users.data
                  ?.filter((u) => matches(query, u.fullName, u.email, u.phone))
                  .slice(0, 4)
                  .map((u) => (
                    <Link
                      key={`u${u.id}`}
                      to={`/members?q=${encodeURIComponent(u.fullName)}`}
                      onClick={() => setSearch(false)}
                    >
                      <Avatar name={u.fullName} size="small" />
                      <span>
                        {u.fullName}
                        <small>Thành viên · #{u.id}</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </Link>
                  ))}
              {query &&
                classes.data
                  ?.filter((c) => matches(query, c.className))
                  .slice(0, 4)
                  .map((c) => (
                    <Link
                      key={`c${c.id}`}
                      to={`/classes?q=${encodeURIComponent(c.className)}`}
                      onClick={() => setSearch(false)}
                    >
                      <Dumbbell size={19} />
                      <span>{c.className}</span>
                      <ArrowUpRight size={16} />
                    </Link>
                  ))}
            </div>
          </div>
        </Modal>
      )}
      {notifications && (
        <Modal
          title="Thông báo"
          description="Những cập nhật cần bạn chú ý."
          onClose={() => setNotifications(false)}
        >
          <div className="notification-list">
            {session!.mode === "api" ? (
              <Notice>
                Backend chưa có API thông báo. Các cập nhật realtime sẽ được kết
                nối khi endpoint sẵn sàng.
              </Notice>
            ) : expiring.length ? (
              expiring.map((s) => (
                <Link
                  key={s.id}
                  to="/memberships"
                  onClick={() => setNotifications(false)}
                >
                  <span className="notification-icon">
                    <CreditCard size={18} />
                  </span>
                  <div>
                    <strong>Gói tập sắp hết hạn</strong>
                    <p>
                      {users.data?.find((u) => u.id === s.memberId)?.fullName ||
                        `Thành viên #${s.memberId}`}{" "}
                      · hết hạn {dateLabel(s.endDate)}
                    </p>
                  </div>
                  <ChevronRight size={17} />
                </Link>
              ))
            ) : (
              <Empty
                title="Bạn đã cập nhật tất cả"
                description="Hiện chưa có gói tập nào sắp hết hạn trong 7 ngày tới."
              />
            )}
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="Làm quen với Sportiva"
          description="Một vài bước để bắt đầu ngày làm việc."
          onClose={() => setHelp(false)}
        >
          <div className="help-content">
            <div>
              <Users />
              <h3>01 · Kết nối thành viên</h3>
              <p>
                Thêm thành viên, xem thông tin gói tập và hỗ trợ gia hạn trong
                mục Thành viên.
              </p>
            </div>
            <div>
              <CalendarDays />
              <h3>02 · Sắp xếp lịch tập</h3>
              <p>
                Tạo lớp, phân công huấn luyện viên và xem lịch trong cùng một
                không gian.
              </p>
            </div>
            <div>
              <CreditCard />
              <h3>03 · Theo dõi vận hành</h3>
              <p>
                Điểm danh, lập hóa đơn và xem báo cáo doanh thu theo khoảng thời
                gian.
              </p>
            </div>
            <Notice>
              {session!.mode === "demo"
                ? "Bạn đang dùng dữ liệu demo lưu trên trình duyệt. Đổi vai trò ở ảnh đại diện; khôi phục dữ liệu trong Cài đặt."
                : "Đang kết nối API thực. Mỗi thao tác chỉ thành công khi backend xác nhận."}
            </Notice>
            <p className="muted">
              Chi tiết tích hợp và các hạn chế backend: xem tài liệu
              docs/AUDIT.md trong project.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function NotFound() {
  return (
    <div className="not-found">
      <span>404</span>
      <h1>Trang này đã đi tập rồi.</h1>
      <p>Đường dẫn không tồn tại hoặc đã được thay đổi.</p>
      <Link className="btn btn-primary" to="/">
        Về trang tổng quan
        <ArrowUpRight size={17} />
      </Link>
    </div>
  );
}
export function Forbidden() {
  return (
    <div className="not-found">
      <ShieldCheck size={48} />
      <h1>Không có quyền truy cập</h1>
      <p>Chức năng này dành cho vai trò khác trong trung tâm.</p>
      <Link className="btn btn-primary" to="/">
        Về trang tổng quan
      </Link>
    </div>
  );
}
