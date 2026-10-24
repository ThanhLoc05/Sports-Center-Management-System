import { Component, lazy, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import type { Role } from "./lib/types";
import Layout, { Forbidden, NotFound } from "./components/Layout";
import { Button, Loading } from "./components/ui";
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
export function Protected({ roles }: { roles?: Role[] }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(session.user.roleName)) return <Forbidden />;
  return <Outlet />;
}
export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Auth />} />
          <Route path="/register" element={<Auth register />} />
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
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Do not log user data or API payloads. */
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
