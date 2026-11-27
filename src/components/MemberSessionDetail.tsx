import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarX, CheckCircle2, Clock3, Dumbbell, Info, MapPin, ShieldCheck, UserRound, Users } from "lucide-react";
import { api, request } from "../lib/api";
import { useAuth } from "../lib/auth";
import { apiMembershipAccess, classAccessAllowed } from "../lib/entitlements";
import { sessionSlotLabel, sessionTimeRange } from "../lib/scheduling-slots";
import { sportImage, sportVisual } from "../lib/sport-visuals";
import type { Booking, SportClass } from "../lib/types";
import { dateLabel, errorText, localDate, parseDate, timeLabel } from "../lib/utils";
import { bookingCancellationBlocker, refreshMemberRegistration, type MemberCancellationAction } from "./MemberBookingCancellation";
import { memberScheduleSport, scheduleSessionState } from "./MemberSchedule";
import { Button, Modal, useToast } from "./ui";
import "../styles-member-session-detail.css";

type WaitlistEntry = { status: string; inviteUntil: string | null };

export default function MemberSessionDetail({
  item, sport, room, coach, capacity, capacityError, retryCapacity, booking, cancelled, waiting, notice,
  registrationLoading, registrationError, retryRegistration, onClose, onCoach, onBook, onAction,
}: {
  booking?: Booking;
  cancelled?: boolean;
  waiting?: WaitlistEntry;
  registrationLoading: boolean;
  registrationError: boolean;
  retryRegistration: () => void;
  onBook: () => void;
  onAction: (action: MemberCancellationAction) => void;
  notice?: ReactNode;
} & SessionDetailProps) {
  const { session } = useAuth();
  const memberId = session!.user.id;
  const client = useQueryClient();
  const toast = useToast();
  const pendingWaitlist = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = new Date();
  const start = parseDate(item.scheduleTime);
  const blocker = bookingCancellationBlocker(item, now);
  const flexible = !item.courseId && !item.regularClassId;
  const invited = waiting?.status === "INVITED" && !!waiting.inviteUntil && parseDate(waiting.inviteUntil) > now;
  const queued = waiting?.status === "QUEUED";
  const canCheckMembership = session?.mode === "api" && flexible && !blocker && !booking && !queued && !invited;
  const active = useQuery({
    queryKey: ["activeSubscription", memberId],
    queryFn: () => api.activeSubscription(memberId),
    enabled: canCheckMembership,
    retry: false,
  });
  const packages = useQuery({
    queryKey: ["membershipPackages"],
    queryFn: api.membershipPackages,
    enabled: canCheckMembership,
    retry: false,
  });
  const access = canCheckMembership && active.isSuccess && packages.isSuccess
    ? apiMembershipAccess(active.data, packages.data, memberId) : null;
  const accessError = canCheckMembership && (active.error || packages.error);
  const accessPending = canCheckMembership && !access && !accessError;
  const accessBlocker = access?.allowed
    ? !classAccessAllowed(access.accessLevel, item.requiredAccessLevel)
      ? "Cấp gói của bạn chưa đáp ứng yêu cầu của buổi tập."
      : access.accessLevel === "STANDARD" && access.subscription.selectedSportId !== item.sportId
        ? "Buổi này không thuộc bộ môn đã chọn trong kỳ STANDARD."
        : localDate(start) > access.subscription.endDate ? "Buổi tập diễn ra sau ngày hết hạn gói." : null
    : access?.reason;
  const eligible = flexible && !blocker && !registrationLoading && !registrationError && !accessPending && !accessError && !accessBlocker;
  const registration = registrationError ? "Chưa xác minh được đăng ký"
    : registrationLoading ? "Đang kiểm tra đăng ký"
      : booking ? "Đã đăng ký" : invited ? "Chờ xác nhận chỗ" : queued ? "Đang trong danh sách chờ"
        : waiting?.status === "INVITED" ? "Lời mời đã hết hạn" : cancelled ? "Đã hủy đăng ký" : "Chưa đăng ký";
  const hasBooking = !!booking && !registrationError;
  const canCancel = hasBooking && flexible && !blocker && booking.status === "BOOKED";
  const explain = hasBooking
    ? blocker ?? (!flexible || booking.status !== "BOOKED" ? "Lượt đăng ký này được quản lý ở trang đăng ký tương ứng." : "Buổi tập đã có trong lịch cá nhân.")
    : invited && waiting.inviteUntil ? `Xác nhận trước ${timeLabel(waiting.inviteUntil)} ngày ${dateLabel(waiting.inviteUntil)}.`
      : queued && !blocker ? "Bạn đang chờ chỗ. Bạn sẽ nhận thông báo khi tới lượt và có thể rời danh sách khi có lời mời giữ chỗ."
        : blocker ?? accessBlocker;
  const showNewAction = eligible && !booking && !queued && !invited && capacity !== undefined && !capacityError;

  async function updateWaitlist(accept: boolean) {
    if (pendingWaitlist.current) return;
    pendingWaitlist.current = true;
    setError("");
    setBusy(true);
    try {
      await request(`/classes/${item.id}/waitlist${accept ? "/accept" : ""}`, { method: "POST" });
      await refreshMemberRegistration(client, memberId, item.id);
      toast(accept ? "Đã xác nhận lời mời giữ chỗ." : "Đã tham gia danh sách chờ.");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      pendingWaitlist.current = false;
      setBusy(false);
    }
  }

  return (
    <SessionDetailDialog item={item} sport={sport} room={room} coach={coach}
      capacity={capacity} capacityError={capacityError} retryCapacity={retryCapacity}
      onClose={onClose} onCoach={onCoach} busy={busy}
      actions={(canCancel || showNewAction || (invited && !blocker)) && <>
        {canCancel && <Button className="member-session-cancel" variant="secondary"
          onClick={() => onAction({ kind: "booking", item, bookingId: booking.id })}>
          <CalendarX size={17} aria-hidden="true" /> Hủy đăng ký
        </Button>}
        {showNewAction && (capacity === 0
          ? session?.mode === "api" && <Button variant="secondary" loading={busy} onClick={() => void updateWaitlist(false)}>Tham gia danh sách chờ</Button>
          : <Button onClick={onBook}>Đăng ký buổi tập</Button>)}
        {invited && !blocker && <>
          <Button variant="secondary" disabled={busy} onClick={() => onAction({ kind: "waitlist", item })}>Rời danh sách chờ</Button>
          <Button loading={busy} onClick={() => void updateWaitlist(true)}>Xác nhận chỗ</Button>
        </>}
      </>}>
      {notice}
        <div className="member-session-registration" data-kind={hasBooking ? "booked" : invited || queued ? "waiting" : "neutral"} role="status">
          {hasBooking ? <CheckCircle2 size={18} aria-hidden="true" /> : invited || queued ? <Clock3 size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
          <div>
            <strong>{hasBooking ? "Bạn đã đăng ký buổi tập này" : registration}</strong>
            {explain && <p>{explain}</p>}
            {registrationError && <button type="button" className="text-link" onClick={retryRegistration}>Tải lại trạng thái đăng ký</button>}
            {accessPending && <p>Đang kiểm tra quyền lợi gói tập…</p>}
            {accessError && <button type="button" className="text-link" onClick={() => { void active.refetch(); void packages.refetch(); }}>Kiểm tra lại quyền lợi gói tập</button>}
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
    </SessionDetailDialog>
  );
}

type SessionDetailProps = {
  item: SportClass;
  sport: string;
  room: string;
  coach: ReactNode;
  capacity?: number;
  capacityError: boolean;
  retryCapacity: () => void;
  onClose: () => void;
  onCoach: () => void;
};

export function SessionDetailDialog({
  item, sport, room, coach, capacity, capacityError, retryCapacity, onClose, onCoach,
  busy = false, actions, children,
}: SessionDetailProps & { busy?: boolean; actions?: ReactNode; children?: ReactNode }) {
  const start = parseDate(item.scheduleTime);
  const state = scheduleSessionState(item);
  const palette = memberScheduleSport(sport);
  const visual = palette === "dance" ? { image: "dance", alt: "Huấn luyện viên hướng dẫn nhóm học viên tập nhảy trong studio." }
    : sportVisual(sport) ?? (palette === "badminton" ? sportVisual("Cầu lông") : undefined);
  const booked = item.bookedCount;
  const openCapacity = capacity === undefined ? "Đang tải số chỗ…" : capacity === 0 ? "Hết chỗ" : `Còn ${capacity} chỗ trống`;
  return (
    <Modal title="Chi tiết buổi tập" onClose={onClose} className="member-session-modal" wide dismissible={!busy}>
      <div className="member-session-body" data-sport={palette}>
        <section className="member-session-hero" aria-label="Thông tin buổi tập">
          <div className="member-session-image">
            <Dumbbell size={42} aria-hidden="true" />
            {visual && <img key={visual.image} src={sportImage(visual.image)} alt={visual.alt}
              onError={(event) => { event.currentTarget.hidden = true; }} />}
          </div>
          <div className="member-session-hero-content">
            <div className="member-session-eyebrow">
              <span>{sport}</span>
              <span className="member-session-chip"><state.Icon size={13} aria-hidden="true" />{state.label}</span>
            </div>
            <h3>{item.className}</h3>
            <div className="member-session-timing">
              <div className="member-session-when">
                <CalendarDays size={19} aria-hidden="true" />
                <div><small>Ngày tập · GMT+7</small><strong>{dateLabel(start, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</strong></div>
              </div>
              <div className="member-session-when">
                <Clock3 size={19} aria-hidden="true" />
                <div><small>{sessionSlotLabel(item)}</small><strong className="member-session-hours">{sessionTimeRange(item)}</strong></div>
                <div className="member-session-duration"><strong>{item.durationMinutes}</strong><small>phút</small></div>
              </div>
            </div>
          </div>
        </section>
        <div className="member-session-cards">
          <div><UserRound size={17} aria-hidden="true" /><small>Huấn luyện viên</small><strong>{coach}</strong>
            {item.coachId > 0 && <button type="button" className="text-link" onClick={onCoach}>Xem thông tin HLV</button>}</div>
          <div><MapPin size={17} aria-hidden="true" /><small>Địa điểm tập</small><strong>{room}</strong></div>
          <div><ShieldCheck size={17} aria-hidden="true" /><small>Cấp độ yêu cầu</small><strong>{item.requiredAccessLevel}</strong></div>
          <div><Users size={17} aria-hidden="true" /><small>Số lượng đăng ký</small>
            <strong>{booked === undefined ? `Tối đa ${item.maxCapacity} thành viên` : `${booked}/${item.maxCapacity} thành viên`}</strong>
            {booked !== undefined && item.maxCapacity > 0 &&
              <progress aria-label="Số lượt đăng ký" max={item.maxCapacity} value={booked} />}
            {capacityError ? <button type="button" className="text-link" onClick={retryCapacity}>Tải lại số chỗ trống</button>
              : <small>{openCapacity}</small>}
          </div>
        </div>
        {children}
      </div>
      {actions && <div className="member-session-footer">{actions}</div>}
    </Modal>
  );
}
