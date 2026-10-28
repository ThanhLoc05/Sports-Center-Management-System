/** Kế hoạch cá nhân/cả lớp, giao bài và ghi kết quả theo từng buổi. Hiện backend chưa có API training. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useClasses, useDemoData, usePermissions } from "../lib/hooks";
import type { TrainingPlan } from "../lib/types";
import { coachMembers, planMembers } from "../lib/entitlements";
import {
  requireDemoPermission,
  savePlan,
  saveTrainingLog,
} from "../lib/center";
import { updateDemo } from "../lib/api";
import { dateLabel, localDate, matches } from "../lib/utils";
import {
  Button,
  Confirm,
  DataTable,
  Empty,
  Field,
  FormModal,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  useToast,
} from "../components/ui";
export default function Training() {
  const { session } = useAuth();
  const db = useDemoData();
  const can = usePermissions();
  const classes = useClasses();
  const client = useQueryClient();
  const toast = useToast();
  const member = session!.user.roleName === "MEMBER",
    coach = session!.user.roleName === "COACH";
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<TrainingPlan | true | null>(null);
  const [target, setTarget] = useState("member");
  const [selectedId, setSelected] = useState<number | null>(null);
  const [remove, setRemove] = useState<TrainingPlan | null>(null);
  const [logPlan, setLogPlan] = useState<TrainingPlan | null>(null);
  const [logMember, setLogMember] = useState(0);
  const [logClass, setLogClass] = useState(0);
  const [logDate, setLogDate] = useState(localDate());
  const students = db
    ? coach
      ? coachMembers(db, session!.user.id)
      : db.users.filter((u) => u.roleName === "MEMBER")
    : [];
  const plans = (db?.plans || []).filter(
    (p) =>
      (!coach || p.coachId === session!.user.id) &&
      (!member || planMembers(p, db!).includes(session!.user.id)) &&
      matches(
        search,
        p.title,
        p.goal,
        db?.classes.find((c) => c.id === p.classId)?.className,
      ),
  );
  const selected = plans.find((p) => p.id === selectedId);
  const logs = selected
    ? (db?.logs || []).filter(
        (l) =>
          l.planId === selected.id &&
          (!member || l.memberId === session!.user.id),
      )
    : [];
  const metricLogs = [...logs]
    .filter((l) => l.metric != null)
    .sort((a, b) =>
      (a.sessionDate || a.createdAt).localeCompare(
        b.sessionDate || b.createdAt,
      ),
    );
  const latest = metricLogs.at(-1);
  const first = latest
    ? metricLogs.find(
        (l) =>
          l.memberId === latest.memberId &&
          l.metricLabel === latest.metricLabel,
      )
    : undefined;
  function openPlan(p?: TrainingPlan) {
    setTarget(p?.classId ? "class" : "member");
    setEdit(p || true);
  }
  function openLog(p: TrainingPlan) {
    setSelected(null);
    setLogPlan(p);
    setLogMember(p.classId ? 0 : p.memberId);
    setLogClass(p.classId || 0);
    setLogDate(
      classes.data
        ?.find((c) => c.id === p.classId)
        ?.scheduleTime.slice(0, 10) || localDate(),
    );
  }
  const formPlan = edit && edit !== true ? edit : undefined;
  const logStudents =
    logPlan && db
      ? db.users.filter((u) => planMembers(logPlan, db).includes(u.id))
      : [];
  const logClasses = (classes.data || []).filter(
    (c) =>
      (!logPlan?.classId || c.id === logPlan.classId) &&
      db?.bookings.some(
        (b) =>
          b.classId === c.id &&
          b.memberId === logMember &&
          b.status === "BOOKED",
      ),
  );
  return (
    <>
      <PageHeader
        title={member ? "Kế hoạch tập luyện của tôi" : "Kế hoạch tập luyện"}
        description="Kế hoạch, buổi tập, kết quả và nhận xét trong cùng một hành trình."
        actions={
          can("training.manage") ? (
            <Button disabled={!db} onClick={() => openPlan()}>
              Tạo kế hoạch
            </Button>
          ) : undefined
        }
      />
      <Notice>
        {db
          ? "Kế hoạch, kết quả và thông báo tập luyện đang lưu demo trên trình duyệt."
          : "Chưa có API module tập luyện; không ghi dữ liệu local trong chế độ API."}{" "}
        {can("training.manage") && (
          <>
            <Link to="/students">Hồ sơ học viên</Link> ·{" "}
          </>
        )}
        <Link to="/notifications">Thông báo & bài tập</Link>
      </Notice>
      <Panel>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm kế hoạch, mục tiêu, lớp..."
        />
        <DataTable
          rows={plans}
          columns={[
            {
              key: "title",
              label: "Kế hoạch",
              render: (p) => <strong>{p.title}</strong>,
            },
            {
              key: "target",
              label: "Đối tượng",
              render: (p) =>
                p.classId
                  ? `Cả lớp · ${db?.classes.find((c) => c.id === p.classId)?.className || p.classId}`
                  : db?.users.find((u) => u.id === p.memberId)?.fullName ||
                    `#${p.memberId}`,
            },
            { key: "goal", label: "Mục tiêu", render: (p) => p.goal },
            {
              key: "due",
              label: "Hạn bài tập",
              render: (p) => (p.dueDate ? dateLabel(p.dueDate) : "—"),
            },
            {
              key: "view",
              label: "Thao tác",
              render: (p) => (
                <Button variant="ghost" onClick={() => setSelected(p.id)}>
                  Xem kế hoạch
                </Button>
              ),
            },
          ]}
        />
      </Panel>
      {edit && db && (
        <FormModal
          title={formPlan ? "Chỉnh sửa kế hoạch" : "Tạo kế hoạch tập luyện"}
          onClose={() => setEdit(null)}
          onSubmit={async (d) => {
            const classId =
              target === "class" ? Number(d.get("classId")) : undefined;
            const assignedClass = classes.data?.find((c) => c.id === classId);
            savePlan(
              {
                title: String(d.get("title")),
                goal: String(d.get("goal")),
                memberId: classId ? 0 : Number(d.get("memberId")),
                classId,
                coachId: classId
                  ? assignedClass!.coachId
                  : coach
                    ? session!.user.id
                    : Number(d.get("coachId")),
                exercises: String(d.get("exercises")),
                notes: String(d.get("notes")),
                dueDate: String(d.get("dueDate") || ""),
              },
              formPlan?.id,
            );
            await client.invalidateQueries();
            toast("Đã lưu kế hoạch và gửi thông báo cho học viên.");
          }}
        >
          <Field label="Tên kế hoạch">
            <input
              name="title"
              required
              minLength={3}
              maxLength={150}
              defaultValue={formPlan?.title}
            />
          </Field>
          <Field label="Giao kế hoạch cho">
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="member">Cá nhân</option>
              <option value="class">Cả lớp</option>
            </select>
          </Field>
          {target === "class" ? (
            <Field label="Lớp phụ trách">
              <select
                name="classId"
                required
                defaultValue={formPlan?.classId || ""}
              >
                <option value="" disabled>
                  Chọn lớp
                </option>
                {classes.data
                  ?.filter((c) => c.status !== "CANCELLED")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.className}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Học viên">
                <select
                  name="memberId"
                  required
                  defaultValue={formPlan?.memberId || ""}
                >
                  <option value="" disabled>
                    Chọn học viên
                  </option>
                  {students.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} · {u.fitnessGoals || "Chưa có mục tiêu"}
                    </option>
                  ))}
                </select>
              </Field>
              {!coach && (
                <Field label="HLV phụ trách">
                  <select
                    name="coachId"
                    required
                    defaultValue={formPlan?.coachId || ""}
                  >
                    <option value="" disabled>
                      Chọn HLV
                    </option>
                    {db.users
                      .filter(
                        (u) => u.roleName === "COACH" && u.status === "ACTIVE",
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </>
          )}
          <Field label="Mục tiêu">
            <input
              name="goal"
              required
              maxLength={200}
              defaultValue={formPlan?.goal}
            />
          </Field>
          <Field label="Bài tập (mỗi dòng một bài)">
            <textarea
              name="exercises"
              required
              maxLength={10000}
              rows={6}
              defaultValue={formPlan?.exercises}
            />
          </Field>
          <Field label="Hướng dẫn / bài tập về nhà">
            <textarea
              name="notes"
              maxLength={3000}
              rows={4}
              defaultValue={formPlan?.notes}
            />
          </Field>
          <Field label="Hạn hoàn thành bài tập">
            <input
              name="dueDate"
              type="date"
              defaultValue={formPlan?.dueDate}
            />
          </Field>
          <Notice>
            Kế hoạch cả lớp được hiển thị cho học viên đang có booking BOOKED
            của lớp. Nhận xét/kết quả của từng người được giới hạn riêng.
          </Notice>
        </FormModal>
      )}
      {selected && (
        <Modal
          title={selected.title}
          description={selected.goal}
          onClose={() => setSelected(null)}
          wide
        >
          <Notice>{selected.notes || "Chưa có hướng dẫn thêm."}</Notice>
          {selected.dueDate && (
            <p>Hạn bài tập: {dateLabel(selected.dueDate)}</p>
          )}
          <div className="exercise-list">
            {selected.exercises
              .split("\n")
              .filter(Boolean)
              .map((e, i) => (
                <div key={i}>
                  <span>{i + 1}</span>
                  <strong>{e}</strong>
                </div>
              ))}
          </div>
          <h3>Tiến độ & kết quả theo buổi</h3>
          <div className="mini-stats">
            <div>
              <p>Kết quả đã ghi</p>
              <strong>{logs.length}</strong>
            </div>
            <div>
              <p>
                {latest?.metricLabel || "Chỉ số gần nhất"}
                {selected.classId && latest
                  ? ` · ${db?.users.find((u) => u.id === latest.memberId)?.fullName || `TV #${latest.memberId}`}`
                  : ""}
              </p>
              <strong>{latest?.metric ?? "Chưa ghi"}</strong>
            </div>
            <div>
              <p>Thay đổi so với lần đầu cùng chỉ số/học viên</p>
              <strong>
                {latest && first
                  ? `${Number(latest.metric) - Number(first.metric)}`
                  : "—"}
              </strong>
            </div>
          </div>
          {logs.length ? (
            logs.map((l) => (
              <article className="notification-card" key={l.id}>
                <strong>
                  {db?.users.find((u) => u.id === l.memberId)?.fullName} ·{" "}
                  {dateLabel(l.sessionDate || l.createdAt)}
                </strong>
                <p>
                  Lớp:{" "}
                  {db?.classes.find((c) => c.id === l.classId)?.className ||
                    "Bản ghi cũ"}
                </p>
                <p>Kết quả: {l.result}</p>
                <p>Nhận xét của HLV: {l.feedback || "Chưa có nhận xét"}</p>
                {l.metric != null && (
                  <p>
                    {l.metricLabel}: {l.metric}
                  </p>
                )}
              </article>
            ))
          ) : (
            <Empty
              title="Chưa có kết quả"
              description="HLV ghi nhận sau buổi tập để theo dõi tiến độ."
            />
          )}
          {can("training.manage") && (
            <div className="detail-actions">
              <Button onClick={() => openLog(selected)}>
                Ghi nhận kết quả
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelected(null);
                  openPlan(selected);
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
                Xóa kế hoạch
              </Button>
            </div>
          )}
        </Modal>
      )}
      {logPlan && db && (
        <FormModal
          title="Ghi nhận kết quả buổi tập"
          description={logPlan.title}
          onClose={() => setLogPlan(null)}
          onSubmit={async (d) => {
            saveTrainingLog({
              planId: logPlan.id,
              memberId: logMember,
              coachId: session!.user.id,
              classId: logClass,
              sessionDate: String(d.get("sessionDate")),
              result: String(d.get("result")),
              feedback: String(d.get("feedback")),
              metric: d.get("metric") ? Number(d.get("metric")) : undefined,
              metricLabel: String(d.get("metricLabel") || ""),
            });
            await client.invalidateQueries();
            toast("Đã ghi kết quả và thông báo cho học viên.");
          }}
        >
          <Field label="Học viên được đánh giá">
            <select
              value={logMember || ""}
              required
              onChange={(e) => {
                setLogMember(Number(e.target.value));
                setLogClass(logPlan.classId || 0);
                setLogDate(
                  classes.data
                    ?.find((c) => c.id === logPlan.classId)
                    ?.scheduleTime.slice(0, 10) || localDate(),
                );
              }}
            >
              <option value="" disabled>
                Chọn học viên
              </option>
              {logStudents.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Buổi/lớp đã tham gia">
            <select
              required
              value={logClass || ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setLogClass(id);
                setLogDate(
                  classes.data
                    ?.find((c) => c.id === id)
                    ?.scheduleTime.slice(0, 10) || localDate(),
                );
              }}
            >
              <option value="" disabled>
                Chọn lớp có booking của học viên
              </option>
              {logClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className} · {dateLabel(c.scheduleTime)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ngày tập">
            <input
              name="sessionDate"
              type="date"
              required
              max={localDate()}
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
            />
          </Field>
          <Field label="Kết quả">
            <textarea name="result" required maxLength={2000} />
          </Field>
          <Field label="Nhận xét / điều chỉnh buổi sau">
            <textarea name="feedback" maxLength={2000} />
          </Field>
          <div className="form-grid">
            <Field label="Chỉ số đo (tùy chọn)">
              <input name="metric" type="number" min="0" step="0.01" />
            </Field>
            <Field label="Tên chỉ số và đơn vị">
              <input
                name="metricLabel"
                maxLength={80}
                placeholder="Ví dụ: Plank (giây)"
              />
            </Field>
          </div>
        </FormModal>
      )}
      {remove && (
        <Confirm
          title="Xóa kế hoạch demo?"
          description="Kế hoạch và kết quả liên quan sẽ được xóa khỏi dữ liệu demo."
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            const actor = requireDemoPermission("training.manage");
            if (actor.roleName === "COACH" && remove.coachId !== actor.id)
              throw new Error("Không có quyền xóa kế hoạch này.");
            updateDemo("Xóa kế hoạch", remove.title, (db) => {
              db.plans = db.plans.filter((p) => p.id !== remove.id);
              db.logs = db.logs.filter((l) => l.planId !== remove.id);
            });
            await client.invalidateQueries();
            toast("Đã xóa kế hoạch demo.");
          }}
        />
      )}
    </>
  );
}
