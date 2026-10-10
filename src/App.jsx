import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import RegisterPage from "./pages/auth/RegisterPage";
import LoginPage from "./pages/auth/LoginPage";
import MemberPage from "./pages/member/MemberPage";
import ManagerPage from "./pages/manager/ManagerPage";

import ProtectedRoute from "./components/ProtectedRoute";


function App() {
  return (
    // =========================================================
    // APPLICATION ROUTER
    // Quản lý các route chính của hệ thống Sports Center
    // =========================================================
    <BrowserRouter>
      <Routes>

        {/* =====================================================
            LOGIN ROUTE
            Route công khai - không yêu cầu đăng nhập
        ====================================================== */}
        <Route
          path="/login"
          element={<LoginPage />}
        />
        <Route
          path="/register"
          element={<RegisterPage />}
        />


        {/* =====================================================
            MEMBER PROTECTED ROUTE

            Chỉ user có role MEMBER mới được truy cập.
        ====================================================== */}
        <Route
          path="/member"
          element={
            <ProtectedRoute allowedRole="MEMBER">
              <MemberPage />
            </ProtectedRoute>
          }
        />


        {/* =====================================================
            CENTER MANAGER PROTECTED ROUTE

            Chỉ user có role CENTER_MANAGER mới được truy cập.
        ====================================================== */}
        <Route
          path="/manager"
          element={
            <ProtectedRoute allowedRole="CENTER_MANAGER">
              <ManagerPage />
            </ProtectedRoute>
          }
        />


        {/* =====================================================
            DEFAULT ROUTE

            Khi truy cập "/" → chuyển về Login.
        ====================================================== */}
        <Route
          path="/"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />


        {/* =====================================================
            NOT FOUND

            URL không tồn tại → chuyển về Login.
        ====================================================== */}
        <Route
          path="*"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;