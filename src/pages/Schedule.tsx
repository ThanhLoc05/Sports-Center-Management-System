// [VAI TRÒ] Lịch hoạt động theo tuần: cả Lễ tân và Member xem lịch các buổi học.
/**
 * FLOW 2 — BIỂU DIỄN LỊCH TỪ DỮ LIỆU LỚP, không tạo nguồn lịch độc lập.
 * Thành viên lọc lớp đã BOOKED để xem lịch cá nhân; HLV nhận lớp phụ trách
 * qua useClasses. Hộp thoại lớp/form tái sử dụng từ Classes.tsx.
 */
import { useCatalog } from "../lib/catalog";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Plus, Users } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useClasses, usePermissions } from "../lib/hooks";
import { api, request } from "../lib/api";
import type { SportClass } from "../lib/types";
import { addDays, dateLabel, localDate, parseDate, timeLabel } from "../lib/utils";
import { ClassDetail, ClassForm, ClassCoachName } from "./Classes";
import { TrainingProgramForm } from "../components/TrainingProgramForm";
import ClassCancellationDialog from "../components/ClassCancellationDialog";
import ManagerWeekSchedule from "../components/ManagerWeekSchedule";
import MemberSchedule, { memberScheduleSport, type MemberScheduleStatus } from "../components/MemberSchedule";
import ScheduleSportMarkers from "../components/ScheduleSportMarkers";
import "../styles-weekly-schedule.css";
import {
  Button,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  Panel,
  Select,
  useToast,
} from "../components/ui";
const HOUR_HEIGHT = 76;

function layoutDay(items: SportClass[]) {
  const entries = items.map((item) => {
    const [hour, minute] = timeLabel(item.scheduleTime).split(":").map(Number);
    const top = (hour + minute / 60) * HOUR_HEIGHT;
    const height = Math.max(58, item.durationMinutes / 60 * HOUR_HEIGHT - 4);
    return { item, top, height, column: 0, columns: 1 };
  }).sort((a, b) => a.top - b.top || a.item.id - b.item.id);

  let groupStart = 0;
  let groupEnd = 0;
  let columnEnds: number[] = [];
  const setGroupWidth = (end: number) => {
    for (let i = groupStart; i < end; i++) entries[i].columns = columnEnds.length;
  };

  // Use the actual rendered height so even very short, adjacent classes stay clickable.
  entries.forEach((entry, index) => {
    if (entry.top >= groupEnd) {
      setGroupWidth(index);
      groupStart = index;
      columnEnds = [];
    }
    const free = columnEnds.findIndex((end) => end <= entry.top);
    entry.column = free === -1 ? columnEnds.length : free;
    const bottom = entry.top + entry.height;
    columnEnds[entry.column] = bottom;
    groupEnd = Math.max(groupEnd, bottom);
  });
  setGroupWidth(entries.length);
  return entries;
}

