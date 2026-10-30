import { parseDate } from "../lib/utils";
import BookingForm from "../components/BookingForm";
import { UserProfileModal } from "../components/ProfileEditor";
import { useDemoData, usePermissions } from "../lib/hooks";
import {
  apiMembershipAccess,
  classAccessAllowed,
  classEligibility,
  membershipAccess,
} from "../lib/entitlements";

/**
 * FLOW 2 — QUẢN LÝ LỚP, PHÂN CÔNG HLV VÀ XEM LỊCH.
 * ClassForm dùng chung cho tạo/sửa; Classes là danh sách; ClassDetail xem chi tiết
 * và xem sức chứa. Cùng dữ liệu lớp được tái sử dụng trong lịch hoạt động.
 */
import { useCatalog } from "../lib/catalog";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Dumbbell,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useClasses, useUsers } from "../lib/hooks";
import { api } from "../lib/api";

import type { AccessLevel, SportClass } from "../lib/types";
import {
  addDays,
  dateLabel,
  dateTimeLocal,
  localDate,
  matches,
  timeLabel,
} from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  DataTable,
  Empty,
  ErrorState,
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
/**
 * Có item là sửa lớp, thiếu item là tạo mới. Chuyển ID/sức chứa/thời lượng
 * từ chuỗi FormData thành number trước khi gửi đúng hợp đồng ClassInput.
 */
