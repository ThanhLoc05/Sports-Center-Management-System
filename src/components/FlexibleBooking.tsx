import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, request } from "../lib/api";
import type { Booking, CoachProfessionalProfile, SportClass, Subscription } from "../lib/types";
import { dateLabel, errorText, timeLabel } from "../lib/utils";
import { Button, Field, FormModal, Notice } from "./ui";

export function FlexibleBooking({ classes, sports, rooms, coaches, subscription, level, onClose }: {
  classes: SportClass[];
  sports: Record<number, string>;
  rooms: Record<number, string>;
  coaches: CoachProfessionalProfile[];
  subscription: Subscription | null;
  level?: string | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [sport, setSport] = useState(subscription?.selectedSportId ?? 0);
  const [dates, setDates] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [coach, setCoach] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [savingSport, setSavingSport] = useState(false);
  const [waitlistAction, setWaitlistAction] = useState(false);
  const conduct = useQuery({
    queryKey: ["booking-conduct", subscription?.memberId],
    queryFn: () => request<{ held: number; limit: number; violations: number; restrictedUntil?: string }>("/bookings/my-conduct"),
  });
  const waitlist = useQuery({
    queryKey: ["booking-waitlist", subscription?.memberId],
    queryFn: () => request<{ classId: number; status: string; inviteUntil: string | null }[]>("/bookings/my-waitlist"),
    refetchInterval: 15_000,
  });
  const needsSport = subscription && level === "STANDARD" && !subscription.selectedSportId;
  const now = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium",
  }).format(new Date()).replace(" ", "T");
  const upcoming = classes.filter((c) => c.status === "SCHEDULED" && c.scheduleTime > now && !c.regularClassId && !c.courseId);
  const days = [...new Set(upcoming.map((c) => c.scheduleTime.slice(0, 10)))].sort();
  const visible = upcoming.filter((c) => c.sportId === sport &&
    (!dates.length || dates.includes(c.scheduleTime.slice(0, 10))) &&
    (!coach || c.coachId === coach) &&
    (!from || c.scheduleTime.slice(11, 16) >= from) &&
    (!until || c.scheduleTime.slice(11, 16) <= until));
  const capacities = useQueries({
    queries: visible.map((c) => ({ queryKey: ["capacity", c.id], queryFn: () => api.capacity(c.id) })),
  });
  const coachName = (id: number) => coaches.find((c) => c.coachId === id)?.fullName || "Chưa có tên HLV";
  async function updateWaitlist(id: number, accept: boolean) {
    setWaitlistAction(true);
    setError("");
    try {
      await request(`/classes/${id}/waitlist${accept ? "/accept" : ""}`, { method: "POST" });
      await client.invalidateQueries();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setWaitlistAction(false);
    }
  }
  return (
    <FormModal title="Đăng ký nhiều buổi" onClose={onClose} submitLabel="Xác nhận đăng ký"
      submitDisabled={!selected.length || !!needsSport || savingSport}
      onSubmit={async () => {
        await request<Booking[]>("/bookings/batch", {
          method: "POST",
          body: JSON.stringify({ classIds: selected }),
        });
        await client.invalidateQueries();
      }}>
      {!subscription && <Notice>Kiểm tra gói tập trước khi chọn buổi.</Notice>}
      {conduct.data && <Notice>
        Đang giữ {conduct.data.held}/{conduct.data.limit} chỗ.
        {conduct.data.violations >= 2 && ` Có ${conduct.data.violations} vi phạm trong kỳ theo dõi.`}
        {conduct.data.restrictedUntil && ` Giới hạn đến ${dateLabel(conduct.data.restrictedUntil)} ${timeLabel(conduct.data.restrictedUntil)}.`}
      </Notice>}
      {error && <p role="alert">{error}</p>}
      {waitlist.error && <p role="alert">{errorText(waitlist.error)}</p>}
      <Field label="Bộ môn">
        <select value={sport || ""} onChange={(e) => setSport(Number(e.target.value))}>
          <option value="">Chọn bộ môn</option>
          {Object.entries(sports).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </Field>
      {needsSport && (
        <>
          <Notice>Kỳ STANDARD cũ cần chọn một môn trước khi đặt buổi mới. Lựa chọn được giữ đến hết kỳ.</Notice>
          <Button type="button" disabled={!sport || savingSport} onClick={async () => {
            if (!subscription) return;
            setSavingSport(true);
            setError("");
            try {
              await request("/memberships/" + subscription.id + "/sport", {
                method: "PATCH", body: JSON.stringify({ sportId: sport }),
              });
              await client.invalidateQueries({ queryKey: ["activeSubscription", subscription.memberId] });
            } catch (failure) {
              setError(errorText(failure));
            } finally {
              setSavingSport(false);
            }
          }}>Xác nhận môn của kỳ hiện tại</Button>
        </>
      )}
      <fieldset>
        <legend>Ngày muốn học</legend>
        {days.map((day) => <label key={day} className="check-option">
          <input type="checkbox" checked={dates.includes(day)} onChange={(e) =>
            setDates(e.target.checked ? [...dates, day] : dates.filter((d) => d !== day))} />
          {dateLabel(day)}
        </label>)}
      </fieldset>
      <Field label="Từ giờ"><input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="Đến giờ"><input type="time" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
      <Field label="Huấn luyện viên">
        <select value={coach} onChange={(e) => setCoach(Number(e.target.value))}>
          <option value={0}>Tất cả</option>
          {coaches.map((c) => <option key={c.coachId} value={c.coachId}>{c.fullName}</option>)}
        </select>
      </Field>
      {!visible.length && <Notice>{sport ? "Không có buổi phù hợp." : "Chọn bộ môn để xem các buổi."}</Notice>}
      {visible.map((c, index) => {
        const capacity = capacities[index];
        const entry = waitlist.data?.find((item) => item.classId === c.id);
        return <div key={c.id}>
          <label className="check-option">
          <input type="checkbox" checked={selected.includes(c.id)}
            disabled={!selected.includes(c.id) && (capacity?.data ?? 0) <= 0}
            onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))} />
          <span>{c.className} · {dateLabel(c.scheduleTime)} {timeLabel(c.scheduleTime)} · {coachName(c.coachId)}
            {" · "}{rooms[c.roomId] || "Chưa có tên phòng"} · {capacity?.isError ? "Lỗi tải số chỗ" :
              capacity?.data == null ? "Đang tải số chỗ" : `Còn ${capacity.data}/${c.maxCapacity} chỗ`}
          </span>
          </label>
          {capacity?.data === 0 && !["QUEUED", "INVITED", "ACCEPTED"].includes(entry?.status ?? "") &&
            <Button type="button" variant="secondary" disabled={waitlistAction}
              onClick={() => void updateWaitlist(c.id, false)}>Vào danh sách chờ</Button>}
        </div>;
      })}
      {!!waitlist.data?.length && <fieldset>
        <legend>Danh sách chờ của tôi</legend>
        {waitlist.data.map((entry) => <div key={entry.classId}>
          {classes.find((c) => c.id === entry.classId)?.className || `Buổi #${entry.classId}`}
          {" · "}{({ QUEUED: "Đang chờ", INVITED: "Đã đến lượt", EXPIRED: "Hết hạn",
            ACCEPTED: "Đã đặt", CANCELLED: "Đã đóng" } as Record<string, string>)[entry.status] ?? entry.status}
          {entry.status === "INVITED" && entry.inviteUntil && <>
            {" · đến "}{dateLabel(entry.inviteUntil)} {timeLabel(entry.inviteUntil)}
            {" "}<Button type="button" disabled={waitlistAction}
              onClick={() => void updateWaitlist(entry.classId, true)}>Xác nhận lời mời</Button>
          </>}
        </div>)}
      </fieldset>}
      {!!selected.length && <fieldset>
        <legend>Danh sách dự kiến ({selected.length} buổi)</legend>
        {selected.map((id) => <div key={id}>
          {classes.find((c) => c.id === id)?.className || `Buổi #${id}`}
          {" "}<Button type="button" variant="secondary" onClick={() => setSelected(selected.filter((item) => item !== id))}>Bỏ buổi này</Button>
        </div>)}
      </fieldset>}
    </FormModal>
  );
}
