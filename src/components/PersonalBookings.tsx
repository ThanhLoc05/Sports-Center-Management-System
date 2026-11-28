import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, request } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCatalog } from "../lib/catalog";
import { useClasses } from "../lib/hooks";
import type { Booking, SportClass, WaitlistEntry } from "../lib/types";
import { addDays, dateLabel, errorText, idLabel, localDate, parseDate, timeLabel } from "../lib/utils";
import { Button, Empty, ErrorState, Loading, PageHeader, useToast } from "./ui";
import MemberBookingCancellation, { bookingCancellationBlocker, type MemberCancellationAction } from "./MemberBookingCancellation";
import { ClassDetail } from "../pages/Classes";
import "../styles-personal-bookings.css";

type Filter = "upcoming" | "past" | "cancelled" | "waitlist";
type SessionRow = { key: string; session?: SportClass; booking?: Booking; waiting?: WaitlistEntry; classId: number };
const filters: Record<Filter, string> = {
  upcoming: "Sắp tới", past: "Đã diễn ra", cancelled: "Đã hủy", waitlist: "Danh sách chờ",
};
const dateTime = (value: string) => `${dateLabel(value)} · ${timeLabel(value)}`;

export default function PersonalBookings() {
  const memberId = useAuth().session!.user.id;
  const client = useQueryClient();
  const toast = useToast();
  const classes = useClasses();
  const { rooms } = useCatalog();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab");
  const filter = tab === "waitlist" || tab === "past" || tab === "cancelled" ? tab : "upcoming";
  const setFilter = (next: Filter) => setParams((current) => {
    const change = new URLSearchParams(current);
    if (next === "upcoming") change.delete("tab");
    else change.set("tab", next);
    return change;
  }, { replace: true });
  const [detail, setDetail] = useState<SportClass | null>(null);
  const [openCancelled, setOpenCancelled] = useState<number | null>(null);
  const cancellation = useQuery({
    queryKey: ["classCancellation", memberId, openCancelled],
    queryFn: () => api.classCancellation(openCancelled!),
    enabled: filter === "cancelled" && openCancelled !== null,
    retry: false,
  });
  const [memberAction, setMemberAction] = useState<MemberCancellationAction | null>(null);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [acceptError, setAcceptError] = useState("");
  const bookings = useQuery({
    queryKey: ["bookings", memberId, "MEMBER", memberId],
    queryFn: () => api.bookings(memberId),
  });
  const coaches = useQuery({ queryKey: ["coach-directory"], queryFn: api.coaches, retry: false });
  const waitlist = useQuery({
    queryKey: ["booking-waitlist", memberId],
    queryFn: () => request<WaitlistEntry[]>("/bookings/my-waitlist"),
    refetchInterval: 15_000,
  });

  const now = new Date();
  const today = localDate(now);
  const tomorrow = localDate(addDays(1, now));
  const classById = new Map(classes.data?.map((item) => [item.id, item]));
  const rows: Record<Filter, SessionRow[]> = { upcoming: [], past: [], cancelled: [], waitlist: [] };
  for (const booking of bookings.data ?? []) {
    const session = classById.get(booking.classId);
    if (session?.regularClassId || session?.courseId) continue;
    const group = booking.status === "CANCELLED" || session?.status === "CANCELLED" ? "cancelled"
      : session?.status !== "COMPLETED" && (!session || parseDate(session.scheduleTime) > now) ? "upcoming" : "past";
    rows[group].push({ key: `booking-${booking.id}`, session, booking, classId: booking.classId });
  }
  for (const entry of waitlist.data ?? []) {
    if (entry.status === "QUEUED" || entry.status === "INVITED") {
      rows.waitlist.push({ key: `waitlist-${entry.classId}`, session: classById.get(entry.classId), waiting: entry, classId: entry.classId });
    }
  }
  const startTime = (row: SessionRow) => row.session ? parseDate(row.session.scheduleTime).getTime() : Infinity;
  rows.upcoming.sort((a, b) => startTime(a) - startTime(b));
  rows.past.sort((a, b) => startTime(b) - startTime(a));
  rows.cancelled.sort((a, b) => parseDate(b.booking!.bookedAt).getTime() - parseDate(a.booking!.bookedAt).getTime());
  rows.waitlist.sort((a, b) => startTime(a) - startTime(b));

  const attendanceStart = rows.past.reduce((earliest, { session }) => {
    if (!session) return earliest;
    const day = localDate(parseDate(session.scheduleTime));
    return day < earliest ? day : earliest;
  }, today);
  const attendance = useQuery({
    queryKey: ["attendance", memberId, attendanceStart, today],
    queryFn: () => api.attendance(memberId, undefined, attendanceStart, today),
    enabled: filter === "past" && rows.past.length > 0,
  });
  const attendanceByClass = new Map(attendance.data?.map((item) => [item.classId, item.status]));
  const nearest = rows.upcoming.find((row) => row.session?.status === "SCHEDULED")?.key;
  const groups = new Map<string, SessionRow[]>();
  for (const row of rows[filter]) {
    const date = filter === "cancelled" ? row.booking?.bookedAt : row.session?.scheduleTime;
    const day = date ? localDate(parseDate(date)) : "";
    const group = groups.get(day);
    if (group) group.push(row);
    else groups.set(day, [row]);
  }

  async function accept(row: SessionRow) {
    setAccepting(row.classId);
    setAcceptError("");
    try {
      await request<Booking>(`/classes/${row.classId}/waitlist/accept`, { method: "POST" });
      await client.invalidateQueries();
      toast("Đã xác nhận lời mời giữ chỗ.");
    } catch (error) {
      setAcceptError(errorText(error));
    } finally {
      setAccepting(null);
    }
  }

  const loading = classes.isPending || (filter === "waitlist" ? waitlist.isPending : bookings.isPending);
  const visibleQuery = filter === "waitlist" ? waitlist : bookings;
  return (
    <div className="personal-bookings">
      <PageHeader eyebrow="A PLACE FOR EVERYONE" title="Lớp học của tôi"
        description="Theo dõi buổi tập và quản lý đăng ký của bạn."
        actions={<Link className="btn btn-secondary" to="/sessions">Đăng ký thêm</Link>} />
      <div className="personal-bookings__filters" role="group" aria-label="Trạng thái buổi đã đặt">
        {(Object.keys(filters) as Filter[]).map((key) => (
          <Button key={key} type="button" variant={filter === key ? "primary" : "secondary"}
            aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {filters[key]}{(key === "waitlist" ? waitlist.data : bookings.data && classes.data) && ` (${rows[key].length})`}
          </Button>
        ))}
      </div>
      {filter === "cancelled" && !!groups.size && <p className="muted">Sắp xếp theo ngày đặt vì lịch sử hiện chưa có thời điểm hủy.</p>}
      {filter === "waitlist" && <p className="muted">Hội viên VIP được ưu tiên khi có chỗ trống. Trong cùng loại gói, hệ thống ưu tiên theo thời điểm tham gia.</p>}
      {filter === "waitlist" && acceptError && <p className="form-error" role="alert">{acceptError}</p>}
      {classes.error ? <ErrorState error={classes.error} retry={classes.refetch} />
        : visibleQuery.error ? <ErrorState error={visibleQuery.error} retry={visibleQuery.refetch} />
        : loading ? <Loading />
        : !groups.size ? <Empty title={filter === "upcoming" ? "Chưa có buổi học đã đặt" : `Chưa có buổi trong mục ${filters[filter].toLowerCase()}`}
            description={filter === "upcoming" ? "Bạn có thể tìm buổi mới tại mục Đăng ký lớp." : undefined} />
        : [...groups].map(([day, items]) => (
          <section key={day} className="personal-bookings__day">
            <h2>{day ? `${day === today ? "Hôm nay · " : day === tomorrow ? "Ngày mai · " : ""}${dateLabel(day)}` : "Chưa có lịch buổi tập"}</h2>
            <ul>
              {items.map((row) => {
                const { session, booking, waiting } = row;
                const name = session?.className ?? `Buổi #${row.classId}`;
                const coach = coaches.data?.find((item) => item.coachId === session?.coachId)?.fullName ?? "Chưa có thông tin HLV";
                const room = session ? rooms[session.roomId] || `Phòng #${session.roomId}` : "Chưa có thông tin sân/phòng";
                const attendanceStatus = attendanceByClass.get(row.classId);
                const invitationLive = waiting?.status === "INVITED" && waiting.inviteUntil && parseDate(waiting.inviteUntil) > now;
                const status = filter === "waitlist"
                  ? waiting?.status === "QUEUED" ? "Đang chờ chỗ" : invitationLive ? "Có lời mời nhận chỗ" : "Lời mời đã hết hạn"
                  : filter === "cancelled" ? "Đã hủy"
                  : filter === "upcoming" ? "Đã xác nhận"
                  : attendance.isPending ? "Đang tải điểm danh"
                  : attendance.isError ? "Chưa tải được điểm danh"
                  : attendanceStatus === "PRESENT" ? "Đã tham gia"
                  : attendanceStatus === "ABSENT" ? "Vắng đã xác nhận" : "Chờ cập nhật điểm danh";
                const blocker = session ? bookingCancellationBlocker(session, now) : "Chưa xác minh được lịch buổi tập.";
                const canCancel = booking?.status === "BOOKED" && !blocker;
                const hours = session ? `${timeLabel(session.scheduleTime)}–${timeLabel(new Date(startTime(row) + session.durationMinutes * 60_000).toISOString())}` : "Chưa có giờ";
                return (
                  <li key={row.key} className="panel personal-bookings__card">
                    <div className="personal-bookings__overview">
                      <strong className="personal-bookings__hours">{hours}</strong>
                      <div><h3>{name}</h3><p className="muted">{coach} · {room}</p></div>
                      <div className="personal-bookings__status">
                        <strong>{status}</strong>
                        {waiting?.status === "QUEUED" && waiting.position != null && <small>Vị trí {waiting.position}</small>}
                        {invitationLive && waiting.inviteUntil && <small>Xác nhận trước {dateTime(waiting.inviteUntil)}</small>}
                        {row.key === nearest && filter === "upcoming" && <small>Buổi gần nhất</small>}
                      </div>
                    </div>
                    <details onToggle={session?.status === "CANCELLED" ? (event) => {
                      const isOpen = event.currentTarget.open;
                      setOpenCancelled((current) => isOpen ? session.id : current === session.id ? null : current);
                    } : undefined}>
                      <summary>Xem chi tiết</summary>
                      <dl className="personal-bookings__details">
                        {booking && <><dt>Mã đăng ký</dt><dd>{idLabel(booking.id, "DK")}</dd></>}
                        {session && <><dt>Lịch tập</dt><dd>{dateLabel(session.scheduleTime)} · {hours}</dd></>}
                        {booking && <><dt>Ngày đặt chỗ</dt><dd>{dateTime(booking.bookedAt)}</dd></>}
                        <dt>HLV</dt><dd>{coach}</dd><dt>Sân/phòng</dt><dd>{room}</dd>
                        <dt>Trạng thái</dt><dd>{status}</dd>
                        {session?.status === "CANCELLED" && <><dt>Buổi học</dt><dd>Trung tâm đã hủy</dd></>}
                        {session?.id === openCancelled && cancellation.data?.reason &&
                          <><dt>Lý do trung tâm hủy</dt><dd>{cancellation.data.reason}</dd></>}
                        {filter === "past" && attendance.error && <><dt>Điểm danh</dt><dd><Button variant="secondary" onClick={() => void attendance.refetch()}>Thử tải lại</Button></dd></>}
                        {canCancel && <><dt>Chính sách hủy</dt><dd>Hủy trước ít nhất 12 giờ để tránh vi phạm.</dd></>}
                        {booking?.status === "BOOKED" && blocker && <><dt>Hủy đăng ký</dt><dd>{blocker}</dd></>}
                      </dl>
                      {session && <Button variant="secondary" onClick={() => setDetail(session)}>Chi tiết buổi tập</Button>}
                      {canCancel && session && <Button variant="danger" onClick={() => setMemberAction({ kind: "booking", item: session, bookingId: booking.id })}>Hủy đăng ký</Button>}
                    </details>
                    {invitationLive && <Button variant="primary" loading={accepting === row.classId} disabled={accepting !== null}
                      onClick={() => void accept(row)}>Xác nhận chỗ</Button>}
                    {(invitationLive || waiting?.status === "QUEUED") && session && !blocker &&
                      <Button variant="secondary" disabled={accepting !== null}
                        onClick={() => setMemberAction({ kind: "waitlist", item: session, invited: !!invitationLive })}>
                        {invitationLive ? "Từ chối chỗ tập" : "Rời danh sách chờ"}
                      </Button>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      {detail && <ClassDetail item={detail} onClose={() => setDetail(null)} />}
      {memberAction && <MemberBookingCancellation action={memberAction} memberId={memberId} onClose={() => setMemberAction(null)} />}
    </div>
  );
}
