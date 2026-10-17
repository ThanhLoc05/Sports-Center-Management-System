import { useState } from "react";
import {
  ArrowUpRight,
  Database,
  ExternalLink,
  FileCode2,
  Monitor,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { roleLabels } from "../lib/types";
import { api, configuredMode, request, updateDemo } from "../lib/api";
import { demoSession, resetDemo } from "../lib/demo";

import { errorText } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  DemoOnly,
  ErrorState,
  Field,
  FormModal,
  Loading,
  Notice,
  PageHeader,
  Panel,
  useToast,
} from "../components/ui";
import { useQuery } from "@tanstack/react-query";
export default function Settings() {
  const { session, signIn } = useAuth();
  const demo = session!.mode === "demo";
  const [tab, setTab] = useState("general");
  const [reset, setReset] = useState(false);
  const [compact, setCompact] = useState(
    localStorage.getItem("sportiva-density") === "compact",
  );
  const [ping, setPing] = useState("");
  const [checking, setChecking] = useState(false);
  const toast = useToast();
  const client = useQueryClient();
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
            {
              id: "permissions",
              icon: ShieldCheck,
              label: "Vai trò & quyền hạn",
            },
            { id: "data", icon: Database, label: "Dữ liệu demo" },
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
              <Panel
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
          {tab === "permissions" && (
            <Panel
              title="Vai trò & quyền hạn"
              description="FE bảo vệ route; backend cần kiểm tra quyền cho từng tài nguyên."
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Chức năng</th>
                      <th>Quản lý</th>
                      <th>HLV</th>
                      <th>Thành viên</th>
                      <th>Lễ tân</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [
                        "Quản lý tài khoản",
                        "Đầy đủ",
                        "—",
                        "Hồ sơ bản thân",
                        "Tạo thành viên",
                      ],
                      [
                        "Lớp & lịch học",
                        "Tạo / sửa / hủy",
                        "Lớp phụ trách",
                        "Xem / đăng ký",
                        "Xem / đăng ký hộ",
                      ],
                      [
                        "Gói thành viên",
                        "Đăng ký / gia hạn",
                        "—",
                        "Gói của mình",
                        "Đăng ký / gia hạn",
                      ],
                      [
                        "Điểm danh",
                        "Ghi nhận",
                        "Ghi nhận",
                        "Xem của mình",
                        "Ghi nhận",
                      ],
                      [
                        "Hóa đơn",
                        "Thu / hoàn tiền",
                        "—",
                        "Xem của mình",
                        "Tạo / thu tiền",
                      ],
                      ["Báo cáo", "Xem doanh thu", "—", "—", "—"],
                      [
                        "Kế hoạch / AI",
                        "Demo local",
                        "Demo local",
                        "Demo local",
                        "Trợ lý demo",
                      ],
                    ].map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, i) => (
                          <td key={i}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Notice>
                Backend chưa có API cấp quyền hoặc tạo nhân viên. Ma trận này mô
                tả quyền giao diện; một số quyền BE còn thiếu/chưa đủ chặt được
                ghi trong audit.
              </Notice>
            </Panel>
          )}
          {tab === "data" && (
            <>
              <Panel
                title="Dữ liệu demo local"
                description="Môi trường thử nghiệm các luồng của trung tâm."
              >
                <div className="settings-row">
                  <div>
                    <strong>Phạm vi lưu trữ</strong>
                    <p>
                      Dữ liệu minh họa nằm trên trình duyệt hiện tại, tách biệt
                      backend.
                    </p>
                  </div>
                  <span className="tag">LOCAL ONLY</span>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Khôi phục dữ liệu ban đầu</strong>
                    <p>
                      Xóa thay đổi demo và tạo lại dữ liệu minh họa. Dữ liệu
                      backend không bị tác động.
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    disabled={!demo}
                    onClick={() => setReset(true)}
                  >
                    <RefreshCw size={15} />
                    Khôi phục demo
                  </Button>
                </div>
                <Notice>
                  Không nhập thông tin cá nhân thật vào demo. Đăng xuất xóa
                  phiên đăng nhập; dữ liệu demo vẫn còn cho đến khi khôi phục
                  hoặc xóa dữ liệu trình duyệt.
                </Notice>
              </Panel>
            </>
          )}
        </div>
      </div>
      {reset && (
        <Confirm
          title="Khôi phục dữ liệu demo?"
          description="Toàn bộ thay đổi demo trên trình duyệt này sẽ được thay bằng dữ liệu mẫu ban đầu. Thao tác không thể hoàn tác."
          onClose={() => setReset(false)}
          onConfirm={async () => {
            resetDemo();
            signIn(demoSession(session!.user.roleName));
            await client.invalidateQueries();
            toast("Đã khôi phục dữ liệu demo.");
          }}
        />
      )}
    </>
  );
}
export function Profile() {
  const { session, signIn } = useAuth();
  const demo = session!.mode === "demo";
  const [edit, setEdit] = useState(false);
  const client = useQueryClient();
  const toast = useToast();
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
      {edit && (
        <FormModal
          title="Cập nhật hồ sơ demo"
          description="Chỉ thay đổi tên và điện thoại trong demo local."
          onClose={() => setEdit(false)}
          onSubmit={async (d) => {
            const fullName = String(d.get("fullName")).trim(),
              phone = String(d.get("phone")).trim();
            updateDemo("Cập nhật hồ sơ demo", fullName, (db) => {
              const u = db.users.find((u) => u.id === user.id);
              if (u) {
                u.fullName = fullName;
                u.phone = phone;
              }
            });
            signIn({ ...session!, user: { ...user, fullName, phone } });
            await client.invalidateQueries();
            toast("Đã cập nhật hồ sơ demo.");
          }}
        >
          <Field label="Họ và tên">
            <input
              name="fullName"
              required
              minLength={2}
              maxLength={100}
              defaultValue={user.fullName}
            />
          </Field>
          <Field label="Số điện thoại">
            <input
              name="phone"
              type="tel"
              required
              pattern="[+0-9 ()-]{9,20}"
              defaultValue={user.phone}
            />
          </Field>
        </FormModal>
      )}
    </>
  );
}
