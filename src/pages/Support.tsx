/**
 * YÊU CẦU HỖ TRỢ — thành viên gửi phiếu, nhân viên theo dõi/xử lý trong demo.
 * Dữ liệu nằm ở readDemo().tickets; chưa có API gửi yêu cầu lên trung tâm thật.
 */
import { useState } from "react";
import { CheckCircle2, LifeBuoy, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useUsers } from "../lib/hooks";
import { readDemo } from "../lib/demo";
import { updateDemo } from "../lib/api";
import { isStaff } from "../lib/types";
import type { SupportRequest } from "../lib/types";
import { dateLabel, dateTimeLocal, idLabel, matches } from "../lib/utils";
import {
  Badge,
  Button,
  DataTable,
  DemoOnly,
  Field,
  FormModal,
  MemberField,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  useToast,
} from "../components/ui";
export default function Support() {
  const { session } = useAuth();
  const demo = session!.mode === "demo",
    staff = isStaff(session!.user.roleName);
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
