import { useState } from "react";
import type { FormEvent } from "react";
import { CalendarCheck, CircleCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, request } from "../lib/api";
import { classAccessAllowed, normalizeAccessLevel } from "../lib/entitlements";
import type { Booking, CoachProfessionalProfile, SportClass, Subscription } from "../lib/types";
import { addDays, dateLabel, errorText, localDate, matches, parseDate, timeLabel } from "../lib/utils";
import { Button, Confirm, Field, Notice, Panel } from "./ui";
import "../styles-package-booking.css";

const waitlistStatus: Record<string, string> = {
  QUEUED: "Đang chờ", INVITED: "Đã đến lượt", EXPIRED: "Hết hạn",
  ACCEPTED: "Đã đặt", CANCELLED: "Đã đóng",
};

const weekdays = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];
const halfHours = Array.from({ length: 48 }, (_, index) =>
  `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);

export function FlexibleBooking({
  classes, sports, rooms, coaches, subscription, level, packageName, search = "", onView,
}: {
  classes: SportClass[];
  sports: Record<number, string>;
  rooms: Record<number, string>;
  coaches: CoachProfessionalProfile[];
  subscription: Subscription | null;
  level?: string | null;
  packageName?: string;
  search?: string;
  onView: (item: SportClass) => void;
}) {
  const client = useQueryClient();
  const [sportFilter, setSport] = useState(0);
  const [dates, setDates] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [coachFilter, setCoach] = useState(0);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingSport, setSavingSport] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitlistAction, setWaitlistAction] = useState(false);
  const [declining, setDeclining] = useState<number | null>(null);
  const memberId = subscription?.memberId;
  const conduct = useQuery({
    queryKey: ["booking-conduct", memberId],
    queryFn: () => request<{ held: number; limit: number; violations: number; restrictedUntil?: string }>("/bookings/my-conduct"),
    enabled: !!memberId,
  });
  const waitlist = useQuery({
    queryKey: ["booking-waitlist", memberId],
    queryFn: () => request<{ classId: number; status: string; inviteUntil: string | null }[]>("/bookings/my-waitlist"),
    enabled: !!memberId,
    refetchInterval: 15_000,
  });
  const bookings = useQuery({
    queryKey: ["bookings", memberId, "MEMBER", memberId],
    queryFn: () => api.bookings(memberId!),
    enabled: !!memberId,
  });
  const booked = new Set(bookings.data?.filter((b) => b.status === "BOOKED").map((b) => b.classId));
  const membershipLevel = normalizeAccessLevel(level);
  const selectedSport = membershipLevel === "STANDARD" ? subscription?.selectedSportId : null;
  const sport = selectedSport ?? sportFilter;
  const needsSport = membershipLevel === "STANDARD" && !selectedSport;
  const now = new Date();
  const bookingEnd = addDays(7, now);
  const today = localDate(now);
  const lastDay = localDate(bookingEnd);
  const todayAtCenter = parseDate(today);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weekStarts = [addDays(-weekday, todayAtCenter), addDays(7 - weekday, todayAtCenter)];
  const activeDates = dates.filter((day) => day >= today && day <= lastDay);
  const upcoming = subscription && membershipLevel ? classes.filter((c) =>
    c.status === "SCHEDULED" && !c.regularClassId && !c.courseId &&
    c.sportId === sport && matches(search, c.className) &&
    classAccessAllowed(membershipLevel, c.requiredAccessLevel),
  ).map((session) => {
    const start = parseDate(session.scheduleTime);
    return { session, start };
  }).filter(({ start }) => start > now && start <= bookingEnd)
    .map(({ session, start }) => ({ session, start, day: localDate(start), hour: timeLabel(session.scheduleTime) })) : [];
  const daysWithSessions = new Set(upcoming.map(({ day }) => day));
  const hours = [...new Set([...halfHours, "23:59", from, until, ...upcoming.map(({ hour }) => hour)])]
    .filter(Boolean).sort();
  const matchesTime = upcoming.filter(({ day, hour }) =>
    (!activeDates.length || activeDates.includes(day)) &&
    (!from || hour >= from) && (!until || hour <= until));
  const coachIds = [...new Set([...matchesTime.map(({ session }) => session.coachId), coachFilter].filter((id) => id > 0))];
  const visible = matchesTime.filter(({ session }) => !coachFilter || session.coachId === coachFilter)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.session.id - b.session.id)
    .map(({ session }) => session);
  const capacities = useQueries({
    queries: visible.map((c) => ({ queryKey: ["capacity", c.id], queryFn: () => api.capacity(c.id) })),
  });
  const results = visible.map((session, index) => ({ session, capacity: capacities[index] }))
    .filter(({ capacity }) => !onlyOpen || (capacity.data ?? 0) > 0);
  const coachName = (id: number) =>
    coaches.find((c) => c.coachId === id)?.fullName || (id > 0 ? `HLV #${id}` : "Chưa phân công HLV");
  const coachOptions = coachIds.map((id) => ({ id, name: coachName(id) }));
  const busy = savingSport || submitting || waitlistAction;

  async function updateWaitlist(id: number, accept: boolean) {
    setWaitlistAction(true);
    setError("");
    setNotice("");
    try {
      await request(`/classes/${id}/waitlist${accept ? "/accept" : ""}`, { method: "POST" });
      await client.invalidateQueries();
      setNotice(accept ? "Đã xác nhận lời mời." : "Đã gửi yêu cầu vào danh sách chờ.");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setWaitlistAction(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscription || !selected.length || needsSport || busy) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await request<Booking[]>("/bookings/batch", {
        method: "POST",
        body: JSON.stringify({ classIds: selected }),
      });
      setSelected([]);
      await client.invalidateQueries();
      setNotice("Đã đăng ký các lớp đã chọn.");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSubmitting(false);
    }
  }

  if (!subscription || !membershipLevel) return null;

  const held = conduct.data?.held;
  const limit = conduct.data?.limit;
  const count = selected.length;
  const projected = held === undefined ? undefined : held + count;
  const remaining = (used: number | undefined) =>
    limit === undefined || used === undefined ? "—" : `${Math.max(0, limit - used)} lớp`;
  const heldLabel = (used: number | undefined) =>
    limit === undefined || used === undefined ? "—" : `${used}/${limit} lớp`;

  return (
    <div className="package-booking">
      <Panel className="package-booking__membership">
        <div>
          <p><strong>{packageName ? `${packageName} · ` : ""}Gói {membershipLevel} còn hiệu lực.</strong></p>
          <p className="muted">
            {membershipLevel === "VIP" ? "Tất cả bộ môn" :
              selectedSport ? sports[selectedSport] ?? `Bộ môn #${selectedSport}` : "Chọn một môn cho kỳ STANDARD"}
            {" · Hết hạn "}{dateLabel(subscription.endDate)}
          </p>
        </div>
        <div>
          {conduct.data ? (
            <>
              <strong>Đang giữ {conduct.data.held}/{conduct.data.limit} chỗ trước</strong>
              {conduct.data.violations >= 2 && <p className="muted">Có {conduct.data.violations} vi phạm trong kỳ theo dõi.</p>}
              {conduct.data.restrictedUntil && (
                <p className="muted">Giới hạn đến {dateLabel(conduct.data.restrictedUntil)} {timeLabel(conduct.data.restrictedUntil)}.</p>
              )}
            </>
          ) : conduct.error ? <p role="alert">{errorText(conduct.error)}</p> : <p>Đang tải số chỗ đã giữ…</p>}
          <Link to="/memberships">Xem gói thành viên</Link>
        </div>
      </Panel>
      <form className="package-booking__form" onSubmit={(event) => void confirm(event)}>
        <Panel title="Tìm buổi tập" className="package-booking__filter-panel">
          <div className="package-booking__filters">
            <Field label="Bộ môn">
              <select value={sport || ""} onChange={(e) => {
                setSport(Number(e.target.value));
                setDates([]);
                setCoach(0);
              }}>
                <option value="">Chọn bộ môn</option>
                {Object.entries(sports)
                  .filter(([id]) => selectedSport == null || Number(id) === selectedSport)
                  .map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Field label="Huấn luyện viên">
              <select value={coachFilter} onChange={(e) => setCoach(Number(e.target.value))}>
                <option value={0}>Tất cả</option>
                {coachOptions.map(({ id, name }) => <option key={id} value={id}>
                  {name}{coachOptions.some((other) => other.id !== id && other.name === name) ? ` (#${id})` : ""}
                </option>)}
              </select>
            </Field>
            <Field label="Từ giờ">
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Tất cả khung giờ</option>
                {hours.map((hour) => <option key={hour} value={hour} disabled={!!until && hour >= until}>{hour}</option>)}
              </select>
            </Field>
            <Field label="Đến giờ">
              <select value={until} onChange={(e) => setUntil(e.target.value)}>
                <option value="">Tất cả khung giờ</option>
                {hours.map((hour) => <option key={hour} value={hour} disabled={!!from && hour <= from}>{hour}</option>)}
              </select>
            </Field>
          </div>
          {needsSport && (
            <>
              <Notice>Kỳ STANDARD cũ cần chọn một môn trước khi đặt buổi mới. Lựa chọn được giữ đến hết kỳ.</Notice>
              <Button type="button" disabled={!sport || busy} onClick={async () => {
                setSavingSport(true);
                setError("");
                try {
                  await request(`/memberships/${subscription.id}/sport`, {
                    method: "PATCH", body: JSON.stringify({ sportId: sport }),
                  });
                  await client.invalidateQueries({ queryKey: ["activeSubscription", memberId] });
                } catch (failure) {
                  setError(errorText(failure));
                } finally {
                  setSavingSport(false);
                }
              }}>Xác nhận môn của kỳ hiện tại</Button>
            </>
          )}
          <div className="package-booking__day-heading">
            <strong id="package-booking-days">Ngày muốn học</strong>
            <label className="check-option">
              <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
              Chỉ còn chỗ
            </label>
          </div>
          <div className="package-booking__days" role="group" aria-labelledby="package-booking-days">
            <Button type="button" variant={activeDates.length ? "secondary" : "primary"}
              aria-pressed={!activeDates.length} onClick={() => setDates([])}>Tất cả ngày</Button>
            {weekStarts.map((start, index) => (
              <div key={index} className="package-booking__week" role="group"
                aria-label={index === 0 ? "Tuần này" : "Tuần sau"}>
                <strong>{index === 0 ? "Tuần này" : "Tuần sau"}</strong>
                <div className="package-booking__week-days">
                  {weekdays.map((name, offset) => {
                    const day = localDate(addDays(offset, start));
                    const outsideWindow = day < today || day > lastDay;
                    const hasSessions = daysWithSessions.has(day);
                    const status = outsideWindow ? "Ngoài thời hạn đặt" : !hasSessions ? "Chưa có buổi" : "";
                    return (
                      <Button key={day} type="button" disabled={outsideWindow}
                        variant={activeDates.includes(day) ? "primary" : "secondary"}
                        aria-label={dateLabel(day)} aria-pressed={activeDates.includes(day)}
                        aria-current={day === today ? "date" : undefined} title={status || undefined}
                        onClick={() => setDates((current) => current.includes(day) ? current.filter((d) => d !== day) : [...current, day])}>
                        <span>{name}</span>
                        <span>{dateLabel(day, { day: "2-digit", month: "2-digit" })}</span>
                        {!outsideWindow && <span aria-hidden="true">{hasSessions ? "•" : "–"}</span>}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
            <small className="muted">Theo giờ Việt Nam. • Có buổi theo môn đã chọn · – Chưa có buổi · Ngày mờ nằm ngoài thời hạn đặt. Ngày cuối chỉ hiện buổi trong 7 ngày tới.</small>
          </div>
        </Panel>

        <div className="package-booking__workspace">
          <Panel title={`${results.length} buổi phù hợp bộ lọc`} className="package-booking__results">
            {!results.length && <Notice>{sport ? "Không có buổi phù hợp với ngày và bộ lọc đang chọn trong 7 ngày tới." : "Chọn bộ môn để xem các buổi."}</Notice>}
            {bookings.error && <p role="alert">{errorText(bookings.error)}</p>}
            <ul className="package-booking__sessions">
              {results.map(({ session: c, capacity }) => {
                const entry = waitlist.data?.find((item) => item.classId === c.id);
                const alreadyBooked = booked.has(c.id);
                const chosen = selected.includes(c.id);
                return (
                  <li key={c.id} className={`package-booking__session${chosen ? " is-selected" : ""}`}>
                    <div className="package-booking__time">
                      <small>{dateLabel(c.scheduleTime)}</small>
                      <strong>{timeLabel(c.scheduleTime)}–{timeLabel(new Date(parseDate(c.scheduleTime).getTime() + c.durationMinutes * 60000).toISOString())}</strong>
                    </div>
                    <div className="package-booking__session-info">
                      <div><strong>{c.className}</strong> <small className="muted">· {sports[c.sportId]}</small></div>
                      <small>{coachName(c.coachId)} · {rooms[c.roomId] || "Chưa có tên phòng"}</small>
                      <small>
                        {capacity.isError ? "Lỗi tải số chỗ" : capacity.data == null ? "Đang tải số chỗ" : `Còn ${capacity.data}/${c.maxCapacity} chỗ`}
                        {" · "}
                        {alreadyBooked ? "Đã đăng ký" : chosen ? "Đã chọn" :
                          entry ? waitlistStatus[entry.status] ?? entry.status :
                          capacity.data === 0 ? "Đã đầy" : "Chưa đăng ký"}
                      </small>
                    </div>
                    <div className="package-booking__actions">
                      {(!alreadyBooked && (chosen || (capacity.data ?? 0) > 0)) && (
                        <Button type="button" variant={chosen ? "primary" : "secondary"} aria-pressed={chosen}
                          aria-label={`${chosen ? "Bỏ chọn" : "Chọn buổi"} ${c.className}`}
                          onClick={() => setSelected((current) => chosen ? current.filter((id) => id !== c.id) : [...current, c.id])}>
                          {chosen ? "Bỏ chọn" : "Chọn buổi"}
                        </Button>
                      )}
                      {!alreadyBooked && !chosen && capacity.data === 0 && !["QUEUED", "INVITED", "ACCEPTED"].includes(entry?.status ?? "") &&
                        <Button type="button" variant="secondary" disabled={busy} onClick={() => void updateWaitlist(c.id, false)}>
                          Vào danh sách chờ
                        </Button>}
                      <button className="text-link" type="button" onClick={() => onView(c)}>Xem chi tiết</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!!waitlist.data?.length && (
              <fieldset>
                <legend>Danh sách chờ của tôi</legend>
                {waitlist.data.map((entry) => (
                  <div key={entry.classId}>
                    {classes.find((c) => c.id === entry.classId)?.className || `Buổi #${entry.classId}`}
                    {" · "}{waitlistStatus[entry.status] ?? entry.status}
                    {entry.status === "INVITED" && entry.inviteUntil && parseDate(entry.inviteUntil) > now && <>
                      {" · đến "}{dateLabel(entry.inviteUntil)} {timeLabel(entry.inviteUntil)}
                      {" "}<Button type="button" disabled={busy}
                        onClick={() => void updateWaitlist(entry.classId, true)}>Xác nhận lời mời</Button>
                      {" "}<Button type="button" disabled={busy} variant="secondary"
                        onClick={() => setDeclining(entry.classId)}>Từ chối lời mời</Button>
                    </>}
                  </div>
                ))}
              </fieldset>
            )}
            {waitlist.error && <p role="alert">{errorText(waitlist.error)}</p>}
            {declining !== null && <Confirm
              title="Từ chối lời mời giữ chỗ?"
              description="Chỗ này sẽ được giải phóng cho thành viên tiếp theo trong danh sách chờ."
              onClose={() => setDeclining(null)}
              onConfirm={async () => {
                await request("/classes/" + declining + "/waitlist/decline", { method: "POST" });
                await client.invalidateQueries();
                setNotice("Đã từ chối lời mời giữ chỗ.");
              }}
            />}
          </Panel>
          <aside className="package-booking__summary" aria-label="Xác nhận đăng ký lớp">
            <Panel>
              <div className="package-booking__review">
                <h2><CalendarCheck size={19} aria-hidden="true" /> Đăng ký lớp</h2>
                <dl className="package-booking__stats">
                  <div><dt>Đã đăng ký trước</dt><dd>{heldLabel(held)}</dd></div>
                  <div><dt>Còn lượt giữ chỗ</dt><dd>{remaining(held)}</dd></div>
                </dl>
                {held !== undefined && limit !== undefined && limit > 0 && (
                  <progress aria-label="Số lớp đã giữ chỗ" max={limit} value={Math.min(held, limit)} />
                )}
                <div className="package-booking__draft">
                  <h3>{count ? `${count} lớp đã chọn` : "Chưa chọn lớp nào"}</h3>
                  {count ? (
                    <ul className="package-booking__selection">
                      {selected.map((id) => {
                        const item = classes.find((c) => c.id === id);
                        return (
                          <li key={id}>
                            <div>
                              <strong>{item?.className ?? `Lớp #${id}`}</strong>
                              {item && <small>{dateLabel(item.scheduleTime)} · {timeLabel(item.scheduleTime)}</small>}
                            </div>
                            <Button type="button" variant="ghost" aria-label={`Bỏ chọn lớp ${item?.className ?? `#${id}`}`}
                              onClick={() => setSelected((current) => current.filter((value) => value !== id))}>Bỏ chọn</Button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="muted">Chọn lớp phù hợp từ danh sách bên cạnh</p>}
                </div>
                {count > 0 && (
                  <dl className="package-booking__projection">
                    <div><dt>Giữ chỗ sau đăng ký</dt><dd>{heldLabel(projected)}</dd></div>
                    <div><dt>Còn lượt dự kiến</dt><dd>{remaining(projected)}</dd></div>
                  </dl>
                )}
                <p className="package-booking__included"><CircleCheck size={16} aria-hidden="true" /> Đã bao gồm trong gói thành viên</p>
                <p className="muted">Hủy đăng ký trước ít nhất 12 giờ để tránh vi phạm</p>
                {error && <p role="alert">{error.replace(/buổi/gi, (word) => word === "Buổi" ? "Lớp" : "lớp")}</p>}
                {notice && <p role="status">{notice}</p>}
                <Button type="submit" loading={submitting} disabled={!count || needsSport || busy}>
                  {count ? `Đăng ký ${count} lớp` : "Đăng ký lớp"}
                </Button>
              </div>
            </Panel>
          </aside>
        </div>
      </form>
    </div>
  );
}