export default function Schedule() {
  // [API] useCatalog() (hook trong lib/catalog.ts) → api.sports → GET /sports; api.rooms → GET /rooms
  const { sports, rooms } = useCatalog();
  const { session } = useAuth();
  const can = usePermissions();
  const client = useQueryClient();
  const toast = useToast();
  const member = session!.user.roleName === "MEMBER";
  const manager = can("classes.manage");

  // A receptionist can book for this member after the dashboard has cached both lists.
  const calendarQueryOptions = member && session?.mode === "api"
    ? { refetchOnMount: "always" as const }
    : {};
  // [API] useClasses() (hook trong lib/hooks.ts) → api.classes → GET /classes/my-classes | /classes…
  const classes = useClasses(calendarQueryOptions);
  const [offset, setOffset] = useState(0);
  const [sport, setSport] = useState("all");
  const [status, setStatus] = useState("not-cancelled");
  const [scope, setScope] = useState(member ? "mine" : "all");
  const [view, setView] = useState(() => member && window.matchMedia?.("(max-width: 768px)").matches ? "list" : "week");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const setSelected = (item: SportClass | null) => setSelectedId(item?.id ?? null);
  const selected = classes.data?.find((item) =>
    item.id === selectedId && (session?.user.roleName !== "COACH" || item.status !== "CANCELLED"));
  const [create, setCreate] = useState<"flexible" | "regular" | null>(null);
  const [editing, setEditing] = useState<SportClass | null>(null);
  const [cancelling, setCancelling] = useState<SportClass | null>(null);
  /**
   * Chỉ thành viên cần tải booking của mình để lọc lịch cá nhân. HLV đã nhận
   * danh sách lớp riêng qua useClasses nên không cần query booking cá nhân này.
   */
  const bookings = useQuery({
    queryKey: ["bookings", session!.user.id],
    // [API] api.bookings → GET /classes/{classId}/bookings | /members/{memberId}/bookings
    queryFn: () => api.bookings(session!.user.id),
    enabled: member,
    ...calendarQueryOptions,
  });
  const waitlist = useQuery({
    queryKey: ["booking-waitlist", session!.user.id],
    queryFn: () => request<{ classId: number; status: string }[]>("/bookings/my-waitlist"),
    enabled: member && session?.mode === "api",
    retry: false,
    ...calendarQueryOptions,
  });
  const registration = new Map<number, MemberScheduleStatus>();
  for (const entry of waitlist.data ?? []) {
    if (entry.status === "QUEUED" || entry.status === "INVITED") registration.set(entry.classId, entry.status);
  }
  const cancelledBooking = new Set<number>();
  for (const booking of bookings.data ?? []) {
    if (booking.status === "BOOKED") registration.set(booking.classId, "BOOKED");
    if (booking.status === "CANCELLED") cancelledBooking.add(booking.classId);
  }
  const personal = (item: SportClass) =>
    registration.has(item.id) || (item.status === "CANCELLED" && cancelledBooking.has(item.id));
  const calendarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!manager && view === "week" && calendarRef.current)
      calendarRef.current.scrollTop = 6 * HOUR_HEIGHT;
  }, [manager, view, classes.isPending]);
  /**
   * Tạo mốc giữa ngày theo UTC+7, tính thứ Hai đầu tuần và cộng offset theo tuần.
   * Bảy ngày chỉ là cách trình bày; thời gian lớp gốc vẫn đến từ scheduleTime.
   */
  const today = new Date(localDate() + "T12:00:00+07:00");
  const monday = addDays(-((today.getUTCDay() + 6) % 7) + offset * 7, today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(i, monday));
  /**
   * Manager có thể xem cả lịch sử hủy. Lịch cá nhân vẫn chỉ hiện lớp có booking BOOKED.
   */
  const rows = (classes.data || []).filter(
    (c) =>
      (member ? (scope === "mine" ? personal(c) : c.status !== "CANCELLED" || personal(c))
        : manager && status !== "not-cancelled" ? status === "all" || c.status === status : c.status !== "CANCELLED") &&
      (sport === "all" || c.sportId === Number(sport)),
  );
  const dayOf = (item: SportClass) =>
    manager || member ? localDate(parseDate(item.scheduleTime)) : item.scheduleTime.slice(0, 10);
  const start = localDate(days[0]);
  const end = localDate(days[6]);
  const weekRows = rows.filter((item) => {
    const date = dayOf(item);
    return date >= start && date <= end;
  });
  const times = Array.from({ length: 24 }, (_, i) => i);
  return (
    <>
      <PageHeader
        eyebrow={manager ? undefined : "MAKE TIME TO MOVE"}
        title={member ? "Lịch tập của bạn" : "Lịch hoạt động"}
        description={manager ? "Xem và quản lý các buổi đã lên lịch." : "Một tuần đầy năng lượng bắt đầu từ một lịch trình rõ ràng."}
        actions={
          <>
            <Link to="/classes" className="btn btn-secondary">
              Danh sách lớp học
            </Link>
            {can("classes.manage") && (
              <>
                <Button onClick={() => setCreate("flexible")}>
                  <Plus size={17} />
                  Tạo buổi tập
                </Button>
                <Button variant="secondary" onClick={() => setCreate("regular")}>
                  Tạo lớp cố định
                </Button>
              </>
            )}
          </>
        }
      />
      <Panel className={manager ? "schedule-panel schedule-manager-panel" : "schedule-panel"}>
        <div className="schedule-toolbar">
          <div className="calendar-range">
            <div className="day-nav">
              {/* [NÚT] NÚT "Tuần trước" → đổi cách hiển thị / bộ lọc trên màn hình (setOffset) */}
              <button
                aria-label="Tuần trước"
                onClick={() => setOffset((o) => o - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              {/* [NÚT] NÚT "Tuần sau" → đổi cách hiển thị / bộ lọc trên màn hình (setOffset) */}
              <button
                aria-label="Tuần sau"
                onClick={() => setOffset((o) => o + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <h2>
              {dateLabel(days[0], { day: "2-digit", month: "2-digit" })} –{" "}
              {dateLabel(days[6])}
            </h2>
            {/* [NÚT] NÚT "Hôm nay" → đổi cách hiển thị / bộ lọc trên màn hình (setOffset) */}
            <Button variant="secondary" onClick={() => setOffset(0)}>
              {manager ? "Tuần này" : "Hôm nay"}
            </Button>
          </div>
          <div className="table-filters">
            {member && (
              <Select
                label="Phạm vi lịch học"
                value={scope}
                onChange={setScope}
              >
                <option value="mine">Lịch cá nhân</option>
                <option value="all">Tất cả lớp</option>
              </Select>
            )}
            <Select label="Bộ môn lịch học" value={sport} onChange={setSport}>
              <option value="all">Tất cả bộ môn</option>
              {Object.entries(sports).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            {manager && (
              <Select label="Trạng thái buổi học" value={status} onChange={setStatus}>
                <option value="not-cancelled">Chưa hủy</option>
                <option value="all">Tất cả trạng thái</option>
                <option value="SCHEDULED">Đã lên lịch</option>
                <option value="COMPLETED">Đã hoàn thành</option>
                <option value="CANCELLED">Đã hủy</option>
              </Select>
            )}
            <div className="segmented">
              {/* [NÚT] NÚT "Tuần" → mở/đóng hộp thoại hoặc form (setView) */}
              <button
                className={view === "week" ? "active" : ""}
                onClick={() => setView("week")}
              >
                Tuần
              </button>
              {/* [NÚT] NÚT "Danh sách" → mở/đóng hộp thoại hoặc form (setView) */}
              <button
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
              >
                Danh sách
              </button>
            </div>
          </div>
        </div>
        {classes.isPending ? (
          <Loading />
        ) : classes.error ? (
          <ErrorState error={classes.error} retry={classes.refetch} />
        ) : member && scope === "mine" && bookings.isPending ? (
          <Loading />
        ) : member && scope === "mine" && bookings.error ? (
          <ErrorState error={bookings.error} retry={bookings.refetch} />
        ) : member && scope === "mine" && session?.mode === "api" && waitlist.isPending ? (
          <Loading />
        ) : member ? (
          <>
            {waitlist.error && <ErrorState error={waitlist.error} retry={waitlist.refetch} />}
            <MemberSchedule days={days} items={weekRows} sports={sports} rooms={rooms}
              registration={registration} week={view === "week"} onView={setSelected} />
          </>
        ) : view === "week" && manager ? (
          <ManagerWeekSchedule days={days} items={weekRows} sports={sports} rooms={rooms} onView={setSelected} />
        ) : view === "week" ? (
          <div className="calendar-scroll" ref={calendarRef}>
            <div className="week-calendar">
              <div className="week-header">
                <div className="timezone">GMT+7</div>
                {days.map((d, i) => (
                  <div
                    key={i}
                    className={localDate(d) === localDate() ? "is-today" : ""}
                  >
                    <span>
                      {
                        [
                          "THỨ HAI",
                          "THỨ BA",
                          "THỨ TƯ",
                          "THỨ NĂM",
                          "THỨ SÁU",
                          "THỨ BẢY",
                          "CHỦ NHẬT",
                        ][i]
                      }
                    </span>
                    <strong>{Number(localDate(d).slice(-2))}</strong>
                    {localDate(d) === localDate() && <i />}
                  </div>
                ))}
              </div>
              <div className="calendar-body">
                <div className="time-gutter">
                  {times.map((hour) => (
                    <div key={hour} style={{ top: hour * HOUR_HEIGHT }}>
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                {days.map((d, i) => (
                  <div
                    className={`calendar-day ${localDate(d) === localDate() ? "is-today" : ""}`}
                    key={i}
                  >
                    {times.map((hour) => (
                      <div
                        key={hour}
                        className="hour-line"
                        style={{ top: hour * HOUR_HEIGHT }}
                      />
                    ))}
                    {layoutDay(weekRows.filter((c) => c.scheduleTime.startsWith(localDate(d))))
                      .map(({ item: c, top, height, column, columns }) => (
                        // [NÚT] NÚT (nút biểu tượng) → mở/đóng hộp thoại hoặc form (setSelected)
                        <button
                          key={c.id}
                          className={`calendar-event sport-${c.sportId}`}
                          style={{
                            top,
                            height,
                            left: `calc(${column * 100 / columns}% + 4px)`,
                            right: `calc(${(columns - column - 1) * 100 / columns}% + 4px)`,
                          }}
                          onClick={() => setSelected(c)}
                        >
                          <strong>{c.className}</strong>
                          <span>
                            {timeLabel(c.scheduleTime)} · {c.durationMinutes}′
                          </span>
                          <small>
                            {rooms[c.roomId] || `Phòng #${c.roomId}`}
                          </small>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="schedule-list">
            {weekRows.length ? (
              days.map((day) => {
                const items = weekRows
                  .filter((c) => dayOf(c) === localDate(day))
                  .sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime));
                if (!items.length) return null;
                return (
                  <section key={localDate(day)}>
                    <h3>
                      {dateLabel(day, {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </h3>
                    {items.map((c) => (
                      <div
                        key={c.id}
                        className="schedule-list-item"
                      >
                        <span
                          className={`schedule-list-marker sport-${c.sportId}`}
                        />
                        <strong>{timeLabel(c.scheduleTime)}</strong>
                        <div>
                          <h4>
                            {/* [NÚT] NÚT (nút biểu tượng) → mở/đóng hộp thoại hoặc form (setSelected) */}
                            <button className="text-link" onClick={() => setSelected(c)}>
                              {c.className}
                            </button>
                          </h4>
                          <p>
                            <ClassCoachName coachId={c.coachId} />{" "}
                            · {rooms[c.roomId] || `Phòng #${c.roomId}`}
                          </p>
                        </div>
                        <span>
                          <Clock3 size={14} />
                          {c.durationMinutes} phút
                        </span>
                        <span>
                          <Users size={14} />
                          Tối đa {c.maxCapacity}
                        </span>
                      </div>
                    ))}
                  </section>
                );
              })
            ) : (
              <Empty
                title="Lịch tuần này đang trống"
                description="Chọn tuần khác hoặc khám phá thêm các lớp học."
              />
            )}
          </div>
        )}
        <div className="schedule-legend">
          {Object.entries(sports).map(([id, name]) => (
            <span key={id}>
              {manager ? <ScheduleSportMarkers names={[name]} /> : member
                ? <i className="member-schedule-legend" data-sport={memberScheduleSport(name)} />
                : <i className={`sport-${id}`} />}
              {name}
            </span>
          ))}
          <span className="schedule-total">
            {weekRows.length} lớp trong tuần
          </span>
        </div>
      </Panel>
      {selected && (
        <ClassDetail
          item={selected}
          memberSchedule={member}
          dialogClassName={manager ? "schedule-ui-dialog" : undefined}
          onClose={() => setSelected(null)}
          onEdit={manager && selected.status !== "CANCELLED" ? (item) => {
            setEditing(item);
            setSelected(null);
          } : undefined}
          onCancel={manager && session?.mode === "api" && !selected.regularClassId && !selected.courseId ? (item) => {
            setCancelling(item);
            setSelected(null);
          } : undefined}
        />
      )}
      {create === "flexible" && manager && (
        <ClassForm dialogClassName="schedule-ui-dialog" fixedSlots={session?.mode === "api"} onClose={() => setCreate(null)} />
      )}
      {create === "regular" && manager && (
        <TrainingProgramForm kind="REGULAR" onClose={() => setCreate(null)} />
      )}
      {editing && <ClassForm dialogClassName="schedule-ui-dialog" item={editing} fixedSlots={session?.mode === "api"} onClose={() => setEditing(null)} />}
      {cancelling && (
        <ClassCancellationDialog dialogClassName="schedule-ui-dialog" item={cancelling} onClose={() => setCancelling(null)} onSaved={async () => {
          await client.invalidateQueries();
          toast("Đã hủy buổi học.");
        }} />
      )}
    </>
  );
}
