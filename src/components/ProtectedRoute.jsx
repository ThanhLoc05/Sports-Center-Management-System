import { Navigate } from "react-router-dom";

function ProtectedRoute({ children, allowedRole }) {
  // =========================================================
  // MOCK AUTHENTICATION - DEVELOPMENT ONLY
  //
  // Lấy role đã lưu sau khi người dùng đăng nhập.
  //
  // TODO [BE INTEGRATION]:
  // Sau này Authentication thật sẽ sử dụng token/JWT
  // và dữ liệu user do Backend Spring Boot trả về.
  // =========================================================
  const userRole = sessionStorage.getItem("userRole");


  // =========================================================
  // CHECK LOGIN
  //
  // Nếu không tìm thấy role nghĩa là người dùng
  // chưa đăng nhập → chuyển về trang Login.
  // =========================================================
  if (!userRole) {
    return <Navigate to="/login" replace />;
  }


  // =========================================================
  // CHECK ROLE
  //
  // Nếu role của người dùng không đúng với role
  // được phép truy cập route → chuyển về trang phù hợp.
  // =========================================================
  if (userRole !== allowedRole) {
    // MEMBER không được truy cập trang Manager
    if (userRole === "MEMBER") {
      return <Navigate to="/member" replace />;
    }

    // CENTER_MANAGER không được truy cập trang Member
    if (userRole === "CENTER_MANAGER") {
      return <Navigate to="/manager" replace />;
    }

    // Nếu gặp role không xác định → quay lại Login
    return <Navigate to="/login" replace />;
  }


  // =========================================================
  // ACCESS GRANTED
  //
  // Đã đăng nhập + đúng role → cho phép hiển thị trang.
  // =========================================================
  return children;
}

export default ProtectedRoute;