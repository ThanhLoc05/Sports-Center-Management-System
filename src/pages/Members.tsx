import { operations } from "../lib/operations-api";
/**
 * FLOW 1 — QUẢN LÝ THÀNH VIÊN VÀ ĐỘI NGŨ. Prop team chọn nhóm nhân sự thay vì học viên.
 * Tìm kiếm/bộ lọc xử lý trên dữ liệu đã tải. Tạo mới dùng cùng API đăng ký MEMBER;
 * đổi trạng thái tài khoản không phải chức năng gán lại vai trò.
 */
import { useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Plus,
  Shield,
  Users,
  UserRoundCheck,
} from "lucide-react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUsers, useAction } from "../lib/hooks";
import { usePermissions } from "../lib/hooks";
import { ProfileEditor } from "../components/ProfileEditor";
import { TeamRoleAssignment } from "../components/TeamRoleAssignment";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

import { roleLabels } from "../lib/types";
import type { User } from "../lib/types";
import { dateLabel, downloadCsv, idLabel, matches } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  DataTable,
  Empty,
  ErrorState,
  ExportButton,
  Field,
  FormModal,
  Loading,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  useToast,
} from "../components/ui";
export default function Members({ team = false }: { team?: boolean }) {
  const [params] = useSearchParams();
  const { session } = useAuth();
  const can = usePermissions();
  const [editUser, setEditUser] = useState<User | null>(null);
  const users = useUsers(!team);
  const [search, setSearch] = useState(params.get("q") || "");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [create, setCreate] = useState(params.get("new") === "1");
  const [detail, setDetail] = useState<User | null>(null);
  const [change, setChange] = useState<{ user: User; status: string } | null>(
    null,
  );
  const [lookup, setLookup] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const lookupRequest = useRef(0);
  const pendingLookup = useRef<number | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  const manager = can("members.update");
  const demo = session!.mode === "demo";
  const receptionist = session!.user.roleName === "RECEPTIONIST";
  const openDetail = (user: User) => {
    // Chọn từ danh sách cũng phải vô hiệu hóa request tra cứu ID còn đang chờ.
    ++lookupRequest.current;
    pendingLookup.current = null;
    setLookupBusy(false);
    setLookupError("");
    setDetail(user);
  };
  /**
   * Cùng danh sách User nhưng team=true lấy nhân sự khác MEMBER; trang thành viên
   * chỉ lấy MEMBER. Các điều kiện search/status/role tiếp theo chỉ lọc mảng này.
   */
  const source = (users.data || []).filter((u) =>
    team ? u.roleName !== "MEMBER" : u.roleName === "MEMBER",
  );
  const rows = source.filter(
    (u) =>
      matches(search, u.fullName, u.email, u.phone, idLabel(u.id)) &&
      (status === "all" || u.status === status) &&
      (role === "all" || u.roleName === role),
  );
  /**
   * Đổi trạng thái qua mutation dùng chung: API thành công mới báo và làm mới cache.
   * Đây không phải thao tác xóa tài khoản hoặc đổi quyền.
   */
  const changeAction = useAction(
    (v: { user: User; status: string }) => api.status(v.user.id, v.status),
    "Đã cập nhật trạng thái tài khoản.",
  );
  return (
    <>
      <PageHeader
        eyebrow="CON NGƯỜI LÀ TRUNG TÂM"
        title={team ? "Đội ngũ trung tâm" : "Thành viên"}
        description={
          team
            ? "Những người cùng tạo nên trải nghiệm tập luyện tốt hơn."
            : "Kết nối, chăm sóc và đồng hành trên mỗi hành trình."
        }
        actions={
          <>
            {!!users.data && (
              <ExportButton
                onClick={() =>
                  downloadCsv(team ? "doi-ngu.csv" : "thanh-vien.csv", [
                    [
                      "Mã",
                      "Họ tên",
                      "Email",
                      "Điện thoại",
                      "Vai trò",
                      "Trạng thái",
                    ],
                    ...rows.map((u) => [
                      idLabel(u.id),
                      u.fullName,
                      u.email,
                      u.phone,
                      roleLabels[u.roleName],
                      u.status,
                    ]),
                  ])
                }
              />
            )}
            {(team ? can("team.manage") : can("members.create")) && (
              <Button onClick={() => setCreate(true)}>
                <Plus size={17} />
                {team ? "Thêm nhân viên" : "Thêm thành viên"}
              </Button>
            )}
          </>
        }
      />
      <div className="mini-stats">
        <div>
          <span className="mini-stat-icon green">
            <Users size={21} />
          </span>
          <div>
            <p>{team ? "Tổng nhân sự" : "Tổng thành viên"}</p>
            <strong>{users.data ? source.length : "—"}</strong>
          </div>
        </div>
        <div>
          <span className="mini-stat-icon blue">
            <UserRoundCheck size={21} />
          </span>
          <div>
            <p>Đang hoạt động</p>
            <strong>
              {users.data
                ? source.filter((u) => u.status === "ACTIVE").length
                : "—"}
            </strong>
          </div>
        </div>
        <div>
          <span className="mini-stat-icon orange">
            <Shield size={21} />
          </span>
          <div>
            <p>{team ? "Huấn luyện viên" : "Ngừng hoạt động / đã khóa"}</p>
            <strong>
              {users.data
                ? source.filter((u) =>
                    team ? u.roleName === "COACH" : u.status !== "ACTIVE",
                  ).length
                : "—"}
            </strong>
          </div>
        </div>
      </div>
      {team && (
        <Notice>
          Tạo tài khoản nhân viên và thay đổi vai trò chưa có endpoint backend.
          Danh sách và cập nhật trạng thái hoạt động đã được tích hợp.
        </Notice>
      )}
      {!demo && !team && receptionist && (
        <Panel className="panel-spaced" title="Hỗ trợ thành viên tại quầy">
          <Notice>
            Nhập ID để tra cứu chính xác hoặc tìm trong danh sách thành viên bên dưới.
          </Notice>
          <form
            className="inline-lookup"
            onSubmit={async (e) => {
              e.preventDefault();
              const id = Number(lookup);
              if (!Number.isSafeInteger(id) || id < 1) {
                setLookupError("ID thành viên phải là số nguyên dương hợp lệ.");
                return;
              }
              if (pendingLookup.current === id) return;
              const request = ++lookupRequest.current;
              pendingLookup.current = id;
              setLookupBusy(true);
              setLookupError("");
              setDetail(null);
              try {
                const found = await api.user(id);
                // Không mở kết quả của ID cũ khi người dùng đã đổi nội dung tra cứu.
                if (request !== lookupRequest.current) return;
                if (found.id !== id || found.roleName !== "MEMBER")
                  throw Error("Tài khoản này không phải thành viên hợp lệ.");
                setDetail(found);
              } catch (error) {
                if (request === lookupRequest.current)
                  setLookupError(error instanceof Error ? error.message : "Không tải được thành viên.");
              } finally {
                if (request === lookupRequest.current) {
                  pendingLookup.current = null;
                  setLookupBusy(false);
                }
              }
            }}
          >
            <Field label="ID thành viên">
              <input
                type="number"
                min="1"
                required
                value={lookup}
                onChange={(e) => {
                  setLookup(e.target.value);
                  ++lookupRequest.current;
                  pendingLookup.current = null;
                  setLookupBusy(false);
                  setLookupError("");
                }}
                placeholder="Nhập ID để hỗ trợ"
              />
            </Field>
            <Button type="submit" loading={lookupBusy}>Xem hồ sơ</Button>
            <Link
              className="btn btn-primary"
              to={`/memberships?memberId=${encodeURIComponent(lookup)}`}
            >
              Gói thành viên
              <ArrowUpRight size={16} />
            </Link>
            <Link
              className="btn btn-secondary"
              to={`/bookings?memberId=${encodeURIComponent(lookup)}`}
            >
              Đăng ký lớp
              <ArrowUpRight size={16} />
            </Link>
          </form>
          {lookupError && <p role="alert" className="form-error">{lookupError}</p>}
        </Panel>
      )}
      {(demo || manager || receptionist) && (
        <Panel>
          <div className="table-toolbar">
            <div>
              <h2>
                {team ? "Danh sách đội ngũ" : "Danh sách thành viên"}
                <span className="count-chip">{source.length}</span>
              </h2>
              <p>
                {team
                  ? "Quản lý quyền truy cập và trạng thái tài khoản."
                  : "Thông tin và trạng thái thành viên tại một nơi."}
              </p>
            </div>
            <div className="table-filters">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={
                  team ? "Tìm nhân viên..." : "Tìm tên, email, số điện thoại..."
                }
                label="Tìm thành viên"
              />
              {team && (
                <Select label="Vai trò" value={role} onChange={setRole}>
                  <option value="all">Tất cả vai trò</option>
                  <option value="COACH">Huấn luyện viên</option>
                  <option value="RECEPTIONIST">Lễ tân</option>
                  <option value="CENTER_MANAGER">Quản lý</option>
                </Select>
              )}
              <Select
                label="Trạng thái thành viên"
                value={status}
                onChange={setStatus}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
                <option value="BLOCKED">Đã khóa</option>
              </Select>
            </div>
          </div>
          {users.isPending ? (
            <Loading />
          ) : users.error ? (
            <ErrorState error={users.error} retry={users.refetch} />
          ) : (
            <DataTable
              rows={rows}
              label={team ? "Danh sách đội ngũ" : "Danh sách thành viên"}
              columns={[
                {
                  key: "name",
                  label: team ? "Nhân viên" : "Thành viên",
                  render: (u) => (
                    <button
                      className="person-cell"
                      onClick={() => openDetail(u)}
                    >
                      <Avatar name={u.fullName} index={u.id} />
                      <span>
                        <strong>{u.fullName}</strong>
                        <small>{idLabel(u.id, team ? "NV" : "TV")}</small>
                      </span>
                    </button>
                  ),
                },
                {
                  key: "contact",
                  label: "Liên hệ",
                  render: (u) => (
                    <div className="contact-cell">
                      <span>{u.email}</span>
                      <small>{u.phone}</small>
                    </div>
                  ),
                },
                {
                  key: "role",
                  label: "Vai trò",
                  render: (u) => (
                    <span className="role-chip">{roleLabels[u.roleName]}</span>
                  ),
                },
                {
                  key: "status",
                  label: "Trạng thái",
                  render: (u) => <Badge status={u.status} />,
                },
                {
                  key: "actions",
                  label: "Thao tác",
                  render: (u) => (
                    <div className="row-actions">
                      {(demo || u.roleName === "MEMBER" || team) &&
                        can(
                          u.roleName === "MEMBER"
                            ? "members.update"
                            : "team.manage",
                        ) && (
                          <button
                            className="text-link"
                            onClick={() => setEditUser(u)}
                          >
                            Sửa hồ sơ
                          </button>
                        )}
                      <button
                        className="subtle-link"
                        onClick={() => openDetail(u)}
                      >
                        Chi tiết
                        <ArrowUpRight size={14} />
                      </button>

                    </div>
                  ),
                },
              ]}
            />
          )}
        </Panel>
      )}
      {create && team && (
        <ProfileEditor team onClose={() => setCreate(false)} />
      )}
      {editUser && (
        <ProfileEditor user={editUser} onClose={() => setEditUser(null)} />
      )}
      {create && !team && (
        <FormModal
          title="Thêm thành viên mới"
          description="Tài khoản mới luôn có vai trò Thành viên. Thông tin đăng nhập do thành viên quản lý."
          onClose={() => setCreate(false)}
          submitLabel="Tạo thành viên"
          onSubmit={async (data) => {
            /**
             * Tạo thành viên tại quầy bằng cùng endpoint đăng ký công khai. Payload
             * không chứa role; backend tạo MEMBER, frontend không tự tạo quản lý/HLV.
             */
            await api.register({
              fullName: String(data.get("fullName")).trim(),
              email: String(data.get("email")).trim(),
              phone: String(data.get("phone")).trim(),
              password: String(data.get("password")),
            });
            await client.invalidateQueries();
            toast("Đã tạo thành viên mới.");
          }}
        >
          <Field label="Họ và tên">
            <input
              name="fullName"
              required
              minLength={2}
              maxLength={100}
              placeholder="Nguyễn Minh Anh"
              autoComplete="off"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              name="email"
              required
              maxLength={255}
              placeholder="thanhvien@example.com"
              autoComplete="off"
            />
          </Field>
          <Field label="Số điện thoại">
            <input
              type="tel"
              name="phone"
              required
              pattern="[+0-9 ()-]{9,20}"
              placeholder="090 123 4567"
            />
          </Field>
          <Field
            label="Mật khẩu ban đầu"
            hint={
              demo
                ? "Trong demo, các tài khoản dùng mật khẩu chung Sportiva@123; không lưu mật khẩu thật."
                : "Thành viên cần được cung cấp mật khẩu qua kênh an toàn."
            }
          >
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              placeholder="Tối thiểu 8 ký tự"
            />
          </Field>
        </FormModal>
      )}
      {detail && (
        <MemberDetail
          key={detail.id}
          user={users.data?.find((u) => u.id === detail.id) || detail}
          team={team}
          onRoleSaved={setDetail}
          // Đặt thao tác trong hồ sơ để quản lý kiểm tra đúng người trước khi xác nhận.
          statusAction={manager && detail.id !== session!.user.id ? (
            <Button
              variant="secondary"
              aria-label={"Thay đổi trạng thái " + detail.fullName}
              onClick={() => {
                const user = users.data?.find((u) => u.id === detail.id) || detail;
                setChange({
                  user,
                  status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                });
              }}
            >
              Cập nhật trạng thái tài khoản
            </Button>
          ) : null}
          onClose={() => setDetail(null)}
        />
      )}
      {change && (
        <Confirm
          title="Cập nhật trạng thái tài khoản?"
          description={`${change.user.fullName} sẽ được chuyển sang trạng thái ${change.status === "ACTIVE" ? "đang hoạt động" : "ngừng hoạt động"}. Tài khoản ngừng hoạt động sẽ không đăng nhập được.`}
          danger={change.status !== "ACTIVE"}
          onClose={() => setChange(null)}
          onConfirm={() => changeAction.mutateAsync(change)}
        />
      )}
    </>
  );
}
/**
 * Chi tiết ghép thông tin User với lịch sử gói và booking của user.id.
 * Mỗi query có ID trong key để hồ sơ người này không dùng dữ liệu cache người khác.
 */
