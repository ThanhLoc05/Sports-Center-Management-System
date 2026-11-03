import { ApiProfile } from "../components/ApiProfileEditor";
/**
 * CÀI ĐẶT HIỂN THỊ, THÔNG TIN KẾT NỐI VÀ HỒ SƠ NGƯỜI DÙNG.
 * Tùy chọn giao diện/khôi phục demo là thao tác cục bộ. Nút kiểm tra kết nối gọi
 * API hồ sơ với JWT hiện tại, giúp phân biệt đang dùng API hay dữ liệu demo.
 */
import { useState } from "react";
import {
  ArrowUpRight,
  Database,
  ExternalLink,
  FileCode2,
  Monitor,
  Server,
  Wifi,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { roleLabels } from "../lib/types";
import { api, configuredMode, request } from "../lib/api";

import { errorText } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  DemoOnly,
  ErrorState,
  Loading,
  Notice,
  PageHeader,
  Panel,
} from "../components/ui";
import { useQuery } from "@tanstack/react-query";
import { BankSettings } from "../components/PaymentQr";
import { ProfileEditor } from "../components/ProfileEditor";
export default function Settings() {
  const { session } = useAuth();
  const demo = session!.mode === "demo";
  const [tab, setTab] = useState("general");

  const [compact, setCompact] = useState(
    localStorage.getItem("sportiva-density") === "compact",
  );
  const [ping, setPing] = useState("");
  const [checking, setChecking] = useState(false);

  /**
   * Kiểm tra kết nối bằng GET hồ sơ của chính người dùng cùng JWT hiện tại;
   * thành công nghĩa backend chấp nhận yêu cầu này, không chứng minh mọi API đều hoạt động.
   */
  async function check() {
    setChecking(true);
    setPing("");
    try {
      await request(`/users/${session!.user.id}`);
      setPing("Backend phản hồi thành công, JWT được chấp nhận.");
    } catch (e) {
      setPing(errorText(e));
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="YOUR SPACE, YOUR WAY"
        title="Cài đặt"
        description="Một không gian vận hành rõ ràng, phù hợp với bạn."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Danh mục cài đặt">
          {[
            { id: "general", icon: Monitor, label: "Không gian làm việc" },
            { id: "integration", icon: Server, label: "Kết nối & API" },
          ].map((t) => (
            <button
              className={tab === t.id ? "active" : ""}
              key={t.id}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={18} />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === "general" && (
            <>
              <BankSettings />
              <Panel
                title="Hồ sơ & tài khoản"
                description="Thông tin được dùng trong không gian làm việc của bạn."
              >
                <div className="settings-account">
                  <Avatar name={session!.user.fullName} size="large" />
                  <div>
                    <h3>{session!.user.fullName}</h3>
                    <p>{session!.user.email}</p>
                    <span className="role-chip">
                      {roleLabels[session!.user.roleName]}
                    </span>
                  </div>
                  <Link className="btn btn-secondary" to="/profile">
                    Xem hồ sơ
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </Panel>
              <Panel
                title="Giao diện"
                description="Tùy chỉnh cách bạn xem dữ liệu."
              >
                <div className="settings-row">
                  <div>
                    <strong>Bảng dữ liệu gọn hơn</strong>
                    <p>
                      Giảm khoảng đệm các hàng trong bảng. Lưu riêng trên trình
                      duyệt này.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={compact}
                    aria-label="Bảng dữ liệu gọn hơn"
                    className={`toggle ${compact ? "on" : ""}`}
                    onClick={() => {
                      const value = !compact;
                      setCompact(value);
                      localStorage.setItem(
                        "sportiva-density",
                        value ? "compact" : "comfortable",
                      );
                      document.documentElement.dataset.density = value
                        ? "compact"
                        : "comfortable";
                    }}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Ngôn ngữ</strong>
                    <p>Nội dung và định dạng ngày, tiền tệ.</p>
                  </div>
                  <span>Tiếng Việt · VND</span>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Múi giờ</strong>
                    <p>Lịch học theo thời gian địa phương của trung tâm.</p>
                  </div>
                  <span>Asia/Ho_Chi_Minh (GMT+7)</span>
                </div>
              </Panel>
            </>
          )}
          {tab === "integration" && (
            <>
              <Panel className="panel-spaced"
                title="Trạng thái kết nối"
                description="Frontend không tự chuyển sang demo khi backend gặp lỗi."
              >
                <div className="connection-status">
                  <span className={`connection-icon ${demo ? "demo" : ""}`}>
                    <Server size={25} />
                  </span>
                  <div>
                    <h3>
                      {demo ? "Đang dùng dữ liệu demo" : "Chế độ backend API"}
                    </h3>
                    <p>
                      {demo
                        ? "Thao tác ghi vào localStorage, không gửi đến backend."
                        : import.meta.env.VITE_API_BASE_URL ||
                          "Same origin · /api/v1"}
                    </p>
                  </div>
                  <span className="tag">{session!.mode.toUpperCase()}</span>
                </div>
                <div className="integration-details">
                  <div>
                    <span>Cấu hình build</span>
                    <code>VITE_DATA_MODE={configuredMode}</code>
                  </div>
                  <div>
                    <span>API base URL</span>
                    <code>
                      {import.meta.env.VITE_API_BASE_URL ||
                        "Same origin (dev proxy → localhost:8080)"}
                    </code>
                  </div>
                  <div>
                    <span>Contract ưu tiên</span>
                    <strong>Java DTO & controller · nhánh BE</strong>
                  </div>
                  <div>
                    <span>Xác thực</span>
                    <strong>Bearer JWT · sessionStorage</strong>
                  </div>
                </div>
                {!demo && (
                  <>
                    <Button
                      variant="secondary"
                      loading={checking}
                      onClick={() => void check()}
                    >
                      <Wifi size={16} />
                      Kiểm tra kết nối
                    </Button>
                    {ping && <Notice>{ping}</Notice>}
                  </>
                )}
                <Notice>
                  Đổi sang API: sao chép .env.example thành .env, đặt
                  VITE_DATA_MODE=api và URL backend, sau đó khởi động lại Vite.
                  Production cần cấu hình proxy /api và HTTPS.
                </Notice>
              </Panel>
              <Panel title="Tài liệu tham chiếu">
                <div className="documentation-links">
                  <a
                    href="https://app.swaggerhub.com/apis/envo/SportsCenterManagementSystem/1.0.0"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileCode2 size={20} />
                    <div>
                      <strong>SwaggerHub API 1.0.0</strong>
                      <p>Có khác biệt với code BE; xem docs/AUDIT.md.</p>
                    </div>
                    <ExternalLink size={16} />
                  </a>
                  <a
                    href="https://github.com/ThanhLoc05/Sports-Center-Management-System/tree/BE"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Database size={20} />
                    <div>
                      <strong>Repository backend</strong>
                      <p>Source gốc đã được đưa vào thư mục backend/.</p>
                    </div>
                    <ExternalLink size={16} />
                  </a>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </>
  );
}
/**
 * Phiên API dùng ApiProfile để đọc/cập nhật hồ sơ theo ID tài khoản đăng nhập.
 * Nhánh LegacyProfile giữ cách hiển thị dữ liệu mẫu phục vụ kiểm thử.
 */
export function Profile() {
  const { session } = useAuth();
  return session?.mode === "api" ? <ApiProfile /> : <LegacyProfile />;
}
function LegacyProfile() {
  const { session } = useAuth();
  const demo = session!.mode === "demo";
  const [edit, setEdit] = useState(false);

  const query = useQuery({
    queryKey: ["profile", session!.user.id],
    queryFn: () => api.user(session!.user.id),
  });
  const user = query.data || session!.user;
  return (
    <>
      <PageHeader
        eyebrow="THIS IS YOUR SPACE"
        title="Hồ sơ cá nhân"
        description="Thông tin của bạn trong cộng đồng Sportiva."
        actions={
          demo && (
            <Button onClick={() => setEdit(true)}>Cập nhật hồ sơ demo</Button>
          )
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        <Panel>
          <div className="profile-page-header">
            <Avatar name={user.fullName} size="large" />
            <div>
              <h2>{user.fullName}</h2>
              <p>{roleLabels[user.roleName]}</p>
              <Badge status={user.status} />
            </div>
          </div>
          <div className="profile-details">
            <div>
              <span>Họ và tên</span>
              <strong>{user.fullName}</strong>
            </div>
            <div>
              <span>Địa chỉ email</span>
              <strong>{user.email}</strong>
            </div>
            <div>
              <span>Số điện thoại</span>
              <strong>{user.phone || "Chưa cung cấp"}</strong>
            </div>
            <div>
              <span>Mã tài khoản</span>
              <strong>#{user.id}</strong>
            </div>
          </div>
        </Panel>
      )}
      {!demo && (
        <DemoOnly>
          Backend chưa có endpoint cập nhật hồ sơ hoặc đổi mật khẩu. FE đang
          hiển thị thông tin từ GET /users/{"{id}"}.
        </DemoOnly>
      )}
      {edit && <ProfileEditor user={user} onClose={() => setEdit(false)} />}
    </>
  );
}
