import type { SportClass } from "./types";
import { localDate, parseDate, timeLabel } from "./utils";

export const SCHEDULING_SLOTS = [
  { code: "SLOT_01", label: "Ca 01", start: "06:00", end: "07:30", durationMinutes: 90 },
  { code: "SLOT_02", label: "Ca 02", start: "08:00", end: "09:30", durationMinutes: 90 },
  { code: "SLOT_03", label: "Ca 03", start: "14:00", end: "15:30", durationMinutes: 90 },
  { code: "SLOT_04", label: "Ca 04", start: "15:45", end: "17:15", durationMinutes: 90 },
  { code: "SLOT_05", label: "Ca 05", start: "17:30", end: "19:00", durationMinutes: 90 },
  { code: "SLOT_06", label: "Ca 06", start: "19:15", end: "20:45", durationMinutes: 90 },
] as const;

export function sessionSlotLabel(item: Pick<SportClass, "scheduleTime" | "durationMinutes">) {
  const slot = slotForSession(item);
  if (!slot) return "Ngoài khung ca";
  return `${slot.label} · ${slot.start < "12:00" ? "Buổi sáng" : slot.start < "18:00" ? "Buổi chiều" : "Buổi tối"}`;
}

export function sessionTimeRange(item: Pick<SportClass, "scheduleTime" | "durationMinutes">) {
  const end = new Date(parseDate(item.scheduleTime).getTime() + item.durationMinutes * 60_000);
  return `${timeLabel(item.scheduleTime)} – ${timeLabel(end.toISOString())}`;
}

export function vietnamScheduleParts(value: string | Date) {
  const instant = parseDate(value);
  return { date: localDate(instant), time: timeLabel(instant.toISOString()) };
}

export function slotForSession(item: Pick<SportClass, "scheduleTime" | "durationMinutes">) {
  const instant = parseDate(item.scheduleTime);
  if (!Number.isFinite(instant.getTime()) || instant.getTime() % 60_000 !== 0) return undefined;
  const { time } = vietnamScheduleParts(instant);
  return SCHEDULING_SLOTS.find(slot => slot.start === time && slot.durationMinutes === item.durationMinutes);
}
