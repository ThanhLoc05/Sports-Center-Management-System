import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SportClass } from "../lib/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { SCHEDULING_SLOTS, slotForSession } from "../lib/scheduling-slots";
import { dateLabel, localDate, parseDate, timeLabel } from "../lib/utils";
import { ClassCoachName } from "../pages/Classes";
import { Badge, Modal } from "./ui";
import ScheduleSportMarkers from "./ScheduleSportMarkers";
import "../styles-manager-week-schedule.css";

function SessionRow({
  item,
  sport,
  room,
  onView,
}: {
  item: SportClass;
  sport: string;
  room: string;
  onView: (item: SportClass) => void;
}) {
  const { session } = useAuth();
  const live = session?.mode === "api";
  const booked = useQuery({
    queryKey: ["classCancellation", session?.user.id, item.id],
    queryFn: () => api.classCancellation(item.id),
    enabled: live,
    retry: false,
  });
  const demoBookings = useQuery({
    queryKey: ["bookings", undefined, item.id],
    queryFn: () => api.bookings(undefined, item.id),
    enabled: !live,
  });
  const count = live
    ? booked.data?.booked
    : demoBookings.data?.filter((booking) => booking.status === "BOOKED").length;
  const countStatus = live ? booked : demoBookings;
  return (
    <li className="manager-week-session">
      <div>
        <button type="button" className="text-link" onClick={() => onView(item)}>
          {item.className}
        </button>
        <p>{item.courseId ? "Khóa học" : item.regularClassId ? "Lớp đã lưu" : "Buổi tập theo gói"} · {sport} · {timeLabel(item.scheduleTime)} · {item.durationMinutes} phút</p>
        <p><ClassCoachName coachId={item.coachId} /> · {room}</p>
      </div>
      <div className="manager-week-session-meta">
        <Badge status={item.status} />
        <span>{count != null ? `${count}/${item.maxCapacity} đã đăng ký`
          : countStatus.isPending ? "Đang tải số đăng ký…"
            : `Tối đa ${item.maxCapacity} · Chưa có số đăng ký`}</span>
      </div>
    </li>
  );
}

type SlotSelection = { date: string; code: string; title: string };
const outsideCode = "outside";

export default function ManagerWeekSchedule({
  days,
  items,
  sports,
  rooms,
  onView,
}: {
  days: Date[];
  items: SportClass[];
  sports: Record<number, string>;
  rooms: Record<number, string>;
  onView: (item: SportClass) => void;
}) {
  const [selected, setSelected] = useState<SlotSelection | null>(null);
  const dates = days.map((day) => localDate(day));
  const today = localDate();
  const bySlot = new Map<string, SportClass[]>();
  const sportName = (item: SportClass) => sports[item.sportId] ?? `Bộ môn #${item.sportId}`;
  const dayLabel = (day: Date) => dateLabel(day, {
    weekday: "long", day: "2-digit", month: "2-digit",
  });
  const uniqueItems = new Map(items.map((item) => [item.id, item]));
  for (const item of uniqueItems.values()) {
    const date = localDate(parseDate(item.scheduleTime));
    const slot = slotForSession(item);
    const key = `${date}:${slot?.code ?? outsideCode}`;
    const group = bySlot.get(key) ?? [];
    group.push(item);
    bySlot.set(key, group);
  }

  function renderCell(day: Date, date: string, code: string, label: string) {
    const group = bySlot.get(`${date}:${code}`) ?? [];
    const cancelled = group.filter((item) => item.status === "CANCELLED").length;
    const sportNames = group.map(sportName);
    const title = `${dayLabel(day)} · ${label}`;
    return (
      <td key={date} className={date === today ? "manager-week-today" : undefined}>
        {group.length === 0 ? <span className="manager-week-empty">Trống</span> : (
          <button
            type="button"
            className="manager-week-cell"
            aria-label={`${title} · ${group.length} buổi${cancelled ? ` · ${cancelled} đã hủy` : ""}`}
            onClick={() => setSelected({ date, code, title })}
          >
            <strong>{group.length} buổi</strong>
            <ScheduleSportMarkers names={sportNames} />
            {!!cancelled && <small>{cancelled} đã hủy</small>}
          </button>
        )}
      </td>
    );
  }

  const selectedItems = selected
    ? (bySlot.get(`${selected.date}:${selected.code}`) ?? []).slice().sort(
        (a, b) => parseDate(a.scheduleTime).getTime() - parseDate(b.scheduleTime).getTime() ||
          a.id - b.id,
      )
    : [];
  return (
    <>
      <div className="manager-week-scroll" role="region" aria-label="Lịch tuần theo ca" tabIndex={0}>
        <table className="manager-week-table" aria-label="Sáu ca học trong tuần">
          <thead>
            <tr>
              <th scope="col">Ca học <small>GMT+7</small></th>
              {days.map((day, index) => (
                <th scope="col" key={dates[index]} className={dates[index] === today ? "manager-week-today" : undefined}>
                  {dayLabel(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCHEDULING_SLOTS.map((slot) => (
              <tr key={slot.code}>
                <th scope="row">{slot.label}<small>{slot.start}–{slot.end}</small></th>
                {days.map((day, index) => renderCell(day, dates[index], slot.code, `${slot.label} · ${slot.start}–${slot.end}`))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Ngoài khung ca</th>
              {days.map((day, index) => renderCell(day, dates[index], outsideCode, "Ngoài khung ca"))}
            </tr>
          </tfoot>
        </table>
      </div>
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)} wide>
          {selectedItems.length ? (
            <ul className="manager-week-sessions">
              {selectedItems.map((item) => (
                <SessionRow
                  key={item.id}
                  item={item}
                  sport={sportName(item)}
                  room={rooms[item.roomId] ?? `Phòng #${item.roomId}`}
                  onView={() => {
                    setSelected(null);
                    onView(item);
                  }}
                />
              ))}
            </ul>
          ) : <p>Khung lịch này đang trống.</p>}
        </Modal>
      )}
    </>
  );
}
