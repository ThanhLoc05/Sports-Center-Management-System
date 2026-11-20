import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, getSession } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Feedback as FeedbackRecord, FeedbackInput } from "../lib/types";
import { dateLabel, matches } from "../lib/utils";
import { Button, DataTable, ErrorState, Field, FormModal, Loading, Notice, PageHeader, Panel, useToast } from "../components/ui";

type Kind = "coach" | "class" | "member";
const labels = { coach: "Huấn luyện viên", class: "Lớp học", member: "Thành viên" };
const placeholders = { coach: "Nhập ID huấn luyện viên", class: "Nhập ID lớp học", member: "Nhập ID thành viên" };
function useCoachDirectory() {
  return useQuery({ queryKey: ["coach-directory"], queryFn: api.coaches, retry: false });
}

function FeedbackSearch({ kind, text, selected, onEdit, onPick }: {
  kind: Kind;
  text: string;
  selected: string;
  onEdit: (text: string) => void;
  onPick: (id: string, name: string) => void;
}) {
  const { session } = useAuth();
  const actor = session!.user;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(-1);
  const directory = useQuery({
    queryKey: ["feedback-directory", actor.roleName, actor.id, kind],
    enabled: open,
    queryFn: async () => {
      if (kind === "coach") {
        return (await api.coaches()).map(p => ({ id: p.coachId, name: p.fullName }));
      }
      if (kind === "class") {
        return (await api.classes()).map(c => ({ id: c.id, name: c.className }));
      }
      if (actor.roleName === "MEMBER") return [{ id: actor.id, name: actor.fullName }];
      if (actor.roleName !== "CENTER_MANAGER" && actor.roleName !== "RECEPTIONIST") return [];
      return (await api.users()).filter(u => u.roleName === "MEMBER")
        .map(u => ({ id: u.id, name: u.fullName }));
    },
    retry: false,
  });
  const label = labels[kind].toLowerCase();
  const term = selected ? "" : text.trim();
  const choices = (directory.data || []).filter(profile => /^\d+$/.test(term)
    ? profile.id === Number(term) : matches(term, profile.name));
  const active = choices[index];
  const activeId = open && active ? `${listId}-${active.id}` : undefined;
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);
  function close() {
    setOpen(false);
    setIndex(-1);
  }
  function pick(profile: (typeof choices)[number]) {
    onPick(String(profile.id), profile.name);
    close();
  }
  return <Field label="Tìm theo tên hoặc ID">
    <div className="feedback-target-search">
      <input type="search" role="combobox" value={text} autoComplete="off"
        aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={activeId} placeholder={`Tên ${label}, người gửi hoặc ID`}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={close}
        onChange={event => { onEdit(event.target.value); setIndex(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setIndex(event.key === "ArrowDown" ? Math.min(index + 1, choices.length - 1)
              : index < 0 ? choices.length - 1 : Math.max(index - 1, 0));
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            close();
          } else if (event.key === "Enter") {
            if (open && active) { event.preventDefault(); pick(active); }
            else close();
          }
        }} />
      {open && <div className="feedback-target-options" id={listId} role="listbox" aria-label={`Gợi ý ${label}`}>
        {choices.map((profile, i) => <div role="option" id={`${listId}-${profile.id}`} key={profile.id}
          aria-selected={String(profile.id) === selected} data-active={index === i}
          onMouseDown={event => event.preventDefault()} onClick={() => pick(profile)}>
          {profile.name} · #{profile.id}
        </div>)}
        {!choices.length && <div role="option" aria-disabled="true">{directory.isPending ? "Đang tải danh bạ…"
          : directory.error ? `Chưa tải được danh sách ${label}.` : `Không tìm thấy ${label} phù hợp.`}</div>}
      </div>}
    </div>
  </Field>;
}

function CoachPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const directory = useCoachDirectory();
  if (directory.isPending) return <Loading />;
  if (directory.error) return <ErrorState error={directory.error} retry={directory.refetch} />;
  return <Field label="Chọn huấn luyện viên">
    <select name="targetId" value={value} required onChange={event => onChange(event.target.value)}>
      <option value="">Chọn huấn luyện viên</option>
      {directory.data.map(profile => <option key={profile.coachId} value={profile.coachId}>
        {profile.fullName} · #{profile.coachId}
      </option>)}
    </select>
  </Field>;
}
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [create, setCreate] = useState(false);
  const client = useQueryClient();
  const toast = useToast();
  const currentActor = () => {
    const current = getSession();
    return current?.mode === "api" && current.user.id === actor.id && current.user.roleName === actor.roleName;
  };
  const q = useQuery({
    queryKey: ["feedbacks", actor.id, actor.roleName, kind],
    queryFn: () => api.feedbackList(kind),
    enabled: member || coach || staff,
    retry: false,
  });
  const targetId = (row: FeedbackRecord) => kind === "class" ? row.classId : row.toUserId;
  const rows = (q.data || []).filter(row => {
    if (selectedId) return targetId(row) === Number(selectedId);
    return /^\d+$/.test(filter)
      ? targetId(row) === Number(filter)
      : matches(filter, row.targetName, row.senderName);
  });
  const rated = rows.flatMap(row => row.rating === null ? [] : [row.rating]);
  const average = rated.length
    ? Number((rated.reduce((sum, score) => sum + score, 0) / rated.length).toFixed(2))
    : "—";
  function editSearch(text: string) {
    setSearch(text);
    setSelectedId("");
    if (!text.trim()) setFilter("");
  }
  function changeKind(next: Kind) {
    setKind(next);
    setSelectedId("");
    setSearch("");
    setFilter("");
  }
  return <>
    <PageHeader title="Đánh giá" description="Đánh giá HLV, lớp học và nhận xét dành cho thành viên."
      actions={member || coach ? <Button onClick={() => setCreate(true)}>{coach ? "Nhận xét thành viên" : "Viết đánh giá"}</Button> : undefined} />
    {!member && !coach && !staff ? <Notice>Vai trò của bạn chưa được hỗ trợ tại màn hình này.</Notice> : <>
      <Panel title="Tra cứu đánh giá" className="feedback-lookup">
        <form className="inline-lookup" onSubmit={event => {
          event.preventDefault();
          setFilter(search.trim());
        }}>
          <Field label="Loại dữ liệu"><select value={kind} onChange={event => changeKind(event.target.value as Kind)}>
            <option value="coach">Đánh giá HLV</option><option value="class">Đánh giá lớp</option>
            {(member || staff) && <option value="member">{member ? "Nhận xét dành cho tôi" : "Nhận xét thành viên"}</option>}
          </select></Field>
          <FeedbackSearch key={kind} kind={kind} text={search} selected={selectedId} onEdit={editSearch}
            onPick={(id, name) => { setSelectedId(id); setSearch(name); setFilter(""); }} />
          <Button type="submit">Tìm kiếm</Button>
        </form>
      </Panel>
      <Panel title="Danh sách đánh giá">
        {q.isPending || q.isFetching ? <Loading /> : q.error ?
          <ErrorState error={q.error} retry={q.refetch} /> : <>
            {kind === "coach" && <p>Điểm trung bình: {average} / 5 · Tổng đánh giá: {rows.length}</p>}
            {selectedId && !rows.length ? <Notice>{kind === "member" ? "Thành viên này chưa có nhận xét." : `${labels[kind]} này chưa có đánh giá.`}</Notice> :
            <DataTable key={`${kind}:${filter}:${selectedId}`} rows={rows} columns={[
              { key: "target", label: labels[kind], render: f => f.targetName || `#${targetId(f) ?? "—"}` },
              { key: "from", label: "Người gửi", render: f => f.senderName || `Tài khoản #${f.fromUserId}` },
              { key: "type", label: "Loại", render: f => ({ MEMBER_TO_COACH: "Thành viên đánh giá HLV", CLASS_FEEDBACK: "Đánh giá lớp", COACH_TO_MEMBER: "HLV nhận xét thành viên" })[f.type] },
              { key: "rating", label: "Điểm", render: f => f.rating === null ? "Không chấm điểm" : `${f.rating} / 5` },
              { key: "comment", label: "Nội dung", render: f => <span style={{ whiteSpace: "pre-wrap" }}>{f.comment}</span> },
              { key: "date", label: "Ngày gửi", render: f => f.createdAt ? dateLabel(f.createdAt) : "Chưa có thời điểm" },
            ]} />}
          </>}
      </Panel>
    </>}
    {create && (member || coach) && <FeedbackForm coach={coach}
      initialKind={member && kind === "class" ? "class" : "coach"}
      initialId={member && kind !== "member" && selectedId ? Number(selectedId) : member && kind !== "member" && filter && rows.length && rows.every(row => targetId(row) === targetId(rows[0]))
        ? targetId(rows[0]) ?? undefined : undefined}
      onClose={() => setCreate(false)} onSaved={async feedback => {
        if (!currentActor()) return;
        // Không gọi GET member của người khác sau khi HLV gửi: API hiện không cho phép quyền đọc đó.
        if (member) {
          changeKind(feedback.type === "CLASS_FEEDBACK" ? "class" : "coach");
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
  const [coachId, setCoachId] = useState(initialKind === "coach" && initialId ? String(initialId) : "");
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
    {!coach && kind === "coach" ? <CoachPicker value={coachId} onChange={setCoachId} /> :
    <Field label={coach ? "ID thành viên nhận xét" : kind === "class" ? "ID lớp nhận đánh giá" : "ID HLV nhận đánh giá"}>
      <input key={kind} name="targetId" type="number" min={1} step={1} required placeholder={coach ? placeholders.member : placeholders[kind]} defaultValue={kind === initialKind ? initialId : undefined} />
    </Field>}
    <Field label="Điểm đánh giá (không bắt buộc)"><select name="rating" defaultValue="">
      <option value="">Không chấm điểm</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}
    </select></Field>
    <Field label="Nội dung đánh giá"><textarea name="comment" required rows={5} /></Field>
    {coach && <Notice>Nhận xét được gửi cho thành viên. API hiện chưa cho HLV xem danh sách nhận xét của thành viên khác.</Notice>}
  </FormModal>;
}
