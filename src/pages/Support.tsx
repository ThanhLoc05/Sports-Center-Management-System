/**
 * Support API dùng DTO riêng; nhánh demo giữ dữ liệu và thao tác local hiện có.
 */
import { useRef, useState } from "react";
import { CheckCircle2, LifeBuoy, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useUsers } from "../lib/hooks";
import { readDemo } from "../lib/demo";
import { api, ApiError, getSession, updateDemo } from "../lib/api";

import { usePermissions } from "../lib/hooks";
import { requireDemoPermission } from "../lib/center";
import type { SupportRequest, SupportTicket } from "../lib/types";
import { dateLabel, dateTimeLocal, idLabel, matches } from "../lib/utils";
import {
  Badge,
  Button,
  DataTable,
  DemoOnly,
  ErrorState,
  Field,
  FormModal,
  MemberField,
  Loading,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  useToast,
} from "../components/ui";
export default function Support() {
  const { session } = useAuth();
  return session?.mode === "api"
    ? <ApiSupport key={`${session.user.id}:${session.user.roleName}`} />
    : <DemoSupport />;
}
function ApiSupport() {
  const { session } = useAuth();
  const actor = session!.user;
  const member = actor.roleName === "MEMBER";
  const staff = ["RECEPTIONIST", "CENTER_MANAGER"].includes(actor.roleName);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [create, setCreate] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const creating = useRef(false);
  const client = useQueryClient();
  const toast = useToast();
  // Tách cache theo tài khoản/vai trò; đổi tài khoản không giữ phiếu hoặc form của người trước.
  const scope = ["support-tickets", actor.id, actor.roleName] as const;
  const tickets = useQuery({ queryKey: scope, queryFn: api.supportTickets, enabled: member || staff, retry: false });
  const currentActor = () => {
    const current = getSession();
    return current?.mode === "api" && current.user.id === actor.id && current.user.roleName === actor.roleName;
  };
  const saved = async (ticket: SupportTicket) => {
    if (!currentActor()) return;
    client.setQueryData([...scope, "detail", ticket.id], ticket);
    await client.invalidateQueries({ queryKey: scope });
  };
  const rows = (tickets.data || []).filter(t =>
    (staff || t.memberId === actor.id) && (status === "all" || status === t.status) &&
    matches(search, t.subject, t.content, idLabel(t.id, "HT"), t.memberId),
  );
  return <>
    <PageHeader eyebrow="WE'RE HERE TO HELP" title="Yêu cầu hỗ trợ"
      description="Mỗi câu hỏi đều xứng đáng được lắng nghe."
      actions={member ? <Button onClick={() => setCreate(true)}><Plus size={17} />Tạo yêu cầu hỗ trợ</Button> : undefined} />
    {!member && !staff ? <Notice>Vai trò của bạn chưa được hỗ trợ tại màn hình này.</Notice> : <>
      <div className="support-intro"><span><LifeBuoy size={34} strokeWidth={1.4} /></span><div>
        <h2>Cần một người đồng hành?</h2><p>Gửi câu hỏi về gói tập, lịch học hoặc trải nghiệm tại trung tâm. Lễ tân sẽ là người tiếp nhận.</p>
      </div></div>
      <Panel>
        <div className="table-toolbar"><div><h2>{staff ? "Tất cả yêu cầu" : "Yêu cầu của tôi"}<span className="count-chip">{rows.length}</span></h2></div>
          <div className="table-filters">
            <SearchInput value={search} onChange={setSearch} placeholder="Tìm yêu cầu..." />
            <Select label="Trạng thái yêu cầu" value={status} onChange={setStatus}>
              <option value="all">Tất cả trạng thái</option><option value="OPEN">Chờ tiếp nhận</option><option value="RESOLVED">Đã xử lý</option>
            </Select>
          </div>
        </div>
        {tickets.isPending ? <Loading /> : tickets.error ? <ErrorState error={tickets.error} retry={tickets.refetch} /> :
          <DataTable rows={rows} columns={[
            { key: "id", label: "Mã yêu cầu", render: t => <span className="mono">{idLabel(t.id, "HT")}</span> },
            { key: "subject", label: "Nội dung", render: t => <button className="table-name" onClick={() => setDetailId(t.id)}>{t.subject}</button> },
            { key: "member", label: "Người gửi", render: t => `Thành viên #${t.memberId}` },
            { key: "date", label: "Ngày tiếp nhận", render: t => dateLabel(t.createdAt) },
            { key: "status", label: "Trạng thái", render: t => <Badge status={t.status} /> },
            { key: "action", label: "Thao tác", render: t => <button className="subtle-link" onClick={() => setDetailId(t.id)}>Xem yêu cầu</button> },
          ]} />}
      </Panel>
    </>}
    {create && member && <FormModal title="Yêu cầu hỗ trợ mới" submitLabel="Gửi yêu cầu" onClose={() => setCreate(false)}
      onSubmit={async d => {
        if (creating.current) return;
        creating.current = true;
        try {
          const ticket = await api.createSupportTicket({ subject: String(d.get("subject") || ""), content: String(d.get("content") || "") });
          await saved(ticket);
          if (currentActor()) toast("Đã gửi yêu cầu hỗ trợ.");
        } finally { creating.current = false; }
      }}>
      <Field label="Tiêu đề"><input name="subject" required maxLength={255} /></Field>
      <Field label="Nội dung chi tiết"><textarea name="content" required rows={5} /></Field>
    </FormModal>}
    {detailId !== null && <ApiSupportDetail key={detailId} id={detailId} scope={scope} staff={staff}
      onClose={() => setDetailId(null)} onSaved={saved} currentActor={currentActor} />}
  </>;
}
function ApiSupportDetail({ id, scope, staff, onClose, onSaved, currentActor }: {
  id: number; scope: readonly [string, number, string]; staff: boolean; onClose: () => void;
  onSaved: (ticket: SupportTicket) => Promise<void>; currentActor: () => boolean;
}) {
  const ticket = useQuery({ queryKey: [...scope, "detail", id], queryFn: () => api.supportTicket(id), retry: false });
  const [resolve, setResolve] = useState(false);
  const resolving = useRef(false);
  const toast = useToast();
  const data = ticket.data;
  return <>
    <Modal title="Chi tiết yêu cầu hỗ trợ" onClose={onClose}>
      {ticket.isPending || ticket.isFetching ? <Loading /> : ticket.error ? <ErrorState error={ticket.error} retry={ticket.refetch} /> : data &&
        <div className="support-detail">
          <h3>{data.subject}</h3><Badge status={data.status} /><p>{data.content}</p>
          <p>Ngày tiếp nhận: {dateLabel(data.createdAt)}</p>
          {data.response && <><h3>Phản hồi từ trung tâm</h3><p>{data.response}</p></>}
          {data.resolvedBy !== null && <p>Người xử lý: #{data.resolvedBy}</p>}
          {data.resolvedAt && <p>Ngày xử lý: {dateLabel(data.resolvedAt)}</p>}
          {staff && data.status === "OPEN" && <Button onClick={() => setResolve(true)}>Xử lý yêu cầu</Button>}
        </div>}
    </Modal>
    {resolve && staff && <FormModal title="Xử lý yêu cầu hỗ trợ" submitLabel="Đánh dấu đã xử lý" onClose={() => setResolve(false)}
      submitDisabled={ticket.isFetching || !!ticket.error || data?.status !== "OPEN"}
      onSubmit={async d => {
        if (resolving.current) return;
        if (ticket.isFetching || ticket.error || data?.status !== "OPEN") throw new ApiError("Phiếu không còn sẵn sàng để xử lý. Vui lòng tải lại.");
        resolving.current = true;
        try {
          const updated = await api.resolveSupportTicket(id, String(d.get("response") || ""));
          await onSaved(updated);
          if (currentActor()) toast("Đã giải quyết yêu cầu hỗ trợ.");
        } finally { resolving.current = false; }
      }}>
      <Field label="Nội dung phản hồi"><textarea name="response" required rows={5} /></Field>
    </FormModal>}
  </>;
}
function DemoSupport() {
  const { session } = useAuth();
  const can = usePermissions();
  const demo = session!.mode === "demo",
    staff = can("support.manage");
  const users = useUsers();
  const [create, setCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState<SupportRequest | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  /**
   * Trong demo, thành viên chỉ thấy phiếu của mình, nhóm isStaff thấy các phiếu
   * để tiếp nhận. Từ khóa và trạng thái chỉ lọc dữ liệu local đã có.
   */
  const rows = (demo ? readDemo().tickets : []).filter(
    (t) =>
      (staff || t.memberId === session!.user.id) &&
      (status === "all" || t.status === status) &&
      matches(search, t.title, t.description, t.id),
  );
  return (
    <>
      <PageHeader
        eyebrow="WE'RE HERE TO HELP"
        title="Yêu cầu hỗ trợ"
        description="Mỗi câu hỏi đều xứng đáng được lắng nghe."
        actions={
          <Button disabled={!demo} onClick={() => setCreate(true)}>
            <Plus size={17} />
            {staff ? "Tiếp nhận yêu cầu" : "Tạo yêu cầu hỗ trợ"}
          </Button>
        }
      />
      <DemoOnly>
        {demo
          ? "Các yêu cầu đang lưu trong demo local. Backend chưa có endpoint tiếp nhận và xử lý hỗ trợ."
          : undefined}
      </DemoOnly>
      <div className="support-intro">
        <span>
          <LifeBuoy size={34} strokeWidth={1.4} />
        </span>
        <div>
          <h2>Cần một người đồng hành?</h2>
          <p>
            Gửi câu hỏi về gói tập, lịch học hoặc trải nghiệm tại trung tâm. Lễ
            tân sẽ là người tiếp nhận.
          </p>
        </div>
      </div>
      <Panel>
        <div className="table-toolbar">
          <div>
            <h2>
              {staff ? "Tất cả yêu cầu" : "Yêu cầu của tôi"}
              <span className="count-chip">{rows.length}</span>
            </h2>
          </div>
          <div className="table-filters">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Tìm yêu cầu..."
            />
            <Select
              label="Trạng thái yêu cầu"
              value={status}
              onChange={setStatus}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="OPEN">Chờ tiếp nhận</option>
              <option value="RESOLVED">Đã xử lý</option>
            </Select>
          </div>
        </div>
        <DataTable
          rows={rows}
          columns={[
            {
              key: "id",
              label: "Mã yêu cầu",
              render: (t) => (
                <span className="mono">{idLabel(t.id, "HT")}</span>
              ),
            },
            {
              key: "title",
              label: "Nội dung",
              render: (t) => (
                <button className="table-name" onClick={() => setDetail(t)}>
                  {t.title}
                </button>
              ),
            },
            {
              key: "member",
              label: "Người gửi",
              render: (t) =>
                users.data?.find((u) => u.id === t.memberId)?.fullName ||
                `Thành viên #${t.memberId}`,
            },
            {
              key: "date",
              label: "Ngày tiếp nhận",
              render: (t) => dateLabel(t.createdAt),
            },
            {
              key: "status",
              label: "Trạng thái",
              render: (t) => <Badge status={t.status} />,
            },
            {
              key: "action",
              label: "Thao tác",
              render: (t) => (
                <button className="subtle-link" onClick={() => setDetail(t)}>
                  Xem yêu cầu
                </button>
              ),
            },
          ]}
        />
      </Panel>
      {create && (
        <FormModal
          title={staff ? "Tiếp nhận yêu cầu tại quầy" : "Yêu cầu hỗ trợ mới"}
          description="Mô tả rõ nội dung để trung tâm có thể hỗ trợ bạn tốt hơn."
          onClose={() => setCreate(false)}
          submitLabel="Lưu yêu cầu demo"
          onSubmit={async (d) => {
            updateDemo("Tạo yêu cầu demo", String(d.get("title")), (db) =>
              db.tickets.unshift({
                id: Date.now(),
                memberId: staff ? Number(d.get("memberId")) : session!.user.id,
                title: String(d.get("title")),
                description: String(d.get("description")),
                status: "OPEN",
                createdAt: dateTimeLocal(),
              }),
            );
            await client.invalidateQueries();
            toast("Đã lưu yêu cầu vào demo local.");
          }}
        >
          {staff && <MemberField users={users.data || []} />}
          <Field label="Tiêu đề">
            <input
              name="title"
              required
              minLength={3}
              maxLength={150}
              placeholder="Bạn cần hỗ trợ về vấn đề gì?"
            />
          </Field>
          <Field label="Nội dung chi tiết">
            <textarea
              name="description"
              required
              minLength={10}
              maxLength={5000}
              rows={5}
              placeholder="Mô tả yêu cầu, lớp học hoặc gói tập liên quan..."
            />
          </Field>
        </FormModal>
      )}
      {detail && (
        <Modal
          title={detail.title}
          description={`${idLabel(detail.id, "HT")} · ${dateLabel(detail.createdAt)}`}
          onClose={() => setDetail(null)}
        >
          <div className="support-detail">
            <Badge status={detail.status} />
            <p>{detail.description}</p>
            {staff && (
              <Button
                variant={detail.status === "OPEN" ? "primary" : "secondary"}
                onClick={async () => {
                  requireDemoPermission("support.manage");
                  const status = detail.status === "OPEN" ? "RESOLVED" : "OPEN";
                  updateDemo("Cập nhật hỗ trợ demo", detail.title, (db) => {
                    const t = db.tickets.find((t) => t.id === detail.id);
                    if (t) t.status = status;
                  });
                  setDetail({ ...detail, status });
                  await client.invalidateQueries();
                  toast("Đã cập nhật yêu cầu demo.");
                }}
              >
                <CheckCircle2 size={16} />
                {detail.status === "OPEN"
                  ? "Đánh dấu đã xử lý"
                  : "Mở lại yêu cầu"}
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
