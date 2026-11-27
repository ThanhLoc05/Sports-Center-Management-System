// [VAI TRÒ] Lớp học. MEMBER: xem lớp, xem chi tiết lớp + HLV, đăng ký lớp. LỄ TÂN: xem lớp, đăng ký hộ thành viên.
import BookingForm from "../components/BookingForm";
import { FlexibleBooking } from "../components/FlexibleBooking";
import { CoachProfileDialog } from "../components/CoachProfile";
import { useDemoData, usePermissions } from "../lib/hooks";
import {
  apiMembershipAccess,
  classEligibility,
  membershipAccess,
} from "../lib/entitlements";

/**
 * FLOW 2 — QUẢN LÝ LỚP, PHÂN CÔNG HLV VÀ XEM LỊCH.
 * ClassForm dùng chung cho tạo/sửa; Classes là danh sách; ClassDetail xem chi tiết
 * và xem sức chứa. Cùng dữ liệu lớp được tái sử dụng trong lịch hoạt động.
 */
import { useCatalog } from "../lib/catalog";
import ClassCancellationDialog from "../components/ClassCancellationDialog";
import MemberBookingCancellation, { bookingCancellationBlocker, type MemberCancellationAction } from "../components/MemberBookingCancellation";
import MemberSessionDetail, { SessionDetailDialog } from "../components/MemberSessionDetail";
import { SchedulingFilterOptions, compatibleResourceSelection } from "../components/SchedulingFilterOptions";
import { sportVisual, sportImage } from "../lib/sport-visuals";
import "../styles-sports.css";
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
import { useCourseFeature } from "../lib/course-feature";
import { useClasses, useUsers } from "../lib/hooks";
import { ApiError, api, request } from "../lib/api";
import { operations } from "../lib/operations-api";
import { SCHEDULING_SLOTS, slotForSession, vietnamScheduleParts } from "../lib/scheduling-slots";
import { matchesSchedulingSport, schedulingSportIds } from "../lib/scheduling-resources";

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
  Notice,
  Confirm,
  DataTable,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Loading,
  Modal,
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
  fixedSlots = true,
  onClose,
  dialogClassName,
}: {
  item?: SportClass;
  fixedSlots?: boolean;
  onClose: () => void;
  dialogClassName?: string;
}) {
  // [API] useCatalog() (hook trong lib/catalog.ts) → api.sports → GET /sports; api.rooms → GET /rooms
  const catalog = useCatalog();
  const { sports, rooms } = catalog;
  const originalSlot = item && slotForSession(item);
  const [slotCode, setSlotCode] = useState(item ? originalSlot?.code ?? "legacy" : "");
  const currentDate = localDate();
  const original = item && vietnamScheduleParts(item.scheduleTime);
  const legacySlot = fixedSlots && slotCode === "legacy";
  const selectedSlot = SCHEDULING_SLOTS.find(slot => slot.code === slotCode);
  // [API] useUsers() (hook trong lib/hooks.ts) → api.users → GET /users
  const users = useUsers();
  const checkResources = fixedSlots && !item?.courseId && !item?.regularClassId;
  const [sportId, setSportId] = useState(item?.sportId ?? 0);
  const [roomId, setRoomId] = useState(item?.roomId ?? 0);
  const [coachId, setCoachId] = useState(item?.coachId ?? 0);
  const profiles = useQuery({ queryKey: ["coaches"], queryFn: api.coaches, enabled: checkResources });
  const eligibleCoaches = sportId ? (profiles.data ?? []).filter(({ specialties }) =>
    matchesSchedulingSport(specialties, sportId, sports)) : [];
  const eligibleRooms = Object.entries(rooms).filter(([, name]) =>
    !checkResources || (sportId > 0 && matchesSchedulingSport(name, sportId, sports)));

  const client = useQueryClient();
  const toast = useToast();
  return (
    // [NÚT] FORM "Chỉnh sửa lớp học, nút "Lưu lớp học"" → gọi API api.saveClass → POST /classes/{id} | /classes
    <FormModal
      title={item ? "Chỉnh sửa lớp học" : "Tạo lớp học mới"}
      className={dialogClassName}
      description="Lịch học, không gian và người đồng hành cho mỗi buổi tập."
      wide
      submitDisabled={catalog.loading || !!catalog.error || (checkResources && (profiles.isPending || profiles.isError))}
      onClose={onClose}
      submitLabel={item ? "Lưu lớp học" : "Tạo lớp học"}
      onSubmit={async (data) => {
        /**
         * Gửi dữ liệu form cùng item?.id; API chọn POST/PUT. Chỉ sau khi chờ lưu thành công
         * mới invalidate cache và báo hoàn tất. FormModal sẽ giữ form nếu có lỗi.
         */
        // [API] api.saveClass → POST /classes/{id} | /classes
        const slotSchedule = fixedSlots && selectedSlot ? `${String(data.get("scheduleDate"))}T${selectedSlot.start}:00` : undefined;
        if (fixedSlots && !legacySlot && !slotSchedule) throw new Error("Chọn một ca học.");
        const input = {
            className: String(data.get("className")).trim(),
            sportId: Number(data.get("sportId")),
            coachId: Number(data.get("coachId")),
            roomId: Number(data.get("roomId")),
            maxCapacity: Number(data.get("maxCapacity")),
            scheduleTime: legacySlot && item
              ? item.scheduleTime
              : slotSchedule ?? String(data.get("scheduleTime")),
            durationMinutes: legacySlot && item
              ? item.durationMinutes
              : slotSchedule ? selectedSlot!.durationMinutes : Number(data.get("durationMinutes")),
            requiredAccessLevel: data.get("requiredAccessLevel") as AccessLevel,
            status: item?.status || "SCHEDULED",
        };
        await api.saveClass(input, item?.id);
        toast(item ? "Đã cập nhật lớp học." : "Đã tạo lớp học mới.");
        await client.invalidateQueries();
      }}
    >
      {(catalog.loading || (checkResources && profiles.isPending)) && <Loading />}
      {catalog.error && (
        <ErrorState error={catalog.error} retry={catalog.retry} />
      )}
      {checkResources && profiles.error && <ErrorState error={profiles.error} retry={profiles.refetch} />}
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
          <select name="sportId" required value={sportId || ""} onChange={(event) => setSportId(Number(event.target.value))}>
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
          <select name="roomId" required disabled={checkResources && !sportId}
            value={eligibleRooms.some(([id]) => Number(id) === roomId) ? roomId : ""}
            onChange={(event) => setRoomId(Number(event.target.value))}>
            <option value="" disabled>
              Chọn phòng tập
            </option>
            {eligibleRooms.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Huấn luyện viên">
          {checkResources ? (
            <select name="coachId" required disabled={!sportId || profiles.isPending}
              value={eligibleCoaches.some((coach) => coach.coachId === coachId) ? coachId : ""}
              onChange={(event) => setCoachId(Number(event.target.value))}>
              <option value="" disabled>Chọn huấn luyện viên</option>
              {eligibleCoaches.map((coach) => (
                <option key={coach.coachId} value={coach.coachId}>{coach.fullName}</option>
              ))}
            </select>
          ) : users.data?.some((u) => u.roleName === "COACH") ? (
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
        {fixedSlots ? (
          <>
            <Field label="Ngày học (giờ Việt Nam)">
              <input
                type="date"
                name="scheduleDate"
                required
                disabled={legacySlot}
                min={original && original.date < currentDate ? original.date : currentDate}
                defaultValue={original?.date ?? localDate(addDays(1))}
              />
            </Field>
            <Field label="Ca học">
              <select required value={slotCode} onChange={event => setSlotCode(event.target.value)}>
                <option value="" disabled>Chọn ca 90 phút</option>
                {item && !originalSlot && (
                  <option value="legacy">Giữ giờ cũ ({original?.time}, {item.durationMinutes} phút)</option>
                )}
                {SCHEDULING_SLOTS.map(slot => (
                  <option key={slot.code} value={slot.code}>{slot.label} — {slot.start}–{slot.end}</option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </FormModal>
  );
}
function lacksManagementEndpoint(error: unknown) {
  return error instanceof ApiError && error.status === 400 && error.message === 'For input string: "management"';
}

export default function Classes() {
  // [API] useCatalog() (hook trong lib/catalog.ts) → api.sports → GET /sports; api.rooms → GET /rooms
  const { sports, rooms } = useCatalog();
  const { session } = useAuth();
  const can = usePermissions();
  const db = useDemoData();
  const member = session!.user.roleName === "MEMBER";
  const [eligibleOnly, setEligibleOnly] = useState(member);
  const access = db && member ? membershipAccess(db, session!.user.id) : null;
  const apiMember = member && session!.mode === "api";
  const activeMembership = useQuery({
    queryKey: ["activeSubscription", session!.user.id],
    // [API] api.activeSubscription → GET /memberships/members/{memberId}/active
    queryFn: () => api.activeSubscription(session!.user.id),
    enabled: apiMember,
  });
  const membershipPackages = useQuery({
    queryKey: ["membershipPackages"],
    // [API] api.membershipPackages → GET /memberships/packages
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
  const [params, setParams] = useSearchParams();
  const managed = session!.user.roleName === "CENTER_MANAGER" && !demo;
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    coachId: "", roomId: "", fromDate: "", throughDate: "", slot: "",
  });
  function changeFilter(key: keyof typeof filters, value: string) {
    setPage(0);
    setFilters(current => ({ ...current, [key]: value }));
  }
  const invalidRange = !!filters.fromDate && !!filters.throughDate && filters.throughDate < filters.fromDate;
  const anyFilterActive = Object.values(filters).some(Boolean);
  const [search, setSearch] = useState(params.get("q") || "");
  const [sport, setSport] = useState("all");
  const [localStatus, setLocalStatus] = useState("SCHEDULED");
  const status = managed ? params.get("status") || "SCHEDULED" : localStatus;
  function changeStatus(nextStatus: string) {
    setPage(0);
    if (!managed) {
      setLocalStatus(nextStatus);
      return;
    }
    setParams(current => {
      const next = new URLSearchParams(current);
      if (nextStatus === "SCHEDULED") next.delete("status");
      else next.set("status", nextStatus);
      return next;
    });
  }
  const [view, setView] = useState(managed ? "list" : "grid");
  const [edit, setEdit] = useState<SportClass | true | null>(
    params.get("new") === "1" && manager ? true : null,
  );
  const [selected, setSelected] = useState<SportClass | null>(null);
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);
  const [cancel, setCancel] = useState<SportClass | null>(null);
  // [API] useClasses() (hook trong lib/hooks.ts) → api.classes → GET /classes/my-classes | /classes…
  const managedClasses = useQuery({
    queryKey: ["managed-classes", session!.user.id, status, sport, search, page, filters],
    queryFn: () => anyFilterActive
      ? api.managedClasses(status, sport, search.slice(0, 150), page, filters)
      : api.managedClasses(status, sport, search.slice(0, 150), page),
    enabled: managed && !invalidRange,
    retry: (count, error) => !lacksManagementEndpoint(error) && count < 2,
  });
  const legacyManagement = lacksManagementEndpoint(managedClasses.error);
  const useManagedList = managed && !legacyManagement;
  const classes = useClasses({ enabled: !useManagedList });
  const classList = useManagedList ? managedClasses : classes;
  const linkedId = managed ? Number(params.get("classId")) : 0;
  const linkedClass = useQuery({
    queryKey: ["classDetail", linkedId, session!.user.id],
    queryFn: () => api.classDetail(linkedId),
    enabled: managed && Number.isSafeInteger(linkedId) && linkedId > 0,
  });
  const viewedClass = selected ?? (linkedId > 0 ? linkedClass.data : null);
  function closeClass() {
    setSelected(null);
    if (linkedId > 0) setParams(current => {
      const next = new URLSearchParams(current);
      next.delete("classId");
      return next;
    });
  }
  const coaches = useQuery({
    queryKey: ["coach-directory"],
    // [API] api.coaches → GET /users/coaches
    queryFn: api.coaches,
    enabled: member || managed,
    retry: false,
  });
  const users = useUsers();
  const coachDirectory = new Map((coaches.data ?? []).map(profile => [profile.coachId, profile]));
  if (managed) for (const user of users.data ?? []) {
    if (user.roleName === "COACH" && !coachDirectory.has(user.id)) {
      coachDirectory.set(user.id, { coachId: user.id, fullName: user.fullName, specialties: user.specialties ?? null,
        professionalLevel: null, bio: null });
    }
  }
  const coachOptions = managed ? [...coachDirectory.values()].map(({ coachId, fullName, specialties }) => ({
    id: String(coachId), name: fullName, sportIds: schedulingSportIds(specialties, sports),
  })) : [];
  const roomOptions = managed ? Object.entries(rooms).map(([id, name]) => ({
    id, name, sportIds: schedulingSportIds(name, sports),
  })) : [];
  function changeSport(nextSport: string) {
    setPage(0);
    setSport(nextSport);
    if (!managed) return;
    setFilters(current => ({
      ...current,
      coachId: compatibleResourceSelection(coachOptions, current.coachId, nextSport),
      roomId: compatibleResourceSelection(roomOptions, current.roomId, nextSport),
    }));
  }
  const client = useQueryClient();
  const toast = useToast();
  if (apiMember) {
    return (
      <>
        <PageHeader
          title="Buổi tập theo gói"
          description="Chọn buổi phù hợp với lịch của bạn. Đã bao gồm trong Membership."
          actions={<Link to="/schedule" className="btn btn-secondary">Xem lịch hoạt động</Link>}
        />
        {!apiAccess?.allowed && (
          <Panel title="Quyền lợi gói tập">
            {accessError ? (
              <ErrorState error={accessError} retry={() => {
                void activeMembership.refetch();
                void membershipPackages.refetch();
              }} />
            ) : accessLoading ? <p>Đang kiểm tra quyền lợi gói tập…</p> : (
              <>
                <p>{apiAccess?.reason}</p>
                <Link to="/memberships">Xem gói thành viên</Link>
              </>
            )}
          </Panel>
        )}
        {classes.error && <ErrorState error={classes.error} retry={classes.refetch} />}
        {classes.isPending && <Loading />}
        <FlexibleBooking
          classes={classes.data ?? []}
          sports={sports}
          rooms={rooms}
          coaches={coaches.data ?? []}
          subscription={apiAccess?.allowed ? apiAccess.subscription : null}
          level={apiAccess?.allowed ? apiAccess.accessLevel : null}
          packageName={apiAccess?.allowed ? apiAccess.pkg.packageName : undefined}
          search={params.get("q") ?? ""}
          onView={setSelected}
        />
        {selected && <ClassDetail item={selected} onClose={() => setSelected(null)} />}
      </>
    );
  }
  /**
   * Lọc danh sách lớp đã tải theo từ khóa, bộ môn và trạng thái; không tạo thêm
   * request tìm kiếm mỗi khi gõ. HLV đã có bộ lọc coachId ở useClasses.
   */
  const localRows = (classes.data || []).filter(
    (c) =>
      (demo || (!c.regularClassId && !c.courseId)) &&
      matches(search, c.className) &&
      (!eligibleOnly || (db && classEligibility(db, c.id, session!.user.id).allowed)) &&
      (sport === "all" || c.sportId === Number(sport)) &&
      (status === "all" || c.status === status),
  );
  const rows: (SportClass & { cancellationReason?: string | null; bookedCount?: number })[] = useManagedList
    ? (managedClasses.data?.items ?? []).map(({ session: item, cancellationReason, bookedCount }) => ({ ...item, cancellationReason, bookedCount }))
    : localRows;
  const total = useManagedList ? managedClasses.data?.total ?? 0 : rows.length;
  return (
    <>
      <PageHeader
        eyebrow="FIND YOUR MOVEMENT"
        title={demo ? (coach ? "Lớp học phụ trách" : "Lớp học") : "Buổi tập theo gói"}
        description={managed
          ? "Lập lịch và quản lý từng buổi tập đã công bố."
          : demo
            ? "Tìm nhịp tập của bạn. Kết nối cùng những người chung năng lượng."
            : "Xem và đăng ký từng buổi theo ngày, giờ và huấn luyện viên."}
        actions={
          <>
            <Link to="/schedule" className="btn btn-secondary">
              <CalendarDays size={16} />
              Xem lịch hoạt động
            </Link>
            {managed && (
              <Link to="/classes/weekly-template" className="btn btn-primary">Lịch tuần mẫu</Link>
            )}
            {manager && (
              // [NÚT] NÚT "Tạo lớp học" → mở/đóng hộp thoại hoặc form (setEdit)
              <Button onClick={() => setEdit(true)}>
                <Plus size={17} />
                {demo ? "Tạo lớp học" : "Tạo buổi lẻ"}
              </Button>
            )}
          </>
        }
      />
      {member && (
        <Panel className="panel-spaced" title="Huấn luyện viên">
          {coaches.isPending ? (
            <Loading />
          ) : coaches.error ? (
            <ErrorState error={coaches.error} retry={coaches.refetch} />
          ) : coaches.data.length ? (
            <div className="roster-list class-coach-directory">
              {coaches.data.map((coachProfile) => (
                <div key={coachProfile.coachId}>
                  <strong>{coachProfile.fullName}</strong>
                  <span>
                    {coachProfile.professionalLevel || "Chưa cập nhật trình độ"}
                    {coachProfile.specialties
                      ? ` · ${coachProfile.specialties}`
                      : ""}
                  </span>
                  {/* [NÚT] NÚT "Xem thông tin" → mở/đóng hộp thoại hoặc form (setSelectedCoachId) */}
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedCoachId(coachProfile.coachId)}
                  >
                    Xem thông tin
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Chưa có huấn luyện viên đang hoạt động.</p>
          )}
        </Panel>
      )}
      <div className="class-filter-bar">
        {member && (
          <Panel
            className="class-membership-panel"
            title="Lớp học theo gói của tôi"
          >
            {/* Tách thông tin, bộ lọc và liên kết thành các khối dễ đọc. */}
            <div className="class-membership-content">
              <div className="class-membership-overview">
                <p>
                  {access?.pkg
                    ? `${access.pkg.name} · ${access.reason}`
                    : "Đăng ký gói tập để chọn lớp phù hợp."}
                </p>
                <label className="check-option">
                  <input
                    type="checkbox"
                    checked={eligibleOnly}
                    onChange={(e) => setEligibleOnly(e.target.checked)}
                  />
                  <span>Chỉ xem lớp phù hợp gói</span>
                </label>
              </div>
              <nav
                className="class-membership-actions"
                aria-label="Thao tác gói tập"
              >
                <Link to="/memberships" className="btn btn-secondary">
                  Xem / đổi gói tập
                </Link>
                <Link to="/payments" className="text-link">
                  Hóa đơn & QR
                </Link>
              </nav>
            </div>
          </Panel>
        )}
        <div className="sport-tabs">
          {/* [NÚT] NÚT "Tất cả bộ môn" → đổi cách hiển thị / bộ lọc trên màn hình (setSport) */}
          <button
            className={sport === "all" ? "selected" : ""}
            onClick={() => changeSport("all")}
          >
            Tất cả bộ môn
          </button>
          {Object.entries(sports).map(([id, name]) => (
            // [NÚT] NÚT (nút biểu tượng) → đổi cách hiển thị / bộ lọc trên màn hình (setSport)
            <button
              key={id}
              className={sport === id ? "selected" : ""}
              onClick={() => changeSport(id)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="list-toolbar">
        <div>
          <strong>{total} lớp học</strong>
          <span className="muted">
            {coach
              ? "Được phân công cho bạn"
              : "Cùng tìm một hoạt động yêu thích"}
          </span>
        </div>
        <div className="table-filters">
          <SearchInput
            value={search}
            onChange={(value) => { setPage(0); setSearch(value); }}
            placeholder="Tìm lớp học..."
          />
          <Select label="Trạng thái lớp" value={status} onChange={changeStatus}>
            <option value="SCHEDULED">Đang mở</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="CANCELLED">Đã hủy</option>
            <option value="all">Tất cả trạng thái</option>
          </Select>
          <div className="view-toggle">
            {/* [NÚT] NÚT "Xem dạng thẻ" → mở/đóng hộp thoại hoặc form (setView) */}
            <button
              aria-label="Xem dạng thẻ"
              aria-pressed={view === "grid"}
              className={view === "grid" ? "selected" : ""}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            {/* [NÚT] NÚT "Xem dạng bảng" → mở/đóng hộp thoại hoặc form (setView) */}
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
      {useManagedList && (
        <div className="class-management-filters">
          <Field label="Từ ngày">
            <input type="date" value={filters.fromDate} onChange={event => changeFilter("fromDate", event.target.value)} />
          </Field>
          <Field label="Đến ngày">
            <input type="date" value={filters.throughDate} min={filters.fromDate || undefined} onChange={event => changeFilter("throughDate", event.target.value)} />
          </Field>
          <Field label="Lọc theo ca">
            <select value={filters.slot} onChange={event => changeFilter("slot", event.target.value)}>
              <option value="">Tất cả ca</option>
              {SCHEDULING_SLOTS.map(slot => <option value={slot.code} key={slot.code}>{slot.label} — {slot.start}–{slot.end}</option>)}
            </select>
          </Field>
          <Field label="Lọc theo HLV">
            <select value={filters.coachId} onChange={event => changeFilter("coachId", event.target.value)}>
              <option value="">Tất cả HLV</option>
              <SchedulingFilterOptions resources={coachOptions} sport={sport} sports={sports} />
            </select>
          </Field>
          <Field label="Lọc theo sân/phòng">
            <select value={filters.roomId} onChange={event => changeFilter("roomId", event.target.value)}>
              <option value="">Tất cả sân/phòng</option>
              <SchedulingFilterOptions resources={roomOptions} sport={sport} sports={sports} />
            </select>
          </Field>
        </div>
      )}
      {legacyManagement && status === "CANCELLED" && (
        <Notice>Backend hiện tại chưa hỗ trợ phân trang lịch sử hoặc hiển thị lý do trên danh sách. Mở chi tiết để xem lý do nếu có.</Notice>
      )}
      {invalidRange ? (
        <Notice>Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</Notice>
      ) : classList.isPending ? (
        <Loading />
      ) : classList.error ? (
        <ErrorState error={classList.error} retry={classList.refetch} />
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
              coachName={<ClassCoachName coachId={c.coachId} />}
              demo={demo}
              cancellationReason={c.cancellationReason}
              onView={() => setSelected(c)}
              onEdit={manager && (!managed || c.status !== "CANCELLED") ? () => setEdit(c) : undefined}
            />
          ))}
        </div>
      ) : (
        <Panel>
          <DataTable
            rows={rows}
            showPagination={!useManagedList}
            columns={[
              {
                key: "name",
                label: "Lớp học",
                render: (c) => (
                  // [NÚT] NÚT (nút biểu tượng) → mở/đóng hộp thoại hoặc form (setSelected)
                  <button className="table-name" onClick={() => setSelected(c)}>
                    {c.className}
                  </button>
                ),
              },
              {
                key: "time",
                label: "Lịch học",
                render: (c) => {
                  const slot = slotForSession(c);
                  return (
                    <div className="contact-cell">
                      <span>{dateLabel(c.scheduleTime)}</span>
                      <small>{managed && slot
                        ? `${slot.label} · ${slot.start}–${slot.end}`
                        : `${timeLabel(c.scheduleTime)} · ${c.durationMinutes} phút${managed ? " · Ngoài khung ca" : ""}`}</small>
                    </div>
                  );
                },
              },
              ...(managed ? [{
                key: "sport",
                label: "Bộ môn",
                render: (c: (typeof rows)[number]) => sports[c.sportId] || `Môn #${c.sportId}`,
              }] : []),
              {
                key: "coach",
                label: "Huấn luyện viên",
                render: (c) => <ClassCoachName coachId={c.coachId} />,
              },
              ...(managed ? [{
                key: "room",
                label: "Sân/phòng",
                render: (c: (typeof rows)[number]) => (
                  <div className="contact-cell">
                    <span>{rooms[c.roomId] || `Phòng #${c.roomId}`}</span>
                    {c.cancellationReason && <small>Lý do hủy: {c.cancellationReason}</small>}
                  </div>
                ),
              }] : []),
              ...(!managed ? [{
                key: "accessLevel",
                label: "Cấp độ yêu cầu",
                render: (c: (typeof rows)[number]) => c.requiredAccessLevel,
              }] : []),
              {
                key: "capacity",
                label: managed ? "Đăng ký" : "Sức chứa",
                render: (c) => c.bookedCount === undefined
                  ? `${c.maxCapacity} chỗ`
                  : `${c.bookedCount}/${c.maxCapacity} học viên`,
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
                  // [NÚT] NÚT "Chỉnh sửa / Chi tiết" → mở/đóng hộp thoại hoặc form (setEdit)
                  <button
                    className="subtle-link"
                    onClick={() => manager && (!managed || c.status !== "CANCELLED") ? setEdit(c) : setSelected(c)}
                  >
                    {manager && (!managed || c.status !== "CANCELLED") ? "Chỉnh sửa" : "Chi tiết"}
                    <ArrowUpRight size={14} />
                  </button>
                ),
              },
            ]}
          />
        </Panel>
      )}
      {useManagedList && managedClasses.data && (managedClasses.data.pageCount > 1 || page > 0) && (
        <div className="table-footer" aria-label="Phân trang buổi học">
          <span>Trang {page + 1} / {Math.max(managedClasses.data.pageCount, page + 1)}</span>
          <div className="pagination">
            <Button disabled={page === 0} onClick={() => setPage(page - 1)}>Trang trước</Button>
            <Button disabled={page + 1 >= managedClasses.data.pageCount} onClick={() => setPage(page + 1)}>Trang sau</Button>
          </div>
        </div>
      )}
      {edit && (
        <ClassForm
          item={edit === true ? undefined : edit}
          fixedSlots={!demo}
          onClose={() => setEdit(null)}
        />
      )}
      {linkedId > 0 && linkedClass.isPending && <Loading />}
      {linkedClass.error && <ErrorState error={linkedClass.error} retry={linkedClass.refetch} />}
      {viewedClass && (
        <ClassDetail
          item={viewedClass}
          onClose={closeClass}
          onEdit={
            manager && (!managed || viewedClass.status !== "CANCELLED")
              ? (current) => {
                  closeClass();
                  setEdit(current);
                }
              : undefined
          }
          onCancel={
            manager
              ? (current) => {
                  closeClass();
                  setCancel(current);
                }
              : undefined
          }
        />
      )}
      {selectedCoachId !== null && (
        <CoachProfileDialog
          coachId={selectedCoachId}
          onClose={() => setSelectedCoachId(null)}
        />
      )}
      {cancel && !demo && (
        <ClassCancellationDialog item={cancel} onClose={() => setCancel(null)} onSaved={async () => {
          await client.invalidateQueries();
          toast("Đã hủy buổi học.");
        }} />
      )}
      {cancel && demo && (
        // [NÚT] HỘP XÁC NHẬN "Hủy lớp học?" → gọi API api.cancelBooking → DELETE /bookings/{id}; api.cancelClass → POST /classes/{id}/cancel | /schedule
        <Confirm
          title="Hủy lớp học?"
          description={`Lớp ${cancel.className} sẽ bị hủy cùng toàn bộ đăng ký liên quan.`}
          onClose={() => setCancel(null)}
          onConfirm={async () => {
            /**
             * Hủy cả lớp theo quyền quản lý; không nhầm với api.cancelBooking hủy chỗ
             * của một học viên. Dữ liệu các màn liên quan được lấy lại sau khi lưu.
             */
            // [API] api.cancelClass → POST /classes/{id}/cancel | /schedule
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
  cancellationReason,
  onView,
  onEdit,
}: {
  item: SportClass;
  coachName: React.ReactNode;
  demo: boolean;
  cancellationReason?: string | null;
  onView: () => void;
  onEdit?: () => void;
}) {
  // [API] useCatalog() (hook trong lib/catalog.ts) → api.sports → GET /sports; api.rooms → GET /rooms
  const { sports, rooms } = useCatalog();
  const visual = sportVisual(sports[c.sportId]);
  const capacity = useQuery({
    queryKey: ["capacity", c.id],
    // [API] api.capacity → GET /classes/{id}/capacity
    queryFn: () => api.capacity(c.id),
  });
  const available = capacity.data;
  const { enabled: courseEnabled } = useCourseFeature();
  const full = available === 0;
  return (
    <article
      className="class-card"
      tabIndex={0}
      aria-label={`Xem thông tin lớp ${c.className}`}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("button, a, input, select, textarea")
        )
          return;
        onView();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onView();
        }
      }}
    >
      <div className={`class-card-art sport-${c.sportId}`}>
        {/* Tải ảnh theo bộ môn; lỗi tải thì khung trang trí cũ vẫn hiển thị. */}
        {visual && (
          <img key={visual.image} className="class-sport-image" src={sportImage(visual.image)} alt={visual.alt}
            width={840} height={560} loading="lazy" decoding="async"
            onError={(event) => { event.currentTarget.hidden = true; }} />
        )}
        <div className="class-art-circle" />
        <span className="class-sport-label">
          {sports[c.sportId] || (demo ? "Thể thao" : `Bộ môn #${c.sportId}`)}
        </span>
        <Dumbbell className="class-art-icon" size={84} strokeWidth={0.8} />
        <span className="class-art-word">
          {(sports[c.sportId] || "MOVE").toUpperCase()}
        </span>
        <span className="class-level">{c.durationMinutes} PHÚT</span>
        {onEdit && (courseEnabled || !c.courseId) && (
          // [NÚT] NÚT (nút biểu tượng) → chạy hàm onEdit()
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
              : c.status === "COMPLETED"
                ? "Đã hoàn thành"
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
          <Avatar
            name={`HLV ${c.coachId || ""}`}
            size="small"
            index={c.coachId}
          />
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
        {cancellationReason && <p className="muted">Lý do hủy: {cancellationReason}</p>}
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
          {/* [NÚT] NÚT "Xem lớp học" → chạy hàm onView() */}
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
export function ClassCoachName({ coachId }: { coachId: number }) {
  const { session } = useAuth();
  // [API] useUsers() (hook trong lib/hooks.ts) → api.users → GET /users
  const users = useUsers();
  const directory = useQuery({
    queryKey: ["coach-directory"],
    // [API] api.coaches → GET /users/coaches
    queryFn: api.coaches,
    enabled: session?.mode === "api",
    retry: false,
  });
  if (!Number.isInteger(coachId) || coachId < 1) return <>Chưa phân công HLV</>;
  const name =
    directory.data?.find((c) => c.coachId === coachId)?.fullName?.trim() ||
    users.data?.find((u) => u.id === coachId)?.fullName?.trim();
  if (name) return <>{name}</>;
  if (directory.isError)
    return (
      <>
        Không tải được tên HLV #{coachId}{" "}
        {/* [NÚT] NÚT "Thử lại" → tải lại dữ liệu từ API */}
        <button className="text-link" onClick={() => void directory.refetch()}>
          Thử lại
        </button>
      </>
    );
  if (session?.mode === "api" && directory.isPending)
    return <>Đang tải tên HLV...</>;
  return <>Chưa cập nhật tên HLV #{coachId}</>;
}

export function ClassDetail(props: {
  item: SportClass;
  onClose: () => void;
  onEdit?: (item: SportClass) => void;
  onCancel?: (item: SportClass) => void;
}) {
  const { session } = useAuth();
  const live = session?.mode === "api";
  const [memberAction, setMemberAction] = useState<MemberCancellationAction | null>(null);
  const detail = useQuery({
    queryKey: ["classDetail", props.item.id, session?.user.id],
    // [API] api.classDetail → GET /classes/{id}
    queryFn: () => api.classDetail(props.item.id),
    enabled: live,
    refetchOnMount: "always",
    retry: false,
  });
  // Không dùng object từ danh sách hoặc cache cũ như chi tiết đã được xác nhận.
  const item = live ? detail.data : props.item;
  const confirmation = memberAction?.item.id === props.item.id && session?.user.roleName === "MEMBER"
    ? <MemberBookingCancellation action={item ? { ...memberAction, item } : memberAction} memberId={session.user.id}
        onClose={() => setMemberAction(null)} scheduleDetail />
    : null;
  if (confirmation) return confirmation;
  return (
    <>
      {live && (detail.isPending || detail.isFetching || detail.error || !item) ? (
        <Modal title="Chi tiết buổi tập" onClose={props.onClose}
          className="member-session-modal" wide>
          {detail.error && !detail.isFetching ? (
            <ErrorState error={detail.error} retry={detail.refetch} />
          ) : <Loading />}
        </Modal>
      ) : item && <ClassDetailContent key={item.id} {...props} item={item} onMemberAction={setMemberAction} />}
    </>
  );
}
function ClassDetailContent({
  item: c,
  onClose,
  onEdit,
  onCancel,
  onMemberAction,
}: {
  item: SportClass;
  onClose: () => void;
  onEdit?: (item: SportClass) => void;
  onCancel?: (item: SportClass) => void;
  onMemberAction: (action: MemberCancellationAction) => void;
}) {
  // [API] useCatalog() (hook trong lib/catalog.ts) → api.sports → GET /sports; api.rooms → GET /rooms
  const { sports, rooms } = useCatalog();
  // [API] useUsers() (hook trong lib/hooks.ts) → api.users → GET /users
  const users = useUsers();

  const [showCoach, setShowCoach] = useState(false);
  const [booking, setBooking] = useState(false);
  const { session } = useAuth();
  const can = usePermissions();
  const isMember = session!.user.roleName === "MEMBER";

  const capacity = useQuery({
    queryKey: ["capacity", c.id],
    // [API] api.capacity → GET /classes/{id}/capacity
    queryFn: () => api.capacity(c.id),
  });
  const cancellation = useQuery({
    queryKey: ["classCancellation", session?.user.id, c.id],
    queryFn: () => api.classCancellation(c.id),
    enabled: session?.mode === "api" && (!!onCancel || (isMember && c.status === "CANCELLED")),
    retry: false,
  });
  const { enabled: courseEnabled } = useCourseFeature();
  const ownBookings = useQuery({
    queryKey: ["memberBookings", session!.user.id, c.id],
    queryFn: async () =>
      // [API] api.bookings → GET /classes/{classId}/bookings | /members/{memberId}/bookings
      (await api.bookings(session!.user.id)).filter(
        (booking) => booking.classId === c.id,
      ),
    enabled: isMember,
  });
  const ownBooking = ownBookings.data?.find((booking) =>
    booking.memberId === session!.user.id && ["BOOKED", "ACTIVE", "CONFIRMED"].includes(booking.status));
  const cancelledBooking = ownBookings.data?.some((booking) =>
    booking.memberId === session!.user.id && booking.status === "CANCELLED");
  const flexible = !c.regularClassId && !c.courseId;
  const blocker = bookingCancellationBlocker(c);
  const waitlist = useQuery({
    queryKey: ["booking-waitlist", session!.user.id],
    queryFn: () => request<{ classId: number; status: string; inviteUntil: string | null }[]>("/bookings/my-waitlist"),
    enabled: isMember && flexible && session?.mode === "api" && !blocker,
    retry: false,
  });
  const waiting = waitlist.data?.find((entry) => entry.classId === c.id);
  const bookings = useQuery({
    queryKey: ["classStudents", session!.user.id, session!.user.roleName, c.id],
    // [API] api.bookings → GET /classes/{classId}/bookings | /members/{memberId}/bookings
    // [API] operations.students → GET /classes/{classId}/students
    queryFn: async () => session!.mode === "api"
      ? (await operations.students(c.id)).map((student) => ({
          id: student.memberId,
          memberId: student.memberId,
          status: student.bookingStatus,
          fullName: student.fullName?.trim(),
        }))
      : (await api.bookings(undefined, c.id)).map((booking) => ({
          ...booking,
          fullName: users.data?.find((u) => u.id === booking.memberId)?.fullName,
        })),
    enabled: can("classes.roster"),
  });
  if (booking) return <BookingForm classId={c.id} onClose={() => setBooking(false)} />;
  if (showCoach) return <CoachProfileDialog coachId={c.coachId} onClose={() => setShowCoach(false)} />;

  const booked = c.bookedCount ?? cancellation.data?.booked
    ?? bookings.data?.filter((row) => row.status === "BOOKED").length;
  const detailProps = {
    item: booked == null ? c : { ...c, bookedCount: booked },
    sport: sports[c.sportId] ?? `Bộ môn #${c.sportId}`,
    room: rooms[c.roomId] ?? `Phòng #${c.roomId}`,
    coach: <ClassCoachName coachId={c.coachId} />,
    capacity: capacity.data,
    capacityError: capacity.isError,
    retryCapacity: () => { void capacity.refetch(); },
    onClose,
    onCoach: () => setShowCoach(true),
  };
  const cancellationReason = cancellation.data?.reason && <Notice>Lý do trung tâm hủy: {cancellation.data.reason}</Notice>;
  if (isMember && flexible) {
    const needsWaitlist = session?.mode === "api" && !blocker && !ownBooking;
    return (
      <MemberSessionDetail {...detailProps} booking={ownBooking} cancelled={cancelledBooking} waiting={waiting}
        notice={cancellationReason}
        registrationLoading={ownBookings.isPending || (needsWaitlist && waitlist.isPending)}
        registrationError={ownBookings.isError || (needsWaitlist && waitlist.isError)}
        retryRegistration={() => { void ownBookings.refetch(); if (needsWaitlist) void waitlist.refetch(); }}
        onBook={() => setBooking(true)} onAction={onMemberAction} />
    );
  }

  const canAssist = flexible && can("bookings.assist") && !isMember;
  const canBook = canAssist && !blocker;
  const canRecord = ["COACH", "RECEPTIONIST"].includes(session!.user.roleName) && can("attendance.record");
  const canEdit = onEdit && (courseEnabled || !c.courseId);
  const canCancel = onCancel && c.status !== "CANCELLED" && (session?.mode === "demo" || cancellation.data?.canCancel);
  const canViewCourse = courseEnabled && c.courseId;
  const viewBookings = canAssist && session?.mode === "api";
  return (
    <SessionDetailDialog {...detailProps} actions={(canViewCourse || canBook || canRecord || canEdit || canCancel || viewBookings) ? <>
      {canViewCourse ? <Link className="btn btn-secondary" to="/courses">Đăng ký theo khóa học</Link> : null}
      {canBook && <Button disabled={capacity.isPending || !!capacity.error || (capacity.data ?? 0) <= 0}
        onClick={() => setBooking(true)}>Đăng ký cho thành viên</Button>}
      {viewBookings && <Link className="btn btn-secondary" to={`/session-bookings?classId=${c.id}`}>Quản lý đăng ký</Link>}
      {canRecord && <Link className="btn btn-secondary" to={`/attendance?classId=${c.id}`}>Điểm danh lớp</Link>}
      {canEdit && <Button variant="secondary" onClick={() => onEdit(c)}><Pencil size={16} /> Chỉnh sửa</Button>}
      {canCancel && <Button variant="danger" onClick={() => onCancel(c)}>Hủy buổi học</Button>}
    </> : null}>
      {cancellationReason}
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
                    b.fullName || `Thành viên ${b.memberId}`
                  }
                  size="small"
                  index={b.memberId}
                />
                <strong>
                  {b.fullName || `Thành viên #${b.memberId}`}
                </strong>
                <Badge status={b.status} />
              </div>
            ))}
          {!bookings.data?.some((b) => b.status === "BOOKED") && (
            <p className="muted">Chưa có thành viên đăng ký.</p>
          )}
        </div>
      ))}
    </SessionDetailDialog>
  );
}
