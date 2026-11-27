import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCatalog } from "../lib/catalog";
import { dateLabel, errorText, timeLabel } from "../lib/utils";
import type { SportClass } from "../lib/types";
import { Button, Field, Loading, Modal } from "./ui";

const reasons = [
  ["COACH_UNAVAILABLE", "Huấn luyện viên không thể tham gia"],
  ["ROOM_UNAVAILABLE", "Sân/phòng không thể sử dụng"],
  ["SCHEDULE_CHANGE", "Thay đổi lịch hoạt động"],
  ["CREATED_BY_MISTAKE", "Tạo nhầm buổi học"],
  ["OTHER", "Lý do khác"],
];

export default function ClassCancellationDialog({ item, onClose, onSaved, dialogClassName }: {
  item: SportClass;
  onClose: () => void;
  onSaved: () => Promise<void>;
  dialogClassName?: string;
}) {
  const { session } = useAuth();
  const { rooms } = useCatalog();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const info = useQuery({
    queryKey: ["classCancellation", session?.user.id, item.id],
    queryFn: () => api.classCancellation(item.id),
    refetchOnMount: "always",
    retry: false,
  });
  const coaches = useQuery({ queryKey: ["coach-directory"], queryFn: api.coaches });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !info.data?.canCancel || !reason || (reason === "OTHER" && !description.trim())) return;
    setBusy(true);
    setError("");
    try {
      await api.cancelClass(item.id, { reason, description: reason === "OTHER" ? description.trim() : undefined, note: note.trim() || undefined });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="Hủy buổi học" onClose={onClose} dismissible={!busy} className={dialogClassName}
    description="Booking và danh sách chờ sẽ được đóng, lịch sử vẫn được lưu.">
    <div className="schedule-cancel-summary">
    <p><strong>{item.className}</strong> · {dateLabel(item.scheduleTime)} {timeLabel(item.scheduleTime)}</p>
    <p>HLV: {coaches.data?.find(coach => coach.coachId === item.coachId)?.fullName ?? "Chưa có tên HLV"} · Sân/phòng: {rooms[item.roomId] ?? `Phòng #${item.roomId}`}</p>
    {info.isFetching ? <Loading /> : info.error ? <p role="alert">{errorText(info.error)}</p>
      : <p>{info.data?.booked} Member đã xác nhận · {info.data?.waitlisted} Member trong danh sách chờ</p>}
    {info.data && !info.data.canCancel && <p role="alert">Buổi này hiện không thể hủy.</p>}
    </div>
    <form onSubmit={submit}>
      <Field label="Lý do hủy">
        <select required value={reason} onChange={event => setReason(event.target.value)} disabled={busy}>
          <option value="">Chọn lý do hủy</option>
          {reasons.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </Field>
      {reason === "OTHER" && <Field label="Mô tả lý do">
        <textarea required maxLength={500} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} />
      </Field>}
      <Field label="Ghi chú nội bộ (tùy chọn)">
        <textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} disabled={busy} />
      </Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-footer">
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Giữ buổi học</Button>
        <Button type="submit" variant="danger" loading={busy} disabled={info.isFetching || !info.data?.canCancel || !reason || (reason === "OTHER" && !description.trim())}>
          Xác nhận hủy buổi học
        </Button>
      </div>
    </form>
  </Modal>;
}
