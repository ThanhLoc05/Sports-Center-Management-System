/** Khung sidebar/header/nội dung, tách khỏi dữ liệu các module nghiệp vụ. */
import { useEffect, useState } from "react";
import {
  Activity,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Avatar, Button } from "./ui";

export interface NavigationItem {
  to: string;
  label: string;
}
export default function Layout({
  account,
  items = [{ to: "/", label: "Tổng quan" }],
  onSignOut,
}: {
  account?: { name: string; roleLabel: string };
  items?: NavigationItem[];
  onSignOut?: () => void;
}) {
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const current =
    items.find((item) => item.to === location.pathname)?.label || "Sportiva";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Bỏ qua menu, tới nội dung
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Đóng điều hướng"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="main-sidebar"
        className={`sidebar ${mobile ? "sidebar-open" : ""}`}
      >
        <Link className="brand" to="/">
          <span className="brand-symbol">
            <Activity size={25} />
          </span>
          sportiva<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-card">
          <ShieldCheck size={24} />
          <div>
            <strong>Sportiva Center</strong>
            <small>Không gian làm việc</small>
          </div>
        </div>
        <nav aria-label="Điều hướng chính">
          <div className="nav-group">
            <p>KHÔNG GIAN LÀM VIỆC</p>
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <LayoutDashboard size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-signature">
            <span className="status-dot" />
            Sportiva Center
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
          {account && (
            <div className="topbar-actions">
              <Avatar name={account.name} size="small" />
              <div className="contact-cell">
                <strong>{account.name}</strong>
                <small>{account.roleLabel}</small>
              </div>
              {onSignOut && (
                <Button variant="ghost" onClick={onSignOut}>
                  <LogOut size={16} />
                  Đăng xuất
                </Button>
              )}
            </div>
          )}
        </header>
        <main id="main-content" className="main-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} Sportiva Center</span>
          <span>Chuyển động mỗi ngày. Tốt hơn mỗi ngày.</span>
        </footer>
      </div>
    </div>
  );
}
