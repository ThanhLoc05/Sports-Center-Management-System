/** Đợt 1 chỉ dựng router và khung trang; nghiệp vụ được cập nhật ở các đợt sau. */
import { Link, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { PageHeader, Panel } from "./components/ui";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <>
              <PageHeader
                title="Không gian trung tâm"
                description="Kết nối con người và hoạt động thể thao."
              />
              <Panel title="Chào mừng đến Sportiva">
                <p>Không gian quản lý trung tâm thể thao.</p>
              </Panel>
            </>
          }
        />
        <Route
          path="*"
          element={
            <Panel title="Không tìm thấy trang">
              <Link to="/">Về tổng quan</Link>
            </Panel>
          }
        />
      </Route>
    </Routes>
  );
}
