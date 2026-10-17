import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useUsers } from "../lib/hooks";
import { updateDemo } from "../lib/api";
import { readDemo } from "../lib/demo";
import type { TrainingPlan } from "../lib/types";
import { dateLabel, dateTimeLocal, matches } from "../lib/utils";
import {
  Avatar,
  Button,
  Confirm,
  DemoOnly,
  Empty,
  Field,
  FormModal,
  MemberField,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  useToast,
} from "../components/ui";
export default function Training() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const demo = session!.mode === "demo",
    member = session!.user.roleName === "MEMBER",
    coach = session!.user.roleName === "COACH";
  const users = useUsers();
  const [create, setCreate] = useState(params.get("new") === "1" && !member);
  const [selected, setSelected] = useState<TrainingPlan | null>(null);
  const [edit, setEdit] = useState<TrainingPlan | null>(null);
  const [remove, setRemove] = useState<TrainingPlan | null>(null);
  const [log, setLog] = useState<TrainingPlan | null>(null);
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");
  const client = useQueryClient();
  const toast = useToast();
  const db = demo ? readDemo() : null;
  const plans = (db?.plans || []).filter(
    (p) =>
      (!member || p.memberId === session!.user.id) &&
      (!coach || p.coachId === session!.user.id) &&
      (memberFilter === "all" || p.memberId === Number(memberFilter)) &&
      matches(
        search,
        p.title,
        p.goal,
        users.data?.find((u) => u.id === p.memberId)?.fullName,
      ),
  );
  async function refresh(message: string) {
    await client.invalidateQueries();
    toast(message);
  }
  return (
    <>
      <PageHeader
        eyebrow="PROGRESS WITH PURPOSE"
        title={member ? "Kế hoạch tập luyện của tôi" : "Kế hoạch tập luyện"}
        description="Mục tiêu rõ ràng. Bài tập phù hợp. Tiến bộ từng ngày."
        actions={
          !member && (
            <Button disabled={!demo} onClick={() => setCreate(true)}>
              <Plus size={17} />
              Tạo kế hoạch
            </Button>
          )
        }
      />
      <DemoOnly>
        {demo
          ? "Module tập luyện đang chạy demo local: kế hoạch, kết quả và nhận xét được lưu trên trình duyệt. Backend chưa có controller cho module này."
          : undefined}
      </DemoOnly>
      <div className="training-hero">
        <div>
          <span className="eyebrow">SMALL STEPS, REAL PROGRESS</span>
          <h2>
            Mỗi hành trình đều có
            <br />
            một kế hoạch của riêng mình.
          </h2>
          <p>
            Kết nối mục tiêu của học viên với kinh nghiệm của huấn luyện viên.
          </p>
        </div>
        <div aria-hidden="true">
          <Target size={116} strokeWidth={0.8} />
          <Activity size={30} />
        </div>
      </div>
      <div className="list-toolbar">
        <strong>{plans.length} kế hoạch tập luyện</strong>
        <div className="table-filters">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm kế hoạch, mục tiêu..."
          />
          {!member && (
            <Select
              label="Học viên"
              value={memberFilter}
              onChange={setMemberFilter}
            >
              <option value="all">Tất cả học viên</option>
              {users.data
                ?.filter((u) => u.roleName === "MEMBER")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
            </Select>
          )}
        </div>
      </div>
      {plans.length ? (
        <div className="training-grid">
          {plans.map((p) => {
            const u = users.data?.find((u) => u.id === p.memberId);
            const logs = db?.logs.filter((l) => l.planId === p.id) || [];
            return (
              <article className="training-card" key={p.id}>
                <div className="training-card-top">
                  <span className="training-plan-icon">
                    <ClipboardList size={23} />
                  </span>
                  <span className="tag">{p.goal}</span>
                </div>
                <h3>{p.title}</h3>
                <div className="person-cell">
                  <Avatar
                    name={u?.fullName || `TV ${p.memberId}`}
                    size="small"
                    index={p.memberId}
                  />
                  <span>{u?.fullName || `Thành viên #${p.memberId}`}</span>
                </div>
                <p>{p.notes}</p>
                <div className="training-exercise-preview">
                  {p.exercises
                    .split("\n")
                    .slice(0, 3)
                    .map((e, i) => (
                      <span key={i}>
                        <CheckCircle2 size={14} />
                        {e}
                      </span>
                    ))}
                </div>
                <div className="training-card-footer">
                  <span>{logs.length} kết quả đã ghi nhận</span>
                  <button className="text-link" onClick={() => setSelected(p)}>
                    Xem kế hoạch
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Panel>
          <Empty
            title={
              demo
                ? "Chưa có kế hoạch trong phạm vi này"
                : "Module đang chờ kết nối backend"
            }
            description={
              demo
                ? "Tạo kế hoạch đầu tiên để bắt đầu theo dõi tiến độ."
                : "Có thể trải nghiệm kế hoạch, kết quả và nhận xét trong chế độ demo."
            }
          />
        </Panel>
      )}
      {(create || edit) && demo && (
        <FormModal
          title={edit ? "Chỉnh sửa kế hoạch" : "Tạo kế hoạch tập luyện"}
          description="Xây dựng bài tập phù hợp với mục tiêu và khả năng học viên."
          onClose={() => {
            setCreate(false);
            setEdit(null);
          }}
          wide
          onSubmit={async (d) => {
            const title = String(d.get("title"));
            updateDemo(
              edit ? "Sửa kế hoạch demo" : "Tạo kế hoạch demo",
              title,
              (db) => {
                const p: TrainingPlan = {
                  id: edit?.id || Date.now(),
                  title,
                  memberId: Number(d.get("memberId")),
                  coachId: coach ? session!.user.id : Number(d.get("coachId")),
                  goal: String(d.get("goal")),
                  notes: String(d.get("notes")),
                  exercises: String(d.get("exercises")),
                  createdAt: edit?.createdAt || dateTimeLocal(),
                };
                if (edit)
                  db.plans = db.plans.map((x) => (x.id === edit.id ? p : x));
                else db.plans.push(p);
              },
            );
            await refresh("Đã lưu kế hoạch demo.");
          }}
        >
          <Field label="Tên kế hoạch">
            <input
              name="title"
              required
              minLength={3}
              maxLength={150}
              defaultValue={edit?.title}
              placeholder="VD: Xây dựng nền tảng thể lực"
            />
          </Field>
          <div className="form-grid">
            <MemberField
              users={users.data || []}
              defaultValue={edit?.memberId}
            />
            <Field label="Mục tiêu">
              <select
                name="goal"
                defaultValue={edit?.goal || "Cải thiện sức bền"}
              >
                <option>Cải thiện sức bền</option>
                <option>Tăng sức mạnh</option>
                <option>Cải thiện linh hoạt</option>
                <option>Vận động đều đặn</option>
              </select>
            </Field>
          </div>
          {!coach && (
            <Field label="Huấn luyện viên">
              <select
                name="coachId"
                required
                defaultValue={edit?.coachId || ""}
              >
                <option value="" disabled>
                  Chọn HLV
                </option>
                {users.data
                  ?.filter((u) => u.roleName === "COACH")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Các bài tập (mỗi dòng một bài)">
            <textarea
              name="exercises"
              rows={6}
              required
              maxLength={10000}
              defaultValue={edit?.exercises}
              placeholder={
                "Khởi động · 8 phút\nSquat · 3 hiệp × 12 lần\nGiãn cơ · 5 phút"
              }
            />
          </Field>
          <Field label="Hướng dẫn / bài tập về nhà">
            <textarea
              name="notes"
              rows={3}
              maxLength={3000}
              defaultValue={edit?.notes}
              placeholder="Số buổi mỗi tuần, thời gian nghỉ, lưu ý kỹ thuật..."
            />
          </Field>
        </FormModal>
      )}
      {selected && (
        <Modal
          title={selected.title}
          description={`${selected.goal} · Tạo ngày ${dateLabel(selected.createdAt)}`}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="training-detail">
            <Notice>
              {selected.notes || "Chưa có ghi chú thêm từ huấn luyện viên."}
            </Notice>
            <h3>Bài tập được giao</h3>
            <div className="exercise-list">
              {selected.exercises
                .split("\n")
                .filter(Boolean)
                .map((e, i) => (
                  <div key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <strong>{e}</strong>
                  </div>
                ))}
            </div>
            <h3>Kết quả & nhận xét</h3>
            {db?.logs
              .filter((l) => l.planId === selected.id)
              .map((l) => (
                <div className="workout-log" key={l.id}>
                  <span>{dateLabel(l.createdAt)}</span>
                  <p>
                    <strong>Kết quả: </strong>
                    {l.result}
                  </p>
                  <p>
                    <strong>Nhận xét của HLV: </strong>
                    {l.feedback || "Chưa có nhận xét"}
                  </p>
                </div>
              ))}
            {!db?.logs.some((l) => l.planId === selected.id) && (
              <p className="muted">Chưa có kết quả được ghi nhận.</p>
            )}
            {!member && (
              <div className="detail-actions">
                <Button
                  onClick={() => {
                    setSelected(null);
                    setLog(selected);
                  }}
                >
                  <Plus size={16} />
                  Ghi nhận kết quả
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelected(null);
                    setEdit(selected);
                  }}
                >
                  Chỉnh sửa
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setSelected(null);
                    setRemove(selected);
                  }}
                >
                  <Trash2 size={15} />
                  Xóa
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}
      {log && (
        <FormModal
          title="Ghi nhận kết quả tập luyện"
          description={log.title}
          onClose={() => setLog(null)}
          onSubmit={async (d) => {
            updateDemo("Ghi nhận kết quả demo", log.title, (db) =>
              db.logs.push({
                id: Date.now(),
                planId: log.id,
                memberId: log.memberId,
                coachId: session!.user.id,
                result: String(d.get("result")),
                feedback: String(d.get("feedback")),
                createdAt: dateTimeLocal(),
              }),
            );
            await refresh("Đã lưu kết quả và nhận xét.");
          }}
        >
          <Field label="Kết quả tập luyện">
            <textarea
              name="result"
              required
              rows={4}
              maxLength={3000}
              placeholder="Số hiệp, số lần, mức tạ hoặc kết quả cụ thể..."
            />
          </Field>
          <Field label="Nhận xét và đánh giá của HLV">
            <textarea
              name="feedback"
              rows={4}
              maxLength={3000}
              placeholder="Tiến độ, kỹ thuật và điều chỉnh cho buổi sau..."
            />
          </Field>
        </FormModal>
      )}
      {remove && (
        <Confirm
          title="Xóa kế hoạch demo?"
          description="Kế hoạch cùng các kết quả liên quan sẽ bị xóa khỏi dữ liệu demo local."
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            updateDemo("Xóa kế hoạch demo", remove.title, (db) => {
              db.plans = db.plans.filter((p) => p.id !== remove.id);
              db.logs = db.logs.filter((l) => l.planId !== remove.id);
            });
            await refresh("Đã xóa kế hoạch demo.");
          }}
        />
      )}
    </>
  );
}
