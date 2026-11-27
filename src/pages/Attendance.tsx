// [VAI TRÒ] Điểm danh. LỄ TÂN: điểm danh thành viên theo lớp. MEMBER: xem lịch sử điểm danh của mình.
/**
 * FLOW 4 — ĐIỂM DANH VÀ LỊCH SỬ CÓ MẶT/VẮNG.
 * Thành viên xem lịch sử của mình; nhân viên/HLV chọn lớp để ghi nhận.
 * Danh sách chưa điểm danh được ghép từ booking BOOKED và dữ liệu attendance.
 */
import { useState } from "react";
import {
  Check,
  ClipboardCheck,
  Clock3,
  ScanLine,
  UserCheck,
  UserX,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";

import { useClasses, useUsers, usePermissions } from "../lib/hooks";
import { api, request } from "../lib/api";
import type { Attendance as AttendanceRecord } from "../lib/types";
import { operations } from "../lib/operations-api";
import {
  addDays,
  dateLabel,
  downloadCsv,
  idLabel,
  isAttendanceWindowOpen,
  localDate,
  matches,
  parseDate,
  timeLabel,
} from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  Empty,
  ErrorState,
  ExportButton,
  Field,
  FormModal,
  Loading,
  MemberField,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  useToast,
} from "../components/ui";
export default function Attendance() {
  const { session } = useAuth();
  const can = usePermissions();
  const [params] = useSearchParams();
  const member = session!.user.roleName === "MEMBER";
  // [API] useClasses() (hook trong lib/hooks.ts) → api.classes → GET /classes/my-classes | /classes…
  const classes = useClasses();
  // Tải tên thành viên cho lễ tân để hiển thị và tìm kiếm trong danh sách điểm danh.
  // [API] useUsers() (hook trong lib/hooks.ts) → api.users → GET /users
  const users = useUsers(true);
  const [classId, setClassId] = useState(params.get("classId") || "");
  const effectiveClassId = classId || String(classes.data?.[0]?.id || "");
  const coachNames = session!.mode === "api" && session!.user.roleName === "COACH";
  const classStudents = useQuery({
    queryKey: ["attendance-students", session!.user.id, session!.user.roleName, effectiveClassId],
    // [API] operations.students → GET /classes/{classId}/students
    queryFn: () => operations.students(Number(effectiveClassId)),
    enabled: coachNames && !!classes.data?.some(
      (c) => c.id === Number(effectiveClassId) && c.coachId === session!.user.id,
    ),
  });
  // Coach dùng roster được cấp quyền của lớp đang chọn, không tải danh mục /users.
  const memberName = (memberId: number) => coachNames
    ? classStudents.data?.find((s) => s.memberId === memberId)?.fullName?.trim()
    : users.data?.find((u) => u.id === memberId)?.fullName;
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState(false);
  const [start, setStart] = useState(localDate(addDays(-30)));
  const [end, setEnd] = useState(localDate());
  const today = localDate();
  const dateError =
    !start || !end
      ? "Chọn đủ ngày bắt đầu và ngày kết thúc."
      : start > end
        ? "Từ ngày phải trước hoặc bằng Đến ngày."
        : end > today
          ? "Đến ngày không được sau hôm nay."
          : "";
  const [pending, setPending] = useState<number | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  /**
   * Lịch sử cá nhân lọc theo ngày. Dữ liệu điểm danh của lớp luôn được tải trọn vẹn.
   */
  const query = useQuery({
    queryKey: member
      ? ["attendance", "member", session!.user.id, start, end]
      : ["attendance", "class", session!.user.id, effectiveClassId],
    queryFn: () =>
      // [API] api.attendance → GET /attendance/classes/{classId} | /attendance/members/{memberId}?startDate={start}&endDate={end}
      member
        ? api.attendance(session!.user.id, undefined, start, end)
        : api.attendance(undefined, Number(effectiveClassId)),
    enabled: member ? !dateError : !!effectiveClassId,
  });
  const bookings = useQuery({
    queryKey: ["classBookings", effectiveClassId],
    // [API] api.bookings → GET /classes/{classId}/bookings | /members/{memberId}/bookings
    queryFn: () => api.bookings(undefined, Number(effectiveClassId)),
    enabled: !member && !!effectiveClassId,
  });
  const rows = (query.data || []).filter((a) =>
    matches(
      search,
      memberName(a.memberId),
      a.memberId,
      idLabel(a.memberId),
    ),
  );
  const present = (query.data || []).filter(
    (a) => a.status === "PRESENT",
  ).length;
  const absent = (query.data || []).filter((a) => a.status === "ABSENT").length;
  const currentClass = classes.data?.find(
    (c) => c.id === Number(effectiveClassId),
  );
  const attendanceOpen = currentClass
    ? currentClass.status !== "CANCELLED" &&
      isAttendanceWindowOpen(currentClass)
    : false;
  const attendanceByMember = new Map(
    query.data?.map((entry) => [entry.memberId, entry]),
  );
  const bookedStudents =
    bookings.data?.filter((booking) => booking.status === "BOOKED") || [];
  const notRecorded = bookedStudents.filter(
    (booking) => !attendanceByMember.has(booking.memberId),
  );
  const canMakeUp =
    attendanceOpen &&
    session!.user.roleName === "COACH" &&
    currentClass?.coachId === session!.user.id;
  const roster = bookedStudents.filter((booking) => {
    const record = attendanceByMember.get(booking.memberId);
    return !record || (record.status === "ABSENT" && canMakeUp);
  });
  /**
   * Gửi memberId người học, classId và checkedInBy là người đang thao tác.
   * pending khóa thao tác tương ứng trong lúc chờ; chỉ báo thành công sau API
   * và luôn bỏ trạng thái chờ ở finally để không bị kẹt khi lỗi.
   */
  async function quickCheck(memberId: number, status: string) {
    const makeup = status === "PRESENT" && query.data?.find(
      (attendance) =>
        attendance.classId === Number(effectiveClassId) &&
        attendance.memberId === memberId &&
        attendance.status === "ABSENT",
    );
    setPending(memberId);
    try {
      if (makeup) {
        // [API] api.makeUpAttendance → PATCH (xem lib/api.ts)
        await api.makeUpAttendance(makeup.id);
      } else {
        // [API] api.checkIn → POST /attendance
        await api.checkIn({
          memberId,
          classId: Number(effectiveClassId),
          checkedInBy: session!.user.id,
          status,
        });
      }
      await client.invalidateQueries();
      toast(
        makeup
          ? "Đã cập nhật điểm danh bù."
          : "Đã ghi nhận điểm danh.",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Không thể điểm danh.", "error");
    } finally {
      setPending(null);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="EVERY VISIT COUNTS"
        title={member ? "Lịch sử điểm danh" : "Điểm danh"}
        description="Ghi nhận sự hiện diện. Trân trọng từng nỗ lực."
        actions={
          <>
            {/* [NÚT] NÚT (nút biểu tượng) → tải file CSV */}
            <ExportButton
              disabled={!query.isSuccess}
              onClick={() =>
                downloadCsv("diem-danh.csv", [
                  ["Mã", "ID thành viên", "ID lớp", "Thời gian", "Trạng thái"],
                  ...rows.map((a) => [
                    a.id,
                    a.memberId,
                    a.classId,
                    a.checkedInAt,
                    a.status,
                  ]),
                ])
              }
            />
            {can("attendance.record") && (
              // [NÚT] NÚT "Điểm danh thành viên" → mở/đóng hộp thoại hoặc form (setCreate)
              <Button disabled={!attendanceOpen} onClick={() => setCreate(true)}>
                <ScanLine size={17} />
                Điểm danh thành viên
              </Button>
            )}
          </>
        }
      />

      <div
        className={
          member
            ? "attendance-controls"
            : "attendance-controls attendance-class-controls"
        }
      >
        {!member && (
          <Field label="Lớp học">
            <select
              value={effectiveClassId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Lớp cần điểm danh"
            >
              {classes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className} · {dateLabel(c.scheduleTime)}{" "}
                  {timeLabel(c.scheduleTime)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {member && (
          <>
            <Field label="Từ ngày">
              <input
                type="date"
                value={start}
                max={end || today}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </Field>
            <Field label="Đến ngày">
              <input
                type="date"
                value={end}
                min={start || undefined}
                max={today}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </Field>
          </>
        )}
        {!member && currentClass && (
          <div className="attendance-class-note">
            <Clock3 size={17} />
            {currentClass.durationMinutes} phút · Tối đa{" "}
            {currentClass.maxCapacity} thành viên · Điểm danh từ 15 phút trước
            giờ bắt đầu đến 60 phút sau khi kết thúc
          </div>
        )}
      </div>
      {member && dateError && (
        <Notice tone="warning">{dateError}</Notice>
      )}
      {coachNames && classStudents.error && (
        <ErrorState error={classStudents.error} retry={classStudents.refetch} />
      )}
      <div className="mini-stats">
        <div>
          <span className="mini-stat-icon green">
            <UserCheck size={22} />
          </span>
          <div>
            <p>Có mặt</p>
            <strong>{query.isSuccess ? present : "—"}</strong>
          </div>
        </div>
        <div>
          <span className="mini-stat-icon orange">
            <UserX size={22} />
          </span>
          <div>
            <p>Vắng mặt</p>
            <strong>{query.isSuccess ? absent : "—"}</strong>
          </div>
        </div>
        <div>
          <span className="mini-stat-icon purple">
            <ClipboardCheck size={22} />
          </span>
          <div>
            <p>
              {member
                ? "Tỷ lệ có mặt · phạm vi đã chọn"
                : "Chưa điểm danh trong lớp"}
            </p>
            <strong>
              {query.isSuccess && (member || bookings.isSuccess)
                ? member
                  ? `${present + absent ? Math.round((present / (present + absent)) * 100) : 0}%`
                  : notRecorded.length
                : "—"}
            </strong>
          </div>
        </div>
      </div>
      {/*
        Thanh tỷ lệ có mặt của thành viên trong khoảng ngày đã chọn.
        Làm sao: dùng lại present/absent đã đếm từ query; dùng chung kiểu .attendance-progress với thanh của HLV.
        Tại sao: con số % dễ hiểu hơn khi có thanh trực quan đi kèm; chỉ hiện khi đã có ít nhất một buổi.
      */}
      {member && query.isSuccess && present + absent > 0 && (
        <div className="attendance-progress">
          <div className="attendance-progress-label">
            <span>Có mặt / tổng buổi đã ghi nhận</span>
            <strong>
              {present}/{present + absent} buổi
            </strong>
          </div>
          <div
            className="attendance-progress-track"
            role="progressbar"
            aria-label="Tỷ lệ có mặt"
            aria-valuemin={0}
            aria-valuemax={present + absent}
            aria-valuenow={present}
          >
            <span style={{ transform: `scaleX(${present / (present + absent)})` }} />
          </div>
        </div>
      )}
      {!member && currentClass && !attendanceOpen && can("attendance.record") && (
        <Notice tone="warning">
          Đã ngoài khung điểm danh. Khung mở từ 15 phút trước giờ học đến 1 giờ
          sau khi kết thúc.
        </Notice>
      )}
      {!member && can("attendance.record") && (
        <Panel
          title="Danh sách điểm danh"
          description={
            canMakeUp
              ? "Gồm học viên chưa điểm danh và học viên vắng có thể điểm danh bù."
              : "Gồm học viên chưa điểm danh trong lớp đã chọn."
          }
        >
          {/*
            Thanh tiến độ điểm danh của lớp: đã ghi nhận / tổng học viên đã đăng ký.
            Làm sao: dùng lại bookedStudents và notRecorded đã tính sẵn, chỉ hiện khi cả hai truy vấn đã tải xong.
            Tại sao: HLV nhìn nhanh còn bao nhiêu người chưa điểm danh mà không phải đếm danh sách.
          */}
          {bookings.isSuccess && query.isSuccess && bookedStudents.length > 0 && (
            <div className="attendance-progress">
              <div className="attendance-progress-label">
                <span>Đã điểm danh</span>
                <strong>
                  {bookedStudents.length - notRecorded.length}/{bookedStudents.length} học viên
                </strong>
              </div>
              <div
                className="attendance-progress-track"
                role="progressbar"
                aria-label="Tiến độ điểm danh"
                aria-valuemin={0}
                aria-valuemax={bookedStudents.length}
                aria-valuenow={bookedStudents.length - notRecorded.length}
              >
                <span
                  style={{
                    transform: `scaleX(${(bookedStudents.length - notRecorded.length) / bookedStudents.length})`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="check-in-roster">
            {(bookings.isPending || query.isPending) && effectiveClassId ? (
              <Loading />
            ) : bookings.error ? (
              <ErrorState error={bookings.error} retry={bookings.refetch} />
            ) : query.error ? (
              <Notice tone="warning">Chưa tải được trạng thái điểm danh của lớp.</Notice>
            ) : roster.length ? (
              roster.map((b) => {
                const name = memberName(b.memberId);
                const makeup =
                  attendanceByMember.get(b.memberId)?.status === "ABSENT";
                return (
                  <div className="check-in-person" key={b.id}>
                    <Avatar
                      name={name || `TV ${b.memberId}`}
                      index={b.memberId}
                    />
                    <div>
                      <strong>
                        {name || `Thành viên #${b.memberId}`}
                      </strong>
                      <small>{idLabel(b.memberId)}</small>
                    </div>
                    {/* [NÚT] NÚT "Điểm danh bù / Có mặt" → gọi API api.makeUpAttendance → PATCH (xem lib/api.ts); api.checkIn → POST /attendance */}
                    <Button
                      variant="secondary"
                      disabled={
                        !attendanceOpen ||
                        pending !== null ||
                        query.isPending ||
                        !!query.error
                      }
                      loading={pending === b.memberId}
                      onClick={() => quickCheck(b.memberId, "PRESENT")}
                    >
                      <Check size={15} />
                      {makeup
                        ? "Điểm danh bù"
                        : "Có mặt"}
                    </Button>
                    {/* [NÚT] NÚT "Vắng" → gọi API api.makeUpAttendance → PATCH (xem lib/api.ts); api.checkIn → POST /attendance */}
                    <button
                      className="text-danger"
                      disabled={
                        !attendanceOpen ||
                        !!makeup ||
                        pending !== null ||
                        query.isPending ||
                        !!query.error
                      }
                      onClick={() => quickCheck(b.memberId, "ABSENT")}
                    >
                      Vắng
                    </button>
                  </div>
                );
              })
            ) : (
              <Empty
                title="Đã sẵn sàng cho buổi tập"
                description="Không còn thành viên nào chờ điểm danh trong lớp được chọn."
              />
            )}
          </div>
        </Panel>
      )}
      <Panel
        title={member ? "Các buổi tập đã ghi nhận" : "Lịch sử đã điểm danh"}
        action={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm thành viên..."
          />
        }
      >
        {member && dateError ? null : query.isPending &&
          (member || effectiveClassId) ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                key: "member",
                label: "Thành viên",
                sort: (a) => memberName(a.memberId) || "",
                render: (a) => {
                  const name = memberName(a.memberId);
                  return (
                    <div className="person-cell">
                      <Avatar
                        name={name || `TV ${a.memberId}`}
                        index={a.memberId}
                        size="small"
                      />
                      <span>
                        <strong>
                          {name || `Thành viên #${a.memberId}`}
                        </strong>
                        <small>{idLabel(a.memberId)}</small>
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "class",
                label: "Lớp học",
                render: (a) =>
                  classes.data?.find((c) => c.id === a.classId)?.className ||
                  `Lớp #${a.classId}`,
              },
              {
                key: "time",
                label: "Thời gian ghi nhận",
                sort: (a) => a.checkedInAt,
                render: (a) => (
                  <div className="contact-cell">
                    <strong>{timeLabel(a.checkedInAt)}</strong>
                    <small>{dateLabel(a.checkedInAt)}</small>
                  </div>
                ),
              },
              {
                key: "checker",
                label: "Người ghi nhận",
                render: (a) =>
                  users.data?.find((u) => u.id === a.checkedInBy)?.fullName ||
                  `Nhân viên #${a.checkedInBy || "—"}`,
              },
              {
                key: "status",
                label: "Trạng thái",
                sort: (a) => a.status,
                render: (a) => <Badge status={a.status} />,
              },
              ...(!member && session!.mode === "api" ? [{
                key: "booking-policy",
                label: "Xác nhận",
                render: (record: AttendanceRecord) => {
                  const clazz = classes.data?.find((item) => item.id === record.classId);
                  if (!clazz || clazz.status === "CANCELLED") return null;
                  const ended = parseDate(clazz.scheduleTime).getTime() + clazz.durationMinutes * 60_000 <= Date.now();
                  return <AttendanceBenefits record={record} role={session!.user.roleName}
                    ended={ended} windowOpen={isAttendanceWindowOpen(clazz)} />;
                },
              }] : []),
            ]}
          />
        )}
      </Panel>
      {create && can("attendance.record") && (
        // [NÚT] FORM "Ghi nhận điểm danh, nút "Lưu điểm danh"" → gọi API api.checkIn → POST /attendance
        <FormModal
          title="Ghi nhận điểm danh"
          description="Chọn thành viên và lớp học đang tham gia."
          onClose={() => setCreate(false)}
          submitLabel="Lưu điểm danh"
          onSubmit={async (d) => {
            // [API] api.checkIn → POST /attendance
            await api.checkIn({
              memberId: Number(d.get("memberId")),
              classId: Number(d.get("classId")),
              checkedInBy: session!.user.id,
              status: String(d.get("status")),
            });
            await client.invalidateQueries();
            toast("Đã ghi nhận điểm danh.");
          }}
        >
          <MemberField users={users.data || []} />
          <Field label="Lớp học">
            <select name="classId" required defaultValue={effectiveClassId}>
              {classes.data
                ?.filter(
                  (c) =>
                    c.status !== "CANCELLED" && isAttendanceWindowOpen(c),
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.className} · {dateLabel(c.scheduleTime)}{" "}
                    {timeLabel(c.scheduleTime)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Trạng thái">
            <select name="status">
              <option value="PRESENT">Có mặt</option>
              <option value="ABSENT">Vắng mặt</option>
            </select>
          </Field>
          <Notice>
            Chỉ Coach phụ trách được đổi Vắng thành Có mặt trong khung điểm danh.
          </Notice>
        </FormModal>
      )}
    </>
  );
}

function AttendanceBenefits({ record, role, ended, windowOpen }: {
  record: AttendanceRecord;
  role: string;
  ended: boolean;
  windowOpen: boolean;
}) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const supplies = role === "RECEPTIONIST" && record.status === "PRESENT" && windowOpen;
  const membership = useQuery({
    queryKey: ["activeSubscription", record.memberId],
    queryFn: () => api.activeSubscription(record.memberId),
    enabled: supplies,
  });
  const packages = useQuery({
    queryKey: ["membershipPackages"],
    queryFn: api.membershipPackages,
    enabled: supplies && !!membership.data && !membership.data.entitlementLevel,
  });
  const vip = (membership.data?.entitlementLevel ?? packages.data?.find(
    (item) => item.id === membership.data?.packageId,
  )?.accessLevel) === "VIP";
  const canConfirm = ended && record.status === "ABSENT" && ["COACH", "RECEPTIONIST"].includes(role);
  async function submit(action: string, body?: { towel: boolean; water: boolean }) {
    setPending(true);
    setMessage("");
    try {
      await request(`/classes/${record.classId}/members/${record.memberId}/${action}`, {
        method: body ? "PUT" : "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setMessage(body ? "Đã ghi nhận cấp quyền lợi." : "Đã ghi nhận xác nhận.");
      await client.invalidateQueries({ queryKey: ["attendance"] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xác nhận.");
    } finally {
      setPending(false);
    }
  }
  return <>
    {canConfirm && <Button variant="secondary" disabled={pending}
      onClick={() => void submit("no-show")}>Xác nhận No-show</Button>}
    {role === "CENTER_MANAGER" && record.status === "ABSENT" &&
      <Button variant="secondary" disabled={pending}
        onClick={() => void submit("excuse-booking-violation")}>Duyệt ngoại lệ</Button>}
    {supplies && vip && <>
      {!record.vipTowelAt && <Button variant="secondary" disabled={pending}
        onClick={() => void submit("vip-supplies", { towel: true, water: false })}>Đã cấp khăn</Button>}
      {!record.vipWaterAt && <Button variant="secondary" disabled={pending}
        onClick={() => void submit("vip-supplies", { towel: false, water: true })}>Đã cấp nước</Button>}
    </>}
    {(record.vipTowelAt || record.vipWaterAt) &&
      <small>Đã cấp {record.vipTowelAt && "khăn"}{record.vipTowelAt && record.vipWaterAt && " và "}{record.vipWaterAt && "nước"}.</small>}
    {message && <p role="status">{message}</p>}
  </>;
}
