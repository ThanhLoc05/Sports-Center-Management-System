/**
 * FLOW 2 — BIỂU DIỄN LỊCH TỪ DỮ LIỆU LỚP, không tạo nguồn lịch độc lập.
 * Thành viên lọc lớp đã BOOKED để xem lịch cá nhân; HLV nhận lớp phụ trách
 * qua useClasses. Hộp thoại lớp/form tái sử dụng từ Classes.tsx.
 */
import { useCatalog } from "../lib/catalog";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Plus, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useClasses, usePermissions } from "../lib/hooks";
import { api } from "../lib/api";
import type { SportClass } from "../lib/types";
import { addDays, dateLabel, localDate, timeLabel } from "../lib/utils";
import { ClassDetail, ClassForm, ClassCoachName } from "./Classes";
import { TrainingProgramForm } from "../components/TrainingProgramForm";
import {
  Button,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  Panel,
  Select,
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
  const { sports, rooms } = useCatalog();
  const { session } = useAuth();
  const can = usePermissions();
  const member = session!.user.roleName === "MEMBER";

  // A receptionist can book for this member after the dashboard has cached both lists.
  const calendarQueryOptions = member && session?.mode === "api"
    ? { refetchOnMount: "always" as const }
    : {};
  const classes = useClasses(calendarQueryOptions);
  const [offset, setOffset] = useState(0);
  const [sport, setSport] = useState("all");
  const [scope, setScope] = useState(member ? "mine" : "all");
  const [view, setView] = useState("week");
  const [selected, setSelected] = useState<SportClass | null>(null);
  const [create, setCreate] = useState(false);
  const [editing, setEditing] = useState<SportClass | null>(null);
  /**
   * Chỉ thành viên cần tải booking của mình để lọc lịch cá nhân. HLV đã nhận
   * danh sách lớp riêng qua useClasses nên không cần query booking cá nhân này.
   */
  const bookings = useQuery({
    queryKey: ["bookings", session!.user.id],
    queryFn: () => api.bookings(session!.user.id),
    enabled: member,
    ...calendarQueryOptions,
  });
  const calendarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view === "week" && calendarRef.current)
      calendarRef.current.scrollTop = 6 * HOUR_HEIGHT;
  }, [view, classes.isPending]);
  /**
   * Tạo mốc giữa ngày theo UTC+7, tính thứ Hai đầu tuần và cộng offset theo tuần.
   * Bảy ngày chỉ là cách trình bày; thời gian lớp gốc vẫn đến từ scheduleTime.
   */
  const today = new Date(localDate() + "T12:00:00+07:00");
  const monday = addDays(-((today.getUTCDay() + 6) % 7) + offset * 7, today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(i, monday));
  /**
   * Bỏ lớp CANCELLED, lọc bộ môn, và nếu chọn lịch cá nhân thì chỉ giữ lớp có
   * booking BOOKED. Sau đó weekRows giới hạn ngày nằm trong tuần đang xem.
   */
  const rows = (classes.data || []).filter(
    (c) =>
      c.status !== "CANCELLED" &&
      (sport === "all" || c.sportId === Number(sport)) &&
      (!member ||
        scope === "all" ||
        bookings.data?.some(
          (b) => b.classId === c.id && b.status === "BOOKED",
        )),
  );
  const weekRows = rows.filter(
    (c) =>
      c.scheduleTime.slice(0, 10) >= localDate(days[0]) &&
      c.scheduleTime.slice(0, 10) <= localDate(days[6]),
  );
  const times = Array.from({ length: 24 }, (_, i) => i);
  return (
    <>
      <PageHeader
        eyebrow="MAKE TIME TO MOVE"
        title={member ? "Lịch tập của bạn" : "Lịch hoạt động"}
        description="Một tuần đầy năng lượng bắt đầu từ một lịch trình rõ ràng."
        actions={
          <>
            <Link to="/classes" className="btn btn-secondary">
              Danh sách lớp học
            </Link>
            {can("classes.manage") && (
              <Button onClick={() => setCreate(true)}>
                <Plus size={17} />
                Tạo lớp học
              </Button>
            )}
          </>
        }
      />
      <Panel className="schedule-panel">
        <div className="schedule-toolbar">
          <div className="calendar-range">
            <div className="day-nav">
              <button
                aria-label="Tuần trước"
                onClick={() => setOffset((o) => o - 1)}
              >
                <ChevronLeft size={17} />
              </button>
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
            <Button variant="secondary" onClick={() => setOffset(0)}>
              Hôm nay
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
            <div className="segmented">
              <button
                className={view === "week" ? "active" : ""}
                onClick={() => setView("week")}
              >
                Tuần
              </button>
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
                  .filter((c) => c.scheduleTime.startsWith(localDate(day)))
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
              <i className={`sport-${id}`} />
              {name}
            </span>
          ))}
          <span className="schedule-total">
            {weekRows.length} lớp trong tuần
          </span>
        </div>
      </Panel>
      {selected && (
        <ClassDetail item={selected} onClose={() => setSelected(null)} onEdit={can("classes.manage") ? item => { setEditing(item); setSelected(null); } : undefined} />
      )}
      {create && can("classes.manage") && (
        <TrainingProgramForm kind="REGULAR" onClose={() => setCreate(false)} />
      )}
      {editing && <ClassForm item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
