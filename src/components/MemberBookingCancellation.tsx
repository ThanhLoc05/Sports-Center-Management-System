import { useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, request } from "../lib/api";
import type { SportClass } from "../lib/types";
import { dateLabel, parseDate, timeLabel } from "../lib/utils";
import { sessionSlotLabel, sessionTimeRange } from "../lib/scheduling-slots";
import { Confirm, useToast } from "./ui";

export type MemberCancellationAction = { item: SportClass } & (
  { kind: "booking"; bookingId: number } | { kind: "waitlist" }
);

export function bookingCancellationBlocker(item: SportClass, now = new Date()) {
  if (item.status === "CANCELLED") return "Trung tâm đã hủy buổi tập này.";
  if (item.status === "COMPLETED") return "Buổi tập đã hoàn thành.";
  if (item.status !== "SCHEDULED" || parseDate(item.scheduleTime) <= now)
    return "Chỉ được hủy đăng ký trước khi buổi tập bắt đầu.";
  return null;
}

export function refreshMemberRegistration(client: QueryClient, memberId: number, classId: number) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ["bookings", memberId] }),
    client.invalidateQueries({ queryKey: ["memberBookings", memberId] }),
    client.invalidateQueries({ queryKey: ["booking-waitlist", memberId] }),
    client.invalidateQueries({ queryKey: ["booking-conduct", memberId] }),
    client.invalidateQueries({ queryKey: ["capacity", classId] }),
    client.invalidateQueries({ queryKey: ["classes"] }),
    client.invalidateQueries({ queryKey: ["classDetail", classId, memberId] }),
  ]);
}

export default function MemberBookingCancellation({ action, memberId, onClose, scheduleDetail }: {
  action: MemberCancellationAction;
  memberId: number;
  onClose: () => void;
  scheduleDetail?: boolean;
}) {
  const client = useQueryClient();
  const toast = useToast();
  const inFlight = useRef<Promise<void> | null>(null);
  const { item } = action;
  const leave = action.kind === "waitlist";
  const deadline = new Date(parseDate(item.scheduleTime).getTime() - 12 * 60 * 60_000);
  const dateTime = (value: string) => `${dateLabel(value)} · ${timeLabel(value)}`;
  const description = leave
    ? `${item.className} · ${dateTime(item.scheduleTime)}. Lời mời sẽ được từ chối và chỗ được chuyển cho hội viên tiếp theo trong danh sách chờ.`
    : `${item.className} · ${scheduleDetail
        ? `${dateLabel(item.scheduleTime)} · ${sessionSlotLabel(item)} · ${sessionTimeRange(item)}`
        : dateTime(item.scheduleTime)}. Mốc hủy không vi phạm: ${dateTime(deadline.toISOString())}.${new Date() > deadline ? " Bạn đang hủy trễ và có thể bị tính vi phạm giữ chỗ." : " Hủy trước ít nhất 12 giờ để tránh vi phạm."}`;

  async function submit() {
    if (action.kind === "waitlist") await request(`/classes/${item.id}/waitlist/decline`, { method: "POST" });
    else await api.cancelBooking(action.bookingId);
    await refreshMemberRegistration(client, memberId, item.id);
    toast(leave ? "Đã rời danh sách chờ." : "Đã hủy đăng ký lớp học.");
  }

  return <Confirm title={leave ? "Rời danh sách chờ?" : "Hủy đăng ký lớp?"}
    description={description} onClose={onClose}
    backLabel={scheduleDetail && !leave ? "Giữ đăng ký" : undefined}
    confirmLabel={scheduleDetail && !leave ? "Xác nhận hủy" : undefined}
    onConfirm={() => inFlight.current ??= submit().finally(() => { inFlight.current = null; })} />;
}
