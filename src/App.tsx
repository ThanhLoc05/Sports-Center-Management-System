/** Router xác thực và các phần nghiệp vụ đã hoàn thiện trên main. */
import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Notice, PageHeader, Panel } from "./components/ui";
import { useAuth } from "./lib/auth";
import { isManager, roleLabels } from "./lib/types";
import type { Role } from "./lib/types";
import AuthPage from "./pages/Auth";
import Members from "./pages/Members";
import Classes from "./pages/Classes";
import Schedule from "./pages/Schedule";
import Memberships from "./pages/Memberships";
import { PackagesPage } from "./pages/Packages";
import { Profile } from "./pages/Profile";

/** Kiểm tra cả URL nhập trực tiếp. Backend vẫn phải kiểm tra JWT và quyền tài nguyên. */
export function Protected({ roles }: { roles?: Role[] }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(session.user.roleName)) return <Forbidden />;
  return <Outlet />;
}
function Forbidden() {
  return (
    <div className="main-content">
      <Panel>
        <h1>Không có quyền truy cập</h1>
        <p>Chức năng này dành cho vai trò khác trong trung tâm.</p>
        <Link className="btn btn-secondary" to="/">
          Về không gian làm việc
        </Link>
      </Panel>
    </div>
  );
}
/** Menu chỉ chứa các phần đã đưa lên main; điều kiện hiển thị không thay thế route guard. */
function WorkspaceLayout() {
  const { session, signOut } = useAuth();
  const items = [
    { to: "/", label: "Tổng quan" },
    { to: "/profile", label: "Hồ sơ cá nhân" },
  ];
  if (
    ["CENTER_MANAGER", "MANAGER", "RECEPTIONIST"].includes(
      session!.user.roleName,
    )
  )
    items.push({ to: "/members", label: "Thành viên" });
  if (isManager(session!.user.roleName))
    items.push({ to: "/access", label: "Quyền truy cập" });
  if (session!.user.roleName !== "COACH")
    items.push({ to: "/memberships", label: "Gói thành viên" });
  if (isManager(session!.user.roleName))
    items.push({ to: "/packages", label: "Danh mục gói tập" });
  items.push(
    {
      to: "/classes",
      label:
        session!.user.roleName === "COACH" ? "Lớp học phụ trách" : "Lớp học",
    },
    {
      to: "/schedule",
      label:
        session!.user.roleName === "MEMBER"
          ? "Lịch tập của bạn"
          : "Lịch hoạt động",
    },
  );
  return (
    <Layout
      items={items}
      account={{
        name: session!.user.fullName,
        roleLabel: roleLabels[session!.user.roleName],
      }}
      onSignOut={signOut}
    />
  );
}
function Welcome() {
  const { session } = useAuth();
  const user = session!.user;
  const titles: Record<Role, string> = {
    CENTER_MANAGER: "Không gian quản lý trung tâm",
    MANAGER: "Không gian quản lý trung tâm",
    COACH: "Không gian huấn luyện viên",
    MEMBER: "Không gian thành viên",
    RECEPTIONIST: "Không gian lễ tân",
  };
  return (
    <>
      <PageHeader
        title={titles[user.roleName]}
        description={`Xin chào, ${user.fullName}.`}
      />
      <Panel title="Tài khoản của bạn">
        <p>{user.email}</p>
        <p>{roleLabels[user.roleName]}</p>
      </Panel>
      {session!.mode === "demo" && (
        <Notice>Dữ liệu minh họa trên trình duyệt.</Notice>
      )}
    </>
  );
}
function Access() {
  return (
    <>
      <PageHeader
        title="Quyền truy cập"
        description="Phạm vi truy cập được xác định theo vai trò của tài khoản."
      />
      <Panel title="Các vai trò của trung tâm">
        <ul>
          {(
            ["CENTER_MANAGER", "COACH", "MEMBER", "RECEPTIONIST"] as Role[]
          ).map((role) => (
            <li key={role}>{roleLabels[role]}</li>
          ))}
        </ul>
        <p>Trang này dành cho quản lý trung tâm.</p>
      </Panel>
    </>
  );
}
export default function App() {
  return (
    <Routes>
      {/* Tách phiên form để chuyển đăng ký → đăng nhập không giữ lại giá trị ô nhập cũ. */}
      <Route path="/login" element={<AuthPage key="login" />} />
      <Route path="/register" element={<AuthPage key="register" register />} />
      <Route element={<Protected />}>
        <Route element={<WorkspaceLayout />}>
          <Route index element={<Welcome />} />
          <Route path="profile" element={<Profile />} />
          <Route path="classes" element={<Classes />} />
          <Route path="schedule" element={<Schedule />} />
          <Route
            element={
              <Protected
                roles={["CENTER_MANAGER", "MANAGER", "RECEPTIONIST", "MEMBER"]}
              />
            }
          >
            <Route path="memberships" element={<Memberships />} />
          </Route>
          <Route
            element={
              <Protected
                roles={["CENTER_MANAGER", "MANAGER", "RECEPTIONIST"]}
              />
            }
          >
            <Route path="members" element={<Members />} />
          </Route>
          <Route element={<Protected roles={["CENTER_MANAGER", "MANAGER"]} />}>
            <Route path="/access" element={<Access />} />
            <Route path="packages" element={<PackagesPage />} />
          </Route>
          <Route
            path="*"
            element={
              <Panel title="Không tìm thấy trang">
                <Link to="/">Về tổng quan</Link>
              </Panel>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
