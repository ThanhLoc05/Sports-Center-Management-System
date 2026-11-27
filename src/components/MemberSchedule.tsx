import { CheckCircle2, CircleCheck, Clock3, PlayCircle, UserCheck, XCircle } from "lucide-react";
import { ClassCoachName } from "../pages/Classes";
import { SCHEDULING_SLOTS, slotForSession, sessionTimeRange } from "../lib/scheduling-slots";
import type { SportClass } from "../lib/types";
import { dateLabel, localDate, parseDate } from "../lib/utils";
import { Empty } from "./ui";
import "../styles-member-schedule.css";

export function memberScheduleSport(name: string) {
  switch (name.trim().toLocaleLowerCase("vi")) {
    case "cầu lông": case "badminton": return "badminton";
    case "yoga": return "yoga";
    case "dance": return "dance";
    default: return "other";
  }
}

const states = {
  BOOKED: { label: "Đã đăng ký", Icon: CheckCircle2 },
  QUEUED: { label: "Đang chờ", Icon: Clock3 },
  INVITED: { label: "Có lời mời giữ chỗ", Icon: Clock3 },
  COMPLETED: { label: "Đã hoàn thành", Icon: CircleCheck },
  CANCELLED: { label: "Đã hủy", Icon: XCircle },
  ASSIGNED: { label: "Được phân công", Icon: UserCheck },
} as const;

export type MemberScheduleStatus = keyof typeof states;
const emptyRegistration = new Map<number, MemberScheduleStatus>();

export function scheduleSessionState(item: SportClass, now = new Date()) {
  if (item.status === "CANCELLED" || item.status === "COMPLETED") return states[item.status];
  const start = parseDate(item.scheduleTime).getTime();
  if (start > now.getTime()) return { label: "Sắp diễn ra", Icon: Clock3 };
  if (start + item.durationMinutes * 60_000 > now.getTime()) return { label: "Đang diễn ra", Icon: PlayCircle };
  return { label: "Đã kết thúc", Icon: CircleCheck };
}

function SessionCard({ item, sport, room, status, onOpen }: {
  item: SportClass;
  sport: string;
  room: string;
  status?: MemberScheduleStatus;
  onOpen: () => void;
}) {
  const state = status && states[status];
  const sessionState = scheduleSessionState(item);
  const [start, end] = sessionTimeRange(item).split(" – ");
  return (
    <button type="button" className="member-schedule-card schedule-list-item"
      data-sport={memberScheduleSport(sport)} data-status={status ?? item.status} aria-label={item.className} onClick={onOpen}>
      <strong className="member-schedule-time">{start}<span>–{end}</span></strong>
      <span className="member-schedule-title">{item.className}</span>
      <span className="member-schedule-sport">{sport}</span>
      <span className="member-schedule-resources"><ClassCoachName coachId={item.coachId} /> · {room}</span>
      <span className="member-schedule-status"><sessionState.Icon size={14} aria-hidden="true" />{sessionState.label}</span>
      {state && <span className="member-schedule-status"><state.Icon size={14} aria-hidden="true" />{state.label}</span>}
    </button>
  );
}

export default function MemberSchedule({ days, items, sports, rooms, registration = emptyRegistration, assigned, week, onView }: {
  days: Date[];
  items: SportClass[];
  sports: Record<number, string>;
  rooms: Record<number, string>;
  registration?: ReadonlyMap<number, MemberScheduleStatus>;
  assigned?: boolean;
  week: boolean;
  onView: (item: SportClass) => void;
}) {
  const today = localDate();
  const dates = days.map(localDate);
  const byDay = new Map<string, SportClass[]>();
  const sorted = [...items].sort((a, b) => parseDate(a.scheduleTime).getTime() - parseDate(b.scheduleTime).getTime() || a.id - b.id);
  for (const item of sorted) {
    const day = localDate(parseDate(item.scheduleTime));
    const group = byDay.get(day);
    if (group) group.push(item);
    else byDay.set(day, [item]);
  }

  const card = (item: SportClass) => (
    <SessionCard key={item.id} item={item} sport={sports[item.sportId] ?? `Bộ môn #${item.sportId}`}
      room={rooms[item.roomId] ?? `Phòng #${item.roomId}`} onOpen={() => onView(item)}
      status={item.status === "CANCELLED" || item.status === "COMPLETED" ? undefined : assigned ? "ASSIGNED" : registration.get(item.id)} />
  );
  const empty = <Empty title="Lịch tuần này đang trống" description="Chọn tuần khác hoặc khám phá thêm các lớp học." />;

  if (!week) return items.length ? (
    <div className="member-schedule-list">
      {days.map((day, index) => {
        const group = byDay.get(dates[index]);
        return group && <section key={dates[index]}>
          <h3 data-today={dates[index] === today}>{dateLabel(day, { weekday: "long", day: "2-digit", month: "2-digit" })}</h3>
          {group.map(card)}
        </section>;
      })}
    </div>
  ) : empty;

  const hasOutside = items.some((item) => !slotForSession(item));
  const row = (code: string | undefined, title: string, time?: string) => (
    <tr key={code ?? "outside"}>
      <th scope="row">{title}{time && <small>{time}</small>}</th>
      {dates.map((day) => (
        <td key={day}>
          {byDay.get(day)?.filter((item) => slotForSession(item)?.code === code).map(card)}
        </td>
      ))}
    </tr>
  );
  return (
    <>
      <div className="member-schedule-scroll" role="region" aria-label="Lịch tuần theo ca" tabIndex={0}>
        <table className="member-schedule-table" aria-label="Sáu ca tập trong tuần">
          <thead><tr>
            <th scope="col">Ca tập<small>GMT+7</small></th>
            {days.map((day, index) => (
              <th scope="col" key={dates[index]} data-today={dates[index] === today}
                aria-current={dates[index] === today ? "date" : undefined}>
                {dateLabel(day, { weekday: "short" })}<small>{dateLabel(day, { day: "2-digit", month: "2-digit" })}</small>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {SCHEDULING_SLOTS.map((slot) => row(slot.code, slot.label, `${slot.start}–${slot.end}`))}
            {hasOutside && row(undefined, "Ngoài khung ca")}
          </tbody>
        </table>
      </div>
      {!items.length && empty}
    </>
  );
}
