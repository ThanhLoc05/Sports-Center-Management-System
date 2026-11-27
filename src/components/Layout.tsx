// [VAI TRÒ] Khung trang: menu bên trái lọc theo vai trò (Lễ tân/Member), chuông thông báo, menu tài khoản.
/**
 * KHUNG GIAO DIỆN CHUNG SAU ĐĂNG NHẬP: sidebar, thanh công cụ và vùng trang con.
 * Menu lọc theo vai trò, Outlet hiển thị màn tương ứng URL. Tìm kiếm ở đây dựa trên
 * dữ liệu users/classes đã tải; không phải API tìm kiếm toàn database.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryFilters } from "@tanstack/react-query";
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
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import "../styles-training.css";
import { useAuth } from "../lib/auth";
import { useCourseFeature } from "../lib/course-feature";
import { isStaff, roleLabels } from "../lib/types";
import type { Role } from "../lib/types";
import { readDemo } from "../lib/demo";
import { useClasses, useUsers, useDemoData } from "../lib/hooks";
import { routeAllowed } from "../lib/permissions";
import { markNotificationsRead } from "../lib/center";
import { dateLabel, localDate, matches } from "../lib/utils";
import { Avatar, Empty, Modal, Notice, SearchInput, useToast } from "./ui";
import {
  clearReceivedNotifications,
  notificationsApi,
  recordReceivedNotification,
  setNotificationStreamStatus,
} from "../lib/notifications-api";
interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}
const courseRoutes = new Set(["/courses", "/course-orders", "/my-courses"]);
const classTabs = [
  { to: "/classes", label: "Buổi tập theo gói" },
  { to: "/courses", label: "Khóa học" },
];
const bookingTabs = [
  { to: "/session-bookings", label: "Buổi đã đặt" },
  { to: "/course-orders", label: "Đơn khóa học" },
];
const myClassTabs = [
  { to: "/classes", label: "Buổi đã đặt" },
  { to: "/my-courses", label: "Khóa học đã mua" },
];
const enrollmentTabs = [
  { to: "/sessions", label: "Buổi tập theo gói" },
  { to: "/courses", label: "Khóa học chuyên sâu" },
];
const all: Role[] = [
  "CENTER_MANAGER",
  "MANAGER",
  "COACH",
  "MEMBER",
  "RECEPTIONIST",
];
const staff: Role[] = ["CENTER_MANAGER", "MANAGER", "RECEPTIONIST"];
function waitForNotificationRetry(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 2000);
    signal.addEventListener("abort", finish, { once: true });
  });
}
/**
 * Khai báo nhãn, đường dẫn và vai trò nhìn thấy từng mục menu. App.tsx có
 * route guard độc lập để vẫn kiểm tra quyền nếu người dùng tự nhập đường dẫn.
 */
