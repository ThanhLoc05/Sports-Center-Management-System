import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, getSession } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Feedback as FeedbackRecord, FeedbackInput } from "../lib/types";
import { dateLabel } from "../lib/utils";
import { Button, DataTable, ErrorState, Field, FormModal, Loading, Notice, PageHeader, Panel, useToast } from "../components/ui";

type Kind = "coach" | "class" | "member";
const labels = { coach: "ID HLV", class: "ID lớp", member: "ID thành viên" };
export default function Feedback() {
  const { session } = useAuth();
  if (session?.mode !== "api") return <><PageHeader title="Đánh giá" /><Notice>Đánh giá sử dụng API Backend; chưa có dữ liệu đánh giá trong demo.</Notice></>;
  return <FeedbackContent key={`${session.user.id}:${session.user.roleName}`} />;
}
function FeedbackContent() {
  const { session } = useAuth();
  const actor = session!.user;
  const member = actor.roleName === "MEMBER", coach = actor.roleName === "COACH";
  const staff = ["RECEPTIONIST", "CENTER_MANAGER"].includes(actor.roleName);
  const [kind, setKind] = useState<Kind>(member ? "member" : "coach");
  const [targetId, setTargetId] = useState(member || coach ? String(actor.id) : "");
  const [selection, setSelection] = useState<{ kind: Kind; id: number } | null>(member || coach ? { kind: member ? "member" : "coach", id: actor.id } : null);
  const [lookupError, setLookupError] = useState("");
  const [create, setCreate] = useState(false);
  const client = useQueryClient();
  const toast = useToast();
  const currentActor = () => {
    const current = getSession();
    return current?.mode === "api" && current.user.id === actor.id && current.user.roleName === actor.roleName;
  };
  const q = useQuery({
    queryKey: ["feedbacks", actor.id, actor.roleName, selection?.kind, selection?.id],
    queryFn: async (): Promise<{ feedbacks: FeedbackRecord[]; averageRating?: number; totalReviews?: number }> => {
      const target = selection!;
      if (target.kind === "coach") return api.coachFeedback(target.id);
      return { feedbacks: await (target.kind === "class" ? api.classFeedback(target.id) : api.memberFeedback(target.id)) };
    },
    enabled: !!selection && (member || coach || staff),
    retry: false,
  });
  return <>
    <PageHeader title="Đánh giá" description="Đánh giá HLV, lớp học và nhận xét dành cho thành viên."
      actions={member || coach ? <Button onClick={() => setCreate(true)}>{coach ? "Nhận xét thành viên" : "Viết đánh giá"}</Button> : undefined} />
    {!member && !coach && !staff ? <Notice>Vai trò của bạn chưa được hỗ trợ tại màn hình này.</Notice> : <>
      <Panel title="Tra cứu đánh giá">
        <form className="inline-lookup" onSubmit={e => {
          e.preventDefault(); const id = Number(targetId);
          if (!Number.isSafeInteger(id) || id < 1) { setLookupError("Nhập ID nguyên dương hợp lệ."); return; }
          setLookupError(""); setSelection({ kind, id });
        }}>
          <Field label="Loại dữ liệu"><select value={kind} onChange={e => {
            const value = e.target.value as Kind; setKind(value); setLookupError("");
            const own = (value === "member" && member) || (value === "coach" && coach);
            setTargetId(own ? String(actor.id) : ""); setSelection(own ? { kind: value, id: actor.id } : null);
          }}>
            <option value="coach">Đánh giá HLV</option><option value="class">Đánh giá lớp</option>
            {(member || staff) && <option value="member">{member ? "Nhận xét dành cho tôi" : "Nhận xét thành viên"}</option>}
          </select></Field>
          <Field label={labels[kind]}><input type="number" min={1} step={1} required value={targetId}
            readOnly={member && kind === "member"} onChange={e => { setTargetId(e.target.value); setSelection(null); setLookupError(""); }} /></Field>
          <Button type="submit">Xem đánh giá</Button>
        </form>
        {lookupError && <p role="alert" className="form-error">{lookupError}</p>}
      </Panel>
      <Panel title="Danh sách đánh giá">
        {!selection ? <Notice>Chọn đối tượng và ID để xem đánh giá.</Notice> : q.isPending || q.isFetching ? <Loading /> : q.error ?
          <ErrorState error={q.error} retry={q.refetch} /> : <>
            {selection.kind === "coach" && <p>Điểm trung bình: {q.data?.averageRating} / 5 · Tổng đánh giá: {q.data?.totalReviews}</p>}
            <DataTable rows={q.data?.feedbacks || []} columns={[
              { key: "from", label: "Người gửi", render: f => `Tài khoản #${f.fromUserId}` },
              { key: "type", label: "Loại", render: f => ({ MEMBER_TO_COACH: "Thành viên đánh giá HLV", CLASS_FEEDBACK: "Đánh giá lớp", COACH_TO_MEMBER: "HLV nhận xét thành viên" })[f.type] },
              { key: "rating", label: "Điểm", render: f => f.rating === null ? "Không chấm điểm" : `${f.rating} / 5` },
              { key: "comment", label: "Nội dung", render: f => <span style={{ whiteSpace: "pre-wrap" }}>{f.comment}</span> },
              { key: "date", label: "Ngày gửi", render: f => f.createdAt ? dateLabel(f.createdAt) : "Chưa có thời điểm" },
            ]} />
          </>}
      </Panel>
    </>}
    {create && (member || coach) && <FeedbackForm coach={coach}
      initialKind={member && selection?.kind === "class" ? "class" : "coach"}
      initialId={member && selection && selection.kind !== "member" ? selection.id : undefined}
      onClose={() => setCreate(false)} onSaved={async feedback => {
        if (!currentActor()) return;
        // Không gọi GET member của người khác sau khi HLV gửi: API hiện không cho phép quyền đọc đó.
        if (member) {
          const next = feedback.type === "CLASS_FEEDBACK" ? { kind: "class" as const, id: feedback.classId! } : { kind: "coach" as const, id: feedback.toUserId! };
          setKind(next.kind); setTargetId(String(next.id)); setSelection(next);
        }
        await client.invalidateQueries({ queryKey: ["feedbacks", actor.id, actor.roleName] });
        if (currentActor()) toast(coach ? "Đã gửi nhận xét thành viên." : "Đã gửi đánh giá.");
      }} />}
  </>;
}
function FeedbackForm({ coach, initialKind, initialId, onClose, onSaved }: {
  coach: boolean; initialKind: "coach" | "class"; initialId?: number;
  onClose: () => void; onSaved: (feedback: FeedbackRecord) => Promise<void>;
}) {
  const [kind, setKind] = useState(initialKind);
  const saving = useRef<Promise<void> | null>(null);
  return <FormModal title={coach ? "Nhận xét thành viên" : "Gửi đánh giá"} submitLabel={coach ? "Gửi nhận xét" : "Gửi đánh giá"} onClose={onClose}
    onSubmit={data => {
      if (saving.current) return saving.current;
      const id = Number(data.get("targetId"));
      if (!Number.isSafeInteger(id) || id < 1) throw new ApiError("Nhập ID nguyên dương hợp lệ.");
      const score = String(data.get("rating") || "");
      const input: FeedbackInput = {
        ...(coach || kind === "coach" ? { toUserId: id } : { classId: id }),
        comment: String(data.get("comment") || ""), rating: score === "" ? null : Number(score),
      };
      saving.current = (async () => { try { await onSaved(await api.createFeedback(input)); } finally { saving.current = null; } })();
      return saving.current;
    }}>
    {!coach && <Field label="Đối tượng đánh giá"><select value={kind} onChange={e => setKind(e.target.value as "coach" | "class")}>
      <option value="coach">HLV</option><option value="class">Lớp học</option>
    </select></Field>}
    <Field label={coach ? "ID thành viên nhận xét" : kind === "class" ? "ID lớp nhận đánh giá" : "ID HLV nhận đánh giá"}>
      <input key={kind} name="targetId" type="number" min={1} step={1} required defaultValue={kind === initialKind ? initialId : undefined} />
    </Field>
    <Field label="Điểm đánh giá (không bắt buộc)"><select name="rating" defaultValue="">
      <option value="">Không chấm điểm</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}
    </select></Field>
    <Field label="Nội dung đánh giá"><textarea name="comment" required rows={5} /></Field>
    {coach && <Notice>Nhận xét được gửi cho thành viên. API hiện chưa cho HLV xem danh sách nhận xét của thành viên khác.</Notice>}
  </FormModal>;
}
