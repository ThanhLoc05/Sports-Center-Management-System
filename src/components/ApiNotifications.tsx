/**
 * Luồng soạn thông báo/bài tập: chọn lớp hoặc học viên → nhập nội dung → xem trước.
 * Bản nháp chỉ nằm trong state của màn hình, chưa được gửi hoặc lưu trên máy chủ.
 * Nút gửi giữ trạng thái vô hiệu hóa đến khi có API thông báo từ backend.
 */
import { useState } from "react";
import { useClasses } from "../lib/hooks";
import { useAssignedStudents } from "../lib/use-coach-data";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Modal,
  Notice,
  PageHeader,
  Panel,
} from "./ui";
interface Draft {
  audience: string;
  target: number;
  title: string;
  content: string;
}
export default function ApiNotifications() {
  const classes = useClasses();
  const students = useAssignedStudents();
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [audience, setAudience] = useState("class");
  const [review, setReview] = useState(false);
  const recipient = draft
    ? draft.audience === "class"
      ? classes.data?.find((c) => c.id === draft.target)?.className
      : students.data.find((s) => s.memberId === draft.target)?.fullName
    : "";
  return (
    <>
      <PageHeader
        title="Thông báo & bài tập"
        description="Soạn nội dung gửi cho lớp phụ trách hoặc từng học viên."
        actions={
          <Button
            onClick={() => {
              setAudience(draft?.audience || "class");
              setCompose(true);
            }}
          >
            Soạn thông báo / bài tập
          </Button>
        }
      />
      <Notice>
        Chức năng gửi thông báo đang chờ kết nối backend. Nội dung xem trước
        chưa được gửi tới học viên và không được lưu như thông báo chính thức.
      </Notice>
      <Panel title="Thông báo đã gửi">
        <Empty
          title="Chưa có dữ liệu thông báo"
          description="Danh sách sẽ hiển thị khi được kết nối với hệ thống thông báo của trung tâm."
        />
      </Panel>
      {draft && (
        <Panel className="panel-spaced" title="Nội dung đang soạn">
          <p>{draft.title}</p>
          <p>Người nhận: {recipient || "Chưa xác định"}</p>
          <Button variant="secondary" onClick={() => setReview(true)}>
            Xem trước nội dung
          </Button>
        </Panel>
      )}
      {compose && (
        <FormModal
          title="Soạn thông báo hoặc bài tập"
          wide
          submitLabel="Xem trước nội dung"
          onClose={() => setCompose(false)}
          onSubmit={async (d) => {
            setDraft({
              audience,
              target: Number(d.get("target")),
              title: String(d.get("title")).trim(),
              content: String(d.get("content")).trim(),
            });
            setReview(true);
          }}
        >
          <Field label="Gửi đến">
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="class">Cả lớp</option>
              <option value="member">Một học viên</option>
            </select>
          </Field>
          {students.error && audience === "member" ? (
            <ErrorState error={students.error} retry={students.refetch} />
          ) : (
            <Field
              label={
                audience === "class"
                  ? "Lớp nhận thông báo"
                  : "Học viên nhận thông báo"
              }
            >
              <select name="target" required defaultValue={draft?.target || ""}>
                <option value="">Chọn người nhận</option>
                {audience === "class"
                  ? classes.data
                      ?.filter((c) => c.status !== "CANCELLED")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.className}
                        </option>
                      ))
                  : students.data.map((s) => (
                      <option key={s.memberId} value={s.memberId}>
                        {s.fullName}
                      </option>
                    ))}
              </select>
            </Field>
          )}
          <Field label="Tiêu đề">
            <input
              name="title"
              required
              minLength={3}
              maxLength={150}
              defaultValue={draft?.title}
            />
          </Field>
          <Field label="Nội dung / bài tập về nhà">
            <textarea
              name="content"
              required
              minLength={5}
              maxLength={4000}
              rows={8}
              defaultValue={draft?.content}
            />
          </Field>
        </FormModal>
      )}
      {review && draft && (
        <Modal className="content-preview-dialog" title="Xem trước thông báo" onClose={() => setReview(false)}>
          <p>
            <strong>Người nhận:</strong> {recipient || "Chưa xác định"}
          </p>
          <h3>{draft.title}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{draft.content}</p>
          <Notice>Chưa gửi. Đang chờ kết nối API thông báo.</Notice>
          <div className="modal-footer">
            <Button
              variant="secondary"
              onClick={() => {
                setReview(false);
                setCompose(true);
              }}
            >
              Chỉnh sửa
            </Button>
            <Button disabled>Gửi thông báo</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