export function ClassForm({
  item,
  onClose,
}: {
  item?: SportClass;
  onClose: () => void;
}) {
  const catalog = useCatalog();
  const { sports, rooms } = catalog;
  const users = useUsers();

  const client = useQueryClient();
  const toast = useToast();
  return (
    <FormModal
      title={item ? "Chỉnh sửa lớp học" : "Tạo lớp học mới"}
      description="Lịch học, không gian và người đồng hành cho mỗi buổi tập."
      wide
      submitDisabled={catalog.loading || !!catalog.error}
      onClose={onClose}
      submitLabel={item ? "Lưu lớp học" : "Tạo lớp học"}
      onSubmit={async (data) => {
        /**
         * Gửi dữ liệu form cùng item?.id; API chọn POST/PUT. Chỉ sau khi chờ lưu thành công
         * mới invalidate cache và báo hoàn tất. FormModal sẽ giữ form nếu có lỗi.
         */
        await api.saveClass(
          {
            className: String(data.get("className")).trim(),
            sportId: Number(data.get("sportId")),
            coachId: Number(data.get("coachId")),
            roomId: Number(data.get("roomId")),
            maxCapacity: Number(data.get("maxCapacity")),
            scheduleTime: String(data.get("scheduleTime")),
            durationMinutes: Number(data.get("durationMinutes")),
            requiredAccessLevel: data.get("requiredAccessLevel") as AccessLevel,
            status: item?.status || "SCHEDULED",
          },
          item?.id,
        );
        await client.invalidateQueries();
        toast(item ? "Đã cập nhật lớp học." : "Đã tạo lớp học mới.");
      }}
    >
      {catalog.loading && <Loading />}
      {catalog.error && (
        <ErrorState error={catalog.error} retry={catalog.retry} />
      )}
      <Field label="Tên lớp học">
        <input
          name="className"
          required
          maxLength={100}
          minLength={2}
          defaultValue={item?.className}
          placeholder="VD: Morning Yoga"
        />
      </Field>
      <div className="form-grid">
        <Field label="Cấp độ yêu cầu">
          <select
            name="requiredAccessLevel"
            required
            defaultValue={item?.requiredAccessLevel ?? "STANDARD"}
          >
            <option value="STANDARD">STANDARD</option>
            <option value="VIP">VIP</option>
          </select>
        </Field>
        <Field label="Bộ môn">
          <select name="sportId" required defaultValue={item?.sportId || ""}>
            <option value="" disabled>
              Chọn bộ môn
            </option>
            {Object.entries(sports).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phòng tập">
          <select name="roomId" required defaultValue={item?.roomId || ""}>
            <option value="" disabled>
              Chọn phòng tập
            </option>
            {Object.entries(rooms).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Huấn luyện viên">
          {users.data?.some((u) => u.roleName === "COACH") ? (
            <select name="coachId" required defaultValue={item?.coachId || ""}>
              <option value="" disabled>
                Chọn huấn luyện viên
              </option>
              {users.data
                .filter((u) => u.roleName === "COACH" && u.status === "ACTIVE")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
            </select>
          ) : (
            <input
              name="coachId"
              type="number"
              min="1"
              required
              defaultValue={item?.coachId}
              placeholder="ID huấn luyện viên"
            />
          )}
        </Field>
        <Field label="Sức chứa tối đa">
          <input
            type="number"
            name="maxCapacity"
            required
            min="1"
            max="500"
            step="1"
            defaultValue={item?.maxCapacity || 20}
          />
        </Field>
        <Field label="Ngày và giờ bắt đầu">
          <input
            type="datetime-local"
            name="scheduleTime"
            required
            min={dateTimeLocal().slice(0, 16)}
            defaultValue={
              item?.scheduleTime.slice(0, 16) ||
              `${localDate(addDays(1))}T08:00`
            }
          />
        </Field>
        <Field label="Thời lượng (phút)">
          <input
            name="durationMinutes"
            type="number"
            min="15"
            max="480"
            step="5"
            required
            defaultValue={item?.durationMinutes || 60}
          />
        </Field>
      </div>
    </FormModal>
  );
}
export default function Classes() {
  const { sports } = useCatalog();
  const { session } = useAuth();
  const can = usePermissions();
  const db = useDemoData();
  const member = session!.user.roleName === "MEMBER";
  const [eligibleOnly, setEligibleOnly] = useState(member);
  const access = db && member ? membershipAccess(db, session!.user.id) : null;
  const apiMember = member && session!.mode === "api";
  const activeMembership = useQuery({
    queryKey: ["activeSubscription", session!.user.id],
    queryFn: () => api.activeSubscription(session!.user.id),
    enabled: apiMember,
  });
  const membershipPackages = useQuery({
    queryKey: ["membershipPackages"],
    queryFn: api.membershipPackages,
    enabled: apiMember,
  });
  const accessError = activeMembership.error || membershipPackages.error;
  const accessLoading =
    apiMember &&
    (activeMembership.isPending ||
      membershipPackages.isPending ||
      activeMembership.isFetching ||
      membershipPackages.isFetching);
  // Chưa có kết quả hoặc API báo lỗi thì không mặc định thành viên đủ quyền.
  const apiAccess =
    apiMember && !accessLoading && !accessError
      ? apiMembershipAccess(
          activeMembership.data ?? null,
          membershipPackages.data ?? [],
          session!.user.id,
        )
      : null;
  const manager = can("classes.manage"),
    demo = session!.mode === "demo",
    coach = session!.user.roleName === "COACH";
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const [sport, setSport] = useState("all");
  const [status, setStatus] = useState("SCHEDULED");
  const [view, setView] = useState("grid");
  const [edit, setEdit] = useState<SportClass | true | null>(
    params.get("new") === "1" && manager ? true : null,
  );
  const [selected, setSelected] = useState<SportClass | null>(null);
  const [cancel, setCancel] = useState<SportClass | null>(null);
  const classes = useClasses();
  const users = useUsers();
  const client = useQueryClient();
  const toast = useToast();
  /**
   * Lọc danh sách lớp đã tải theo từ khóa, bộ môn và trạng thái; không tạo thêm
   * request tìm kiếm mỗi khi gõ. HLV đã có bộ lọc coachId ở useClasses.
   */
  const rows = (classes.data || []).filter(
    (c) =>
      matches(search, c.className) &&
      (!eligibleOnly ||
        (db
          ? classEligibility(db, c.id, session!.user.id).allowed
          : !!apiAccess?.allowed &&
            classAccessAllowed(apiAccess.accessLevel, c.requiredAccessLevel))) &&
      (sport === "all" || c.sportId === Number(sport)) &&
      (status === "all" || c.status === status),
  );
  return (
    <>
      <PageHeader
        eyebrow="FIND YOUR MOVEMENT"
        title={coach ? "Lớp học phụ trách" : "Lớp học"}
        description="Tìm nhịp tập của bạn. Kết nối cùng những người chung năng lượng."
        actions={
          <>
            <Link to="/schedule" className="btn btn-secondary">
              <CalendarDays size={16} />
              Xem lịch hoạt động
            </Link>
            {manager && (
              <Button onClick={() => setEdit(true)}>
                <Plus size={17} />
                Tạo lớp học
              </Button>
            )}
          </>
        }
      />
      <div className="class-filter-bar">
        {member && (
          <Panel title="Lớp học theo gói của tôi">
            <p>
              {access?.pkg
                ? `${access.pkg.name} · ${access.reason}`
                : demo
                  ? "Đăng ký gói tập để chọn lớp phù hợp."
                  : accessError
                    ? "Chưa xác minh được quyền lợi gói tập."
                    : accessLoading
                      ? "Đang kiểm tra quyền lợi gói tập…"
                      : apiAccess?.allowed
                        ? `${apiAccess.pkg.packageName} · ${apiAccess.reason}`
                        : apiAccess?.reason}
            </p>
            {apiMember && accessError && (
              <ErrorState
                error={accessError}
                retry={() => {
                  void activeMembership.refetch();
                  void membershipPackages.refetch();
                }}
              />
            )}
            <label className="check-option">
              <input
                type="checkbox"
                checked={eligibleOnly}
                onChange={(e) => setEligibleOnly(e.target.checked)}
              />
              Chỉ xem lớp phù hợp gói
            </label>
            <Link to="/memberships" className="text-link">
              Xem / đổi gói tập
            </Link>{" "}
            ·{" "}
            <Link to="/payments" className="text-link">
              Hóa đơn & QR
            </Link>
          </Panel>
        )}
        <div className="sport-tabs">
          <button
            className={sport === "all" ? "selected" : ""}
            onClick={() => setSport("all")}
          >
            Tất cả bộ môn
          </button>
          {Object.entries(sports).map(([id, name]) => (
            <button
              key={id}
              className={sport === id ? "selected" : ""}
              onClick={() => setSport(String(id))}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="list-toolbar">
        <div>
          <strong>{rows.length} lớp học</strong>
          <span className="muted">
            {coach
              ? "Được phân công cho bạn"
              : "Cùng tìm một hoạt động yêu thích"}
          </span>
        </div>
        <div className="table-filters">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm lớp học..."
          />
          <Select label="Trạng thái lớp" value={status} onChange={setStatus}>
            <option value="SCHEDULED">Đang mở</option>
            <option value="CANCELLED">Đã hủy</option>
            <option value="all">Tất cả trạng thái</option>
          </Select>
          <div className="view-toggle">
            <button
              aria-label="Xem dạng thẻ"
              aria-pressed={view === "grid"}
              className={view === "grid" ? "selected" : ""}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              aria-label="Xem dạng bảng"
              aria-pressed={view === "list"}
              className={view === "list" ? "selected" : ""}
              onClick={() => setView("list")}
            >
              <List size={17} />
            </button>
          </div>
        </div>
      </div>
      {classes.isPending || (eligibleOnly && accessLoading && !accessError) ? (
        <Loading />
      ) : classes.error ? (
        <ErrorState error={classes.error} retry={classes.refetch} />
      ) : !rows.length ? (
        <Panel>
          <Empty
            title="Chưa tìm thấy lớp phù hợp"
            description="Thử thay đổi bộ môn hoặc điều kiện tìm kiếm."
          />
        </Panel>
      ) : view === "grid" ? (
        <div className="class-card-grid">
          {rows.map((c) => (
            <ClassCard
              key={c.id}
              item={c}
              coachName={
                users.data?.find((u) => u.id === c.coachId)?.fullName ||
                `Huấn luyện viên #${c.coachId}`
              }
              demo={demo}
              onView={() => setSelected(c)}
              onEdit={manager ? () => setEdit(c) : undefined}
            />
          ))}
        </div>
      ) : (
        <Panel>
          <DataTable
            rows={rows}
            columns={[
              {
                key: "name",
                label: "Lớp học",
                render: (c) => (
                  <button className="table-name" onClick={() => setSelected(c)}>
                    {c.className}
                  </button>
                ),
              },
              {
                key: "time",
                label: "Lịch học",
                render: (c) => (
                  <div className="contact-cell">
                    <span>{dateLabel(c.scheduleTime)}</span>
                    <small>
                      {timeLabel(c.scheduleTime)} · {c.durationMinutes} phút
                    </small>
                  </div>
                ),
              },
              {
                key: "coach",
                label: "Huấn luyện viên",
                render: (c) =>
                  users.data?.find((u) => u.id === c.coachId)?.fullName ||
                  `HLV #${c.coachId}`,
              },
              {
                key: "accessLevel",
                label: "Cấp độ yêu cầu",
                render: (c) => c.requiredAccessLevel,
              },
              {
                key: "capacity",
                label: "Sức chứa",
                render: (c) => `${c.maxCapacity} người`,
              },
              {
                key: "status",
                label: "Trạng thái",
                render: (c) => <Badge status={c.status} />,
              },
              {
                key: "actions",
                label: "Thao tác",
                render: (c) => (
                  <button
                    className="subtle-link"
                    onClick={() => (manager ? setEdit(c) : setSelected(c))}
                  >
                    {manager ? "Chỉnh sửa" : "Chi tiết"}
                    <ArrowUpRight size={14} />
                  </button>
                ),
              },
            ]}
          />
        </Panel>
      )}
      {edit && (
        <ClassForm
          item={edit === true ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}
      {selected && (
        <ClassDetail
          item={selected}
          onClose={() => setSelected(null)}
          onEdit={
            manager
              ? () => {
                  setSelected(null);
                  setEdit(selected);
                }
              : undefined
          }
          onCancel={
            manager
              ? () => {
                  setSelected(null);
                  setCancel(selected);
                }
              : undefined
          }
        />
      )}
      {cancel && (
        <Confirm
          title="Hủy lớp học?"
          description={`Lớp ${cancel.className} sẽ bị hủy cùng toàn bộ đăng ký liên quan.`}
          onClose={() => setCancel(null)}
          onConfirm={async () => {
            /**
             * Hủy cả lớp theo quyền quản lý; không nhầm với api.cancelBooking hủy chỗ
             * của một học viên. Dữ liệu các màn liên quan được lấy lại sau khi lưu.
             */
            await api.cancelClass(cancel.id);
            await client.invalidateQueries();
            toast("Đã hủy lớp và các đăng ký liên quan.");
          }}
        />
      )}
    </>
  );
}
/**
 * Thẻ lớp hiển thị lịch, HLV và sức chứa. Query capacity lấy số chỗ còn lại
 * riêng theo ID lớp; không đoán chỗ trống bằng maxCapacity.
 */
function ClassCard({
  item: c,
  coachName,
  demo,
  onView,
  onEdit,
}: {
  item: SportClass;
  coachName: string;
  demo: boolean;
  onView: () => void;
  onEdit?: () => void;
}) {
  const { sports, rooms } = useCatalog();
  const capacity = useQuery({
    queryKey: ["capacity", c.id],
    queryFn: () => api.capacity(c.id),
  });
  const available = capacity.data;
  const full = available === 0;
  return (
    <article className="class-card">
      <div className={`class-card-art sport-${c.sportId}`}>
        <div className="class-art-circle" />
        <span className="class-sport-label">
          {sports[c.sportId] || (demo ? "Thể thao" : `Bộ môn #${c.sportId}`)}
        </span>
        <Dumbbell className="class-art-icon" size={84} strokeWidth={0.8} />
        <span className="class-art-word">
          {(sports[c.sportId] || "MOVE").toUpperCase()}
        </span>
        <span className="class-level">{c.durationMinutes} PHÚT</span>
        {onEdit && (
          <button
            className="class-edit"
            aria-label={`Chỉnh sửa ${c.className}`}
            onClick={onEdit}
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
      <div className="class-card-body">
        <div className="class-card-title">
          <h2>{c.className}</h2>
          <span className={`availability ${full ? "full" : ""}`}>
            <span />
            {c.status === "CANCELLED"
              ? "Đã hủy"
              : capacity.error
                ? "Chưa tải được chỗ trống"
                : available === undefined
                  ? "Đang kiểm tra"
                  : full
                    ? "Đã đủ chỗ"
                    : `Còn ${available} chỗ`}
          </span>
        </div>
        <div className="class-card-coach">
          <Avatar name={coachName} size="small" index={c.coachId} />
          <span>{coachName}</span>
        </div>
        <div className="class-card-meta">
          <span>Cấp độ: {c.requiredAccessLevel}</span>
          <span>
            <CalendarDays size={15} />
            {dateLabel(c.scheduleTime, {
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
            })}
          </span>
          <span>
            <Clock3 size={15} />
            {timeLabel(c.scheduleTime)}
          </span>
          <span>
            <MapPin size={15} />
            {rooms[c.roomId] || `Phòng #${c.roomId}`}
          </span>
        </div>
        <div className="capacity-bar">
          <span
            style={{
              width: `${available !== undefined ? Math.min(100, ((c.maxCapacity - available) / c.maxCapacity) * 100) : 0}%`,
            }}
          />
        </div>
        <div className="class-card-bottom">
          <span>
            <Users size={14} />
            {available !== undefined
              ? `${c.maxCapacity - available}/${c.maxCapacity}`
              : `Tối đa ${c.maxCapacity}`}{" "}
            thành viên
          </span>
          <button onClick={onView}>
            Xem lớp học
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
/**
 * Ghép dữ liệu lớp, capacity và danh sách booking để xem chi tiết.
 * Chỉ nhân viên có quyền mới tải danh sách đăng ký; học viên không gọi endpoint
 * roster của người khác. Nút đăng ký mở form kiểm tra gói còn hiệu lực và chỗ trống.
 */
export function ClassDetail({
  item: c,
  onClose,
  onEdit,
  onCancel,
}: {
  item: SportClass;
  onClose: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
}) {
  const { sports, rooms } = useCatalog();
  const users = useUsers();

  const [showCoach, setShowCoach] = useState(false);
  const [booking, setBooking] = useState(false);
  const { session } = useAuth();
  const can = usePermissions();

  const capacity = useQuery({
    queryKey: ["capacity", c.id],
    queryFn: () => api.capacity(c.id),
  });
  const bookings = useQuery({
    queryKey: ["classBookings", c.id],
    queryFn: () => api.bookings(undefined, c.id),
    enabled: can("classes.roster"),
  });
  return (
    <>
      <Modal
        title={c.className}
        description={`${dateLabel(c.scheduleTime)} · ${timeLabel(c.scheduleTime)} · ${c.durationMinutes} phút`}
        onClose={onClose}
        wide
      >
        <div className="class-detail">
          <div className={`class-detail-banner sport-${c.sportId}`}>
            <Dumbbell size={50} strokeWidth={1} />
            <div>
              <span>{sports[c.sportId] || `Bộ môn #${c.sportId}`}</span>
              <h3>
                Find your balance.
                <br />
                Build your strength.
              </h3>
            </div>
            <Badge status={c.status} />
          </div>
          <div className="detail-grid">
            <div>
              <span>Cấp độ yêu cầu</span>
              <strong>{c.requiredAccessLevel}</strong>
            </div>
            <div>
              <span>Huấn luyện viên</span>
              <strong>
                {users.data?.find((u) => u.id === c.coachId)?.fullName ||
                  `HLV #${c.coachId}`}
              </strong>
              <button className="text-link" onClick={() => setShowCoach(true)}>
                Xem thông tin HLV
              </button>
            </div>
            <div>
              <span>Địa điểm</span>
              <strong>{rooms[c.roomId] || `Phòng #${c.roomId}`}</strong>
            </div>
            <div>
              <span>Sức chứa</span>
              <strong>{c.maxCapacity} thành viên</strong>
            </div>
            <div>
              <span>Chỗ trống</span>
              <strong>{capacity.data ?? "…"} chỗ</strong>
              {capacity.error && (
                <ErrorState error={capacity.error} retry={capacity.refetch} />
              )}
            </div>
          </div>
          {can("classes.roster") && <h3>Danh sách đăng ký</h3>}
          {can("classes.roster") &&
            (bookings.isPending ? (
              <Loading />
            ) : bookings.error ? (
              <ErrorState error={bookings.error} retry={bookings.refetch} />
            ) : (
              <div className="roster-list">
                {bookings.data
                  ?.filter((b) => b.status === "BOOKED")
                  .map((b) => (
                    <div key={b.id}>
                      <Avatar
                        name={
                          users.data?.find((u) => u.id === b.memberId)
                            ?.fullName || `Thành viên ${b.memberId}`
                        }
                        size="small"
                        index={b.memberId}
                      />
                      <strong>
                        {users.data?.find((u) => u.id === b.memberId)
                          ?.fullName || `Thành viên #${b.memberId}`}
                      </strong>
                      <Badge status={b.status} />
                    </div>
                  ))}
                {!bookings.data?.some((b) => b.status === "BOOKED") && (
                  <p className="muted">Chưa có thành viên đăng ký.</p>
                )}
              </div>
            ))}
          <div className="detail-actions">
            {(session!.user.roleName === "MEMBER" || can("bookings.assist")) &&
              c.status === "SCHEDULED" &&
              parseDate(c.scheduleTime) > new Date() && (
                <Button
                  disabled={
                    capacity.isPending ||
                    !!capacity.error ||
                    (capacity.data ?? 0) <= 0
                  }
                  onClick={() => setBooking(true)}
                >
                  {session!.user.roleName === "MEMBER"
                    ? "Đăng ký lớp học"
                    : "Đăng ký cho thành viên"}
                </Button>
              )}
            {session!.user.roleName === "COACH" && can("attendance.record") && (
              <Link
                className="btn btn-secondary"
                to={"/attendance?classId=" + c.id}
              >
                Điểm danh lớp
              </Link>
            )}
            {onEdit && (
              <Button variant="secondary" onClick={onEdit}>
                <Pencil size={16} />
                Chỉnh sửa
              </Button>
            )}
            {onCancel && c.status !== "CANCELLED" && (
              <Button variant="danger" onClick={onCancel}>
                Hủy lớp
              </Button>
            )}
          </div>
        </div>
      </Modal>
      {booking && (
        <BookingForm classId={c.id} onClose={() => setBooking(false)} />
      )}
      {showCoach &&
        (users.data?.find((u) => u.id === c.coachId) ? (
          <UserProfileModal
            user={users.data.find((u) => u.id === c.coachId)!}
            onClose={() => setShowCoach(false)}
          />
        ) : (
          <Modal
            title={`Huấn luyện viên #${c.coachId}`}
            onClose={() => setShowCoach(false)}
          >
            <Notice>
              Backend chưa cung cấp hồ sơ công khai HLV cho tài khoản này. Mã
              HLV được lấy từ thông tin lớp thật.
            </Notice>
          </Modal>
        ))}
    </>
  );
}