const navigation: { label: string; items: NavItem[] }[] = [
  {
    label: "KHÔNG GIAN LÀM VIỆC",
    items: [
      { to: "/", label: "Tổng quan", icon: LayoutDashboard, roles: all },
      { to: "/feedback", label: "Đánh giá", icon: MessageCircle, roles: ["MEMBER", "COACH", "RECEPTIONIST", "CENTER_MANAGER"] },
      { to: "/members", label: "Thành viên", icon: Users, roles: staff },
      {
        to: "/packages",
        label: "Danh mục gói tập",
        icon: CreditCard,
        roles: ["CENTER_MANAGER", "MANAGER"],
      },
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
      {
        to: "/bookings",
        label: "Đăng ký lớp",
        icon: Ticket,
        roles: ["CENTER_MANAGER", "MANAGER", "MEMBER", "RECEPTIONIST"],
      },
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
        to: "/students",
        label: "Học viên phụ trách",
        icon: Users,
        roles: ["CENTER_MANAGER", "MANAGER", "COACH"],
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
        roles: staff.concat("MEMBER"),
      },
      {
        to: "/audit",
        label: "Nhật ký hoạt động",
        icon: ScrollText,
        roles: ["CENTER_MANAGER", "MANAGER"],
      },
      { to: "/settings", label: "Cài đặt", icon: Settings2, roles: all },
      {
        to: "/notifications",
        label: "Thông báo & bài tập",
        icon: Bell,
        roles: all,
      },
    ],
  },
];
export default function Layout() {
  const { session, signOut } = useAuth();
  const { enabled: courseEnabled } = useCourseFeature();
  const client = useQueryClient();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const db = useDemoData();
  const ownNotifications = (db?.notifications || []).filter(
    (n) => n.recipientId === session!.user.id && !n.readAt,
  );
  const [mobile, setMobile] = useState(false);
  const [profile, setProfile] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const location = useLocation();
  // [API] useUsers() (hook trong lib/hooks.ts) → api.users → GET /users
  const users = useUsers();
  const role = session!.user.roleName;
  // [API] useClasses() (hook trong lib/hooks.ts) → api.classes → GET /classes/my-classes | /classes…
  const classes = useClasses({
    enabled: role !== "CENTER_MANAGER" || session!.mode !== "api" || location.pathname !== "/classes" || search,
  });
  const apiMode = session?.mode === "api";
  const apiMember = apiMode && role === "MEMBER";
  const navTarget = (item: NavItem) =>
    apiMode && item.to === "/bookings" ? (apiMember ? "/sessions" : "/session-bookings") : item.to;
  const navVisible = (item: NavItem) =>
    (item.to !== "/bookings" || role !== "COACH") &&
    (routeAllowed(session, item.to, db || undefined) ?? item.roles.includes(role));
  useEffect(() => {
    if (session?.mode !== "api") {
      setNotificationStreamStatus("disconnected");
      clearReceivedNotifications();
      return;
    }

    const controller = new AbortController();
    let active = true;
    clearReceivedNotifications();

    const syncSchedule = () => {
      const { id, roleName } = session.user;
      if (roleName !== "MEMBER" && roleName !== "COACH") return;
      const filters: QueryFilters[] = roleName === "COACH"
        ? [{ queryKey: ["classes", id], exact: true }]
        : [
        { queryKey: ["classes", undefined], exact: true },
        { queryKey: ["bookings", session.user.id] },
        { queryKey: ["memberBookings", session.user.id] },
        {
          queryKey: ["classDetail"],
          predicate: (query) => query.queryKey[2] === session.user.id,
        },
        { queryKey: ["capacity"] },
        { queryKey: ["booking-waitlist", session.user.id] },
        { queryKey: ["booking-conduct", session.user.id] },
        { queryKey: ["classCancellation"] },
      ];
      for (const filter of filters) {
        // Lần tải đầu có thể đã đọc dữ liệu trước sự kiện nhưng chưa trả kết quả.
        void client
          .cancelQueries({
            ...filter,
            fetchStatus: "fetching",
            predicate: (query) =>
              query.state.data === undefined &&
              (filter.predicate?.(query) ?? true),
          })
          .then(() => {
            if (active) return client.invalidateQueries(filter);
          });
      }
    };

    void (async () => {
      let reconnecting = false;
      while (active && !controller.signal.aborted) {
        setNotificationStreamStatus(
          reconnecting ? "reconnecting" : "connecting",
        );
        try {
          // [API] notificationsApi.connect → GET /notifications/stream
          await notificationsApi.connect(
            (event) => {
              if (!active || event.recipientId !== session.user.id) return;
              if (!recordReceivedNotification(event)) return;
              toastRef.current(event.title);
              if (event.kind === "GENERAL" && event.link === "/schedule") {
                syncSchedule();
              } else if (event.kind === "GENERAL" && event.link === "/classes" && session.user.roleName === "MEMBER") {
                void client.invalidateQueries({ queryKey: ["booking-waitlist", session.user.id] });
                void client.invalidateQueries({ queryKey: ["capacity"] });
              }
            },
            controller.signal,
            () => {
              if (!active) return;
              setNotificationStreamStatus("connected");
              // SSE không phát lại thay đổi đã xảy ra trước khi kết nối.
              syncSchedule();
            },
          );
          if (!active || controller.signal.aborted) return;
          throw new Error("Kết nối thông báo đã bị đóng.");
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          const status =
            error && typeof error === "object" && "status" in error
              ? Number(error.status)
              : 0;
          const message =
            error instanceof Error
              ? error.message
              : "Không thể kết nối luồng thông báo.";
          if (status === 401 || status === 403) {
            setNotificationStreamStatus("error", message);
            return;
          }
          reconnecting = true;
          setNotificationStreamStatus("reconnecting", message);
          await waitForNotificationRetry(controller.signal);
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
      clearReceivedNotifications();
      setNotificationStreamStatus("disconnected");
    };
  }, [client, session?.mode, session?.token, session?.user.id, session?.user.roleName]);
  /**
   * Mỗi lần chuyển trang, đóng menu tạm và cuộn lên đầu để giao diện mobile
   * không che nội dung trang mới. Cleanup phím tắt được xử lý ở effect tiếp theo.
   */
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
  const onClassPage = classTabs.some((tab) => tab.to === location.pathname) ||
    location.pathname === "/sessions";
  const onBookingPage = bookingTabs.some((tab) => tab.to === location.pathname);
  const inMyClasses = apiMember && myClassTabs.some((tab) => tab.to === location.pathname);
  const inEnrollment = apiMember && enrollmentTabs.some((tab) => tab.to === location.pathname);
  const tabGroup = inMyClasses
    ? { label: "Các mục lớp học của tôi", tabs: myClassTabs }
    : inEnrollment
      ? { label: "Các mục đăng ký lớp", tabs: enrollmentTabs }
      : apiMode && !apiMember && onClassPage
        ? { label: "Các mục lớp học", tabs: classTabs }
        : apiMode && onBookingPage && role !== "COACH"
          ? { label: "Các mục đăng ký lớp", tabs: bookingTabs }
          : null;
  const currentPath = inMyClasses ? "/classes"
    : inEnrollment ? "/bookings"
    : apiMode && onClassPage ? "/classes"
    : apiMode && onBookingPage ? "/bookings"
    : location.pathname;
  const currentItem = navigation.flatMap((group) => group.items)
    .find((item) => item.to === currentPath);
  const current = location.pathname === "/classes/weekly-template" ? "Lịch tuần mẫu"
    : currentPath === "/bookings" && role === "COACH" ? "Học viên đăng ký"
    : currentItem?.label ?? "Hồ sơ cá nhân";
  /**
   * Thông báo gói sắp hết hạn được tổng hợp từ dữ liệu DEMO trong 7 ngày tới.
   * Ở API mode chưa có nguồn thông báo này nên không hiển thị dữ liệu minh họa.
   */
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
            const items = group.items.filter(navVisible);
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group.label}>
                <p>{group.label}</p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={navTarget(item)}
                    end={item.to === "/"}
                    className={`nav-item ${item.to === currentPath ? "active" : ""}`}
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
            {/* [NÚT] NÚT "Khám phá hướng dẫn" → mở/đóng hộp thoại hoặc form (setHelp) */}
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
            {/* [NÚT] NÚT "Mở điều hướng" → mở/đóng hộp thoại hoặc form (setMobile) */}
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
            {/* [NÚT] NÚT "Tìm kiếm toàn hệ thống" → mở/đóng hộp thoại hoặc form (setSearch) */}
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
            {/* [NÚT] NÚT "Hướng dẫn sử dụng" → mở/đóng hộp thoại hoặc form (setHelp) */}
            <button
              className="icon-btn"
              aria-label="Hướng dẫn sử dụng"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            {/* [NÚT] NÚT "Thông báo" → đổi cách hiển thị / bộ lọc trên màn hình (setNotifications) */}
            <button
              className="icon-btn notification-trigger"
              aria-label="Thông báo"
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
              {expiring.length + ownNotifications.length > 0 && <span />}
            </button>
            <div className="profile-area">
              {/* [NÚT] NÚT "Mở menu tài khoản" → đổi cách hiển thị / bộ lọc trên màn hình (setProfile) */}
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

                    {/* [NÚT] NÚT "Đăng xuất" → chạy hàm signOut() */}
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
          {tabGroup && (
            <nav className="training-tabs" aria-label={tabGroup.label}>
              {tabGroup.tabs
                .filter((tab) => (courseEnabled || !courseRoutes.has(tab.to)) &&
                  routeAllowed(session, tab.to, db || undefined) !== false)
                .map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    end
                    className={tab.to === "/classes" && location.pathname === "/sessions" ? "active" : undefined}
                  >
                    {tab.label}
                  </NavLink>
                ))}
            </nav>
          )}
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
                .filter((i) => navVisible(i) && matches(query, i.label))
                .slice(0, 5)
                .map((i) => (
                  <Link to={navTarget(i)} key={i.to} onClick={() => setSearch(false)}>
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
                  ?.filter((c) => !c.regularClassId && (courseEnabled || !c.courseId) && matches(query, c.className))
                  .slice(0, 4)
                  .map((c) => (
                    <Link
                      key={`c${c.id}`}
                      to={c.courseId ? "/courses" : `${apiMember ? "/sessions" : "/classes"}?q=${encodeURIComponent(c.className)}`}
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
            <Link to="/notifications" onClick={() => setNotifications(false)}>
              Xem tất cả thông báo & bài tập <ArrowUpRight size={16} />
            </Link>
            {ownNotifications.slice(0, 5).map((n) => (
              <Link
                key={n.id}
                to={n.link}
                onClick={() => {
                  markNotificationsRead(n.id);
                  setNotifications(false);
                }}
              >
                <span className="notification-icon">
                  <Bell size={18} />
                </span>
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.content}</p>
                </div>
              </Link>
            ))}
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
                title="Nhắc hạn gói tập"
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
/**
 * Trang cho URL không tồn tại; khác Forbidden là URL có thật nhưng không đủ quyền.
 */
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
/**
 * Thông báo không được vào trang theo quyền frontend; không tự đổi vai trò
 * hay đăng xuất chỉ vì người dùng đi nhầm một trang.
 */
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
