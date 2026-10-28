/**
 * BẢN ĐỒ ĐIỀU HƯỚNG VÀ QUYỀN TRUY CẬP CÁC TRANG.
 * Route ánh xạ URL với màn hình; Protected kiểm tra phiên và vai trò trước khi render.
 * Đây là chặn ở giao diện; backend vẫn phải kiểm tra JWT và quyền cho từng API.
 */
import { Component, lazy, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import type { Role } from "./lib/types";
import Layout, { Forbidden, NotFound } from "./components/Layout";
import { Button, Loading } from "./components/ui";
import { useDemoData } from "./lib/hooks";
import { routeAllowed } from "./lib/permissions";
/**
 * Chỉ tải mã của màn hình khi cần truy cập (lazy loading), giảm phần tải ban đầu.
 * Suspense bên dưới hiển thị Loading trong lúc tải các module này.
 */
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Members = lazy(() => import("./pages/Members"));
const Classes = lazy(() => import("./pages/Classes"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Memberships = lazy(() => import("./pages/Memberships"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Payments = lazy(() => import("./pages/Payments"));
const Reports = lazy(() => import("./pages/Reports"));
const Training = lazy(() => import("./pages/Training"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Support = lazy(() => import("./pages/Support"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.Profile })),
);
const Facilities = lazy(() => import("./pages/Facilities"));
const Audit = lazy(() => import("./pages/Audit"));
const Packages = lazy(() =>
  import("./pages/Management").then((m) => ({ default: m.PackagesPage })),
);
const Students = lazy(() =>
  import("./pages/Management").then((m) => ({ default: m.StudentsPage })),
);
const Notifications = lazy(() =>
  import("./pages/Management").then((m) => ({ default: m.NotificationsPage })),
);

/**
 * Chưa đăng nhập: chuyển về /login. Đã đăng nhập nhưng không thuộc roles cho phép:
 * hiện trang không đủ quyền. Hợp lệ: Outlet render route con tương ứng.
 * Ẩn menu riêng không đủ; guard này còn chặn người dùng gõ trực tiếp URL.
 */
export function Protected({ roles }: { roles?: Role[] }) {
  const { session } = useAuth();
  const db = useDemoData();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace />;
  const permitted = routeAllowed(session, location.pathname, db || undefined);
  if (
    permitted !== undefined
      ? !permitted
      : roles && !roles.includes(session.user.roleName)
  )
    return <Forbidden />;
  return <Outlet />;
}
/**
 * Login/register là các trang công khai. Các trang còn lại đi qua Protected và Layout;
 * những nhóm route có roles riêng tiếp tục giới hạn quyền theo nghiệp vụ.
 * MANAGER được giữ như một tên vai trò quản lý tương thích với CENTER_MANAGER.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Auth key="login" />} />
          <Route path="/register" element={<Auth key="register" register />} />
          <Route element={<Protected />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="classes" element={<Classes />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="assistant" element={<Assistant />} />
              <Route path="support" element={<Support />} />
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Profile />} />
              {/* URL cũ chuyển về Đội ngũ, không còn màn chỉnh quyền. */}
              <Route
                path="permissions"
                element={<Navigate to="/team" replace />}
              />
              <Route path="packages" element={<Packages />} />
              <Route path="students" element={<Students />} />
              <Route path="notifications" element={<Notifications />} />

              <Route
                element={
                  <Protected
                    roles={["CENTER_MANAGER", "MANAGER", "RECEPTIONIST"]}
                  />
                }
              >
                <Route path="members" element={<Members />} />
              </Route>
              <Route
                element={<Protected roles={["CENTER_MANAGER", "MANAGER"]} />}
              >
                <Route path="facilities" element={<Facilities />} />
                <Route path="team" element={<Members team />} />
                <Route path="reports" element={<Reports />} />
                <Route path="audit" element={<Audit />} />
              </Route>
              <Route
                element={
                  <Protected
                    roles={[
                      "CENTER_MANAGER",
                      "MANAGER",
                      "RECEPTIONIST",
                      "MEMBER",
                    ]}
                  />
                }
              >
                <Route path="memberships" element={<Memberships />} />
                <Route path="payments" element={<Payments />} />
              </Route>
              <Route
                element={
                  <Protected
                    roles={["CENTER_MANAGER", "MANAGER", "COACH", "MEMBER"]}
                  />
                }
              >
                <Route path="training" element={<Training />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
/**
 * Bắt lỗi trong quá trình render component con để hiển thị trang tải lại.
 * Lỗi gọi API bất đồng bộ được xử lý ở request, form hoặc query; ErrorBoundary
 * không thay thế việc xử lý các lỗi mạng đó.
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Không ghi thông tin người dùng hoặc nội dung API vào log của lỗi giao diện. */
  }
  render() {
    return this.state.failed ? (
      <div className="not-found">
        <h1>Ứng dụng cần tải lại.</h1>
        <p>Dữ liệu đã lưu vẫn được giữ trên trình duyệt.</p>
        <Button onClick={() => window.location.reload()}>Tải lại trang</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