function MemberDetail({
  user,
  team,
  onRoleSaved,
  statusAction,
  onClose,
}: {
  user: User;
  team: boolean;
  onRoleSaved: (updated: User) => void;
  statusAction?: ReactNode;
  onClose: () => void;
}) {
  const member = user.roleName === "MEMBER";
  const { session } = useAuth();
  const [editProfile, setEditProfile] = useState(false);
  const canEditProfile = session?.mode === "api" && member &&
    ["CENTER_MANAGER", "MANAGER", "RECEPTIONIST"].includes(session.user.roleName);
  // Hồ sơ luyện tập được tải riêng theo memberId khi mở chi tiết thành viên.
  const profile = useQuery({
    queryKey: ["member-profile", user.id],
    queryFn: () => operations.profile(user.id),
    enabled: session?.mode === "api" && member,
    retry: false,
  });
  const subs = useQuery({
    queryKey: ["subscriptions", user.id],
    queryFn: () => api.subscriptions(user.id),
    enabled: member,
  });
  const bookings = useQuery({
    queryKey: ["bookings", user.id],
    queryFn: () => api.bookings(user.id),
    enabled: member,
  });
  return (
    <>
    <Modal title="Thông tin tài khoản" onClose={onClose} wide>
      <div className="member-detail">
        <div className="member-detail-header">
          <Avatar name={user.fullName} size="large" index={user.id} />
          <div>
            <h2>{user.fullName}</h2>
            <p>
              {idLabel(user.id)} · {roleLabels[user.roleName]}
            </p>
            <div className="member-account-status">
              <Badge status={user.status} />
              {statusAction}
            </div>
          </div>
        </div>
        <div className="detail-grid">
          <div>
            <span>Mục tiêu tập luyện</span>
            <strong>
              {profile.data?.fitnessGoals ||
                user.fitnessGoals ||
                "Chưa cung cấp"}
            </strong>
          </div>
          <div>
            <span>Trình độ</span>
            <strong>{user.level || "Chưa cung cấp"}</strong>
          </div>
          <div>
            <span>Địa chỉ</span>
            <strong>
              {profile.data?.address || user.address || "Chưa cung cấp"}
            </strong>
          </div>
          <div>
            <span>Chuyên môn</span>
            <strong>{user.specialties || "Chưa cung cấp"}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{user.email}</strong>
            {team && (
              <TeamRoleAssignment
                key={user.id + user.roleName}
                user={user}
                onSaved={onRoleSaved}
              />
            )}
          </div>
          <div>
            <span>Điện thoại</span>
            <strong>{user.phone || "Chưa cung cấp"}</strong>
          </div>
        </div>
        {member && profile.error && session?.mode === "api" && (
          <ErrorState error={profile.error} retry={profile.refetch} />
        )}
        {member && session?.mode === "api" && (profile.isPending ? <Loading /> :
          !profile.error && <>
            {profile.data === null && <Notice>Thành viên chưa có hồ sơ.</Notice>}
            <div className="detail-grid">
              <div><span>Ngày sinh</span><strong>{profile.data?.dob ? dateLabel(profile.data.dob) : "Chưa cung cấp"}</strong></div>
              <div><span>Giới tính</span><strong>{profile.data?.gender || "Chưa cung cấp"}</strong></div>
            </div>
            {canEditProfile && <Button disabled={!profile.isSuccess || profile.isFetching} onClick={() => setEditProfile(true)}>Sửa hồ sơ thành viên</Button>}
          </>)}
        {member && (
          <>
            <h3>Lịch sử gói tập</h3>
            {subs.isPending ? (
              <Loading />
            ) : subs.error ? (
              <ErrorState error={subs.error} retry={subs.refetch} />
            ) : subs.data?.length ? (
              <div className="detail-sub-list">
                {subs.data.map((s) => (
                  <div key={s.id}>
                    <div>
                      <strong>Gói #{s.packageId}</strong>
                      <small>
                        {dateLabel(s.startDate)} – {dateLabel(s.endDate)}
                      </small>
                    </div>
                    <Badge status={s.status} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="Chưa có gói tập"
                description="Đăng ký gói để bắt đầu hành trình."
              />
            )}
            <div className="detail-booking-count">
              <span>Lớp đang đăng ký</span>
              <strong>
                {bookings.data?.filter((b) => b.status === "BOOKED").length ??
                  "—"}
              </strong>
            </div>
            <div className="detail-actions">
              <Link
                className="btn btn-primary"
                to={`/memberships?memberId=${user.id}`}
              >
                Quản lý gói tập
                <ArrowUpRight size={16} />
              </Link>
              <Link
                className="btn btn-secondary"
                to={`/bookings?memberId=${user.id}`}
              >
                Xem đăng ký lớp
              </Link>
            </div>
          </>
        )}
      </div>
    </Modal>
    {editProfile && <ProfileEditor user={user} onClose={() => setEditProfile(false)} />}
    </>
  );
}
