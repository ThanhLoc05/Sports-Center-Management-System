/**
 * HLV quản lý giáo án cá nhân/cả lớp, ghi kết quả và nhận xét sau buổi tập.
 * Thành viên chỉ xem dữ liệu của mình; quản lý có thể chọn HLV để tra cứu.
 * Giáo án và nhật ký là hai dữ liệu riêng, không dùng planId/classId làm scheduleId.
 * Mỗi lần lưu thành công sẽ làm mới cache tương ứng để cập nhật màn hình.
 */
import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useClasses, useUsers } from "../lib/hooks";
import { useAssignedStudents } from "../lib/use-coach-data";
import { operations } from "../lib/operations-api";
import { api } from "../lib/api";
import type { WorkoutPlan, WorkoutLog, Exercise } from "../lib/operations-api";
import { dateLabel, matches } from "../lib/utils";
import {
  Button,
  Confirm,
  DataTable,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Loading,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  useToast,
} from "./ui";
export default function ApiTraining() {
  const { session } = useAuth();
  return <TrainingContent key={`${session?.user.id}:${session?.user.roleName}`} />;
}
function TrainingContent() {
  const { session } = useAuth();
  const actor = session!.user;
  const member = actor.roleName === "MEMBER";
  const coach = actor.roleName === "COACH";
  const users = useUsers();
  const classes = useClasses();
  const students = useAssignedStudents();
  const [coachChoice, setCoach] = useState("");
  const coachId = coach
    ? actor.id
    : Number(
        coachChoice || users.data?.find((u) => u.roleName === "COACH")?.id || 0,
      );
  const scope = member ? actor.id : coachId;
  const plans = useQuery({
    queryKey: ["workout-plans", member ? "member" : "coach", scope, actor.id, actor.roleName],
    queryFn: () => operations.plans(member ? "member" : "coach", scope),
    enabled: !!scope,
  });
  const bookings = useQuery({
    queryKey: ["bookings", actor.id],
    queryFn: () => api.bookings(actor.id),
    enabled: member,
    retry: false,
  });
  // Chỉ BOOKED cho phép đọc giáo án lớp; không dùng danh sách booking cache khi đang tải lại/lỗi.
  const classIds = member && bookings.isSuccess && !bookings.isFetching
    ? [...new Set(bookings.data.filter(b => b.memberId === actor.id && b.status === "BOOKED").map(b => b.classId))]
    : [];
  const classPlans = useQueries({ queries: classIds.map(classId => ({
    queryKey: ["workout-plans", "class", classId, actor.id, actor.roleName],
    queryFn: () => operations.plans("class", classId),
    retry: false,
  })) });
  // Mỗi lớp là một query riêng: lỗi một lớp không che giáo án cá nhân hoặc các lớp còn lại.
  const combinedPlans = [...new Map([
    ...(plans.data || []),
    ...classPlans.flatMap(q => q.isError || q.isFetching ? [] : q.data || []),
  ].map(p => [p.id, p])).values()];
  const planLoading = plans.isPending || (member && (bookings.isPending || bookings.isFetching ||
    classPlans.some(q => q.isPending || q.isFetching)));
  const planError = !!plans.error || (member && !!bookings.error) || classPlans.some(q => !!q.error);
  const logs = useQuery({
    queryKey: ["workout-logs", member ? "member" : "coach", scope, actor.id, actor.roleName],
    queryFn: () => operations.logs(member ? "member" : "coach", scope),
    enabled: !!scope,
  });
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<WorkoutPlan | true | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  // Chỉ giữ ID; chi tiết luôn lấy từ nguồn hiện được phép hiển thị, không giữ object lớp cũ khi mất quyền/refetch.
  const detail = combinedPlans.find(p => p.id === detailId);
  const [remove, setRemove] = useState<WorkoutPlan | null>(null);
  const [newLog, setNewLog] = useState(false);
  const [feedback, setFeedback] = useState<WorkoutLog | null>(null);
  const [student, setStudent] = useState("");
  const client = useQueryClient();
  const toast = useToast();
  const selectedMember = member ? actor.id : Number(student || 0);
  const visibleLogs = (logs.data || [])
    .filter((l) => !selectedMember || l.memberId === selectedMember)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const scopedClasses = (classes.data || []).filter(
    (c) => c.coachId === coachId && c.status !== "CANCELLED",
  );
  const name = (id: number) =>
    students.data.find((s) => s.memberId === id)?.fullName || "Học viên #" + id;
  return (
    <>
      <PageHeader
        title={member ? "Kế hoạch tập luyện của tôi" : "Kế hoạch tập luyện"}
        description="Giáo án, kết quả từng buổi và nhận xét được lưu qua backend."
        actions={
          !member ? (
            <>
              <Button
                disabled={!coachId || !!students.error || students.isPending}
                onClick={() => setEdit(true)}
              >
                Tạo kế hoạch
              </Button>
              <Button
                variant="secondary"
                disabled={!coachId || !!students.error || students.isPending}
                onClick={() => setNewLog(true)}
              >
                Ghi kết quả buổi tập
              </Button>
            </>
          ) : undefined
        }
      />
      {!member && !coach && (
        <Panel title="Huấn luyện viên phụ trách">
          {users.error ? (
            <ErrorState error={users.error} retry={users.refetch} />
          ) : (
            <Field label="Huấn luyện viên">
              <select
                value={coachId || ""}
                onChange={(e) => {
                  setCoach(e.target.value);
                  // Đổi HLV phải bỏ ngữ cảnh/form cũ trước khi tải dữ liệu của người mới.
                  setStudent("");
                  setEdit(null);
                  setDetailId(null);
                  setRemove(null);
                  setNewLog(false);
                  setFeedback(null);
                }}
              >
                <option value="">Chọn HLV</option>
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
        </Panel>
      )}
      {!member &&
        (students.error ? (
          <ErrorState error={students.error} retry={students.refetch} />
        ) : (
          <Notice>
            Chỉ ghi kết quả cho học viên trong phạm vi được phân công. Backend
            kiểm tra quyền khi lưu.
          </Notice>
        ))}
      <Panel title="Danh sách kế hoạch">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm tiêu đề, nội dung giáo án..."
        />
        {!scope ? (
          <Empty title="Chọn huấn luyện viên" />
        ) : <>
          {plans.error && <ErrorState error={plans.error} retry={plans.refetch} />}
          {member && bookings.error && <ErrorState error={bookings.error} retry={bookings.refetch} />}
          {classPlans.map((q, i) => q.error && <div key={classIds[i]}>
            <Notice>Không tải được giáo án lớp #{classIds[i]}.</Notice>
            <ErrorState error={q.error} retry={q.refetch} />
          </div>)}
          {planLoading && <Loading />}
          {(combinedPlans.length > 0 || (!planLoading && !planError)) && (
          <DataTable
            rows={combinedPlans.filter((p) =>
              matches(search, p.title, p.description),
            )}
            columns={[
              {
                key: "title",
                label: "Giáo án",
                render: (p) => (
                  <Button variant="ghost" onClick={() => setDetailId(p.id)}>
                    {p.title}
                  </Button>
                ),
              },
              {
                key: "target",
                label: "Người nhận",
                render: (p) =>
                  p.classId
                    ? classes.data?.find((c) => c.id === p.classId)
                        ?.className || "Lớp #" + p.classId
                    : name(p.memberId!),
              },
              {
                key: "date",
                label: "Ngày tạo",
                render: (p) => dateLabel(p.createdAt),
              },
              {
                key: "actions",
                label: "Thao tác",
                render: (p) =>
                  !member && (
                    <div className="row-actions">
                      <Button variant="ghost" onClick={() => setEdit(p)}>
                        Sửa giáo án
                      </Button>
                      <Button variant="danger" onClick={() => setRemove(p)}>
                        Xóa giáo án
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
          )}
        </>}
      </Panel>
      <Panel title="Kết quả và tiến độ học viên">
        {!member && (
          <Field label="Học viên theo dõi">
            <select
              value={student}
              onChange={(e) => setStudent(e.target.value)}
            >
              <option value="">Tất cả học viên</option>
              {students.data.map((s) => (
                <option key={s.memberId} value={s.memberId}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!scope ? (
          <Empty title="Chọn huấn luyện viên" />
        ) : logs.isPending ? (
          <Loading />
        ) : logs.error ? (
          <ErrorState error={logs.error} retry={logs.refetch} />
        ) : (
          <>
            <DataTable
              rows={visibleLogs}
              columns={[
                {
                  key: "date",
                  label: "Buổi ghi nhận",
                  render: (l) =>
                    dateLabel(l.createdAt, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                },
                {
                  key: "student",
                  label: "Học viên",
                  render: (l) => name(l.memberId),
                },
                {
                  key: "exercises",
                  label: "Kết quả",
                  render: (l) => (
                    <ul>
                      {l.details.map((d, i) => (
                        <li key={d.id || i}>
                          {d.exerciseName}: {d.sets ?? "—"} hiệp ×{" "}
                          {d.reps ?? "—"} lần · {d.weightKg ?? "—"} kg
                        </li>
                      ))}
                    </ul>
                  ),
                },
                {
                  key: "feedback",
                  label: "Nhận xét HLV",
                  render: (l) => l.feedbackFromCoach || "Chưa có nhận xét",
                },
                {
                  key: "action",
                  label: "Thao tác",
                  render: (l) =>
                    !member && (
                      <Button variant="ghost" onClick={() => setFeedback(l)}>
                        Ghi nhận xét
                      </Button>
                    ),
                },
              ]}
            />
            {selectedMember > 0 && <Progress logs={visibleLogs} />}
          </>
        )}
      </Panel>
      {detail && (
        <Modal title={detail.title} onClose={() => setDetailId(null)}>
          <p style={{ whiteSpace: "pre-wrap" }}>{detail.description}</p>
        </Modal>
      )}
      {edit && (
        <FormModal
          title={
            edit === true ? "Tạo kế hoạch tập luyện" : "Sửa kế hoạch tập luyện"
          }
          wide
          onClose={() => setEdit(null)}
          onSubmit={async (d) => {
            const target = String(d.get("target"));
            await operations.savePlan(
              {
                title: String(d.get("title")).trim(),
                description: String(d.get("description")).trim(),
                coachId,
                ...(target === "class"
                  ? { classId: Number(d.get("classId")) }
                  : { memberId: Number(d.get("memberId")) }),
              },
              edit === true ? undefined : edit.id,
            );
            await client.invalidateQueries({ queryKey: ["workout-plans"] });
            toast("Đã lưu giáo án.");
          }}
        >
          <Field label="Tiêu đề kế hoạch">
            <input
              name="title"
              required
              maxLength={150}
              defaultValue={edit === true ? "" : edit.title}
            />
          </Field>
          <PlanTarget
            students={students.data}
            classes={scopedClasses}
            plan={edit === true ? undefined : edit}
          />
          <Field label="Nội dung giáo án">
            <textarea
              name="description"
              required
              minLength={3}
              rows={10}
              defaultValue={edit === true ? "" : edit.description}
              placeholder="Mục tiêu, bài tập, số hiệp/lần, thời lượng và hướng dẫn thực hiện..."
            />
          </Field>
        </FormModal>
      )}
      {remove && (
        <Confirm
          title="Xóa giáo án?"
          description={remove.title}
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await operations.deletePlan(remove.id);
            await client.invalidateQueries({ queryKey: ["workout-plans"] });
            toast("Đã xóa giáo án.");
          }}
        />
      )}
      {newLog && (
        <LogForm
          coachId={coachId}
          students={students.data}
          onClose={() => setNewLog(false)}
        />
      )}
      {feedback && (
        <FormModal
          title="Nhận xét kết quả buổi tập"
          onClose={() => setFeedback(null)}
          onSubmit={async (d) => {
            await operations.feedback(feedback.id, String(d.get("feedback")));
            await client.invalidateQueries({ queryKey: ["workout-logs"] });
            toast("Đã lưu nhận xét.");
          }}
        >
          <p>
            {name(feedback.memberId)} · {dateLabel(feedback.createdAt)}
          </p>
          <Field label="Nhận xét và đánh giá tiến độ">
            <textarea
              name="feedback"
              required
              maxLength={4000}
              rows={6}
              defaultValue={feedback.feedbackFromCoach || ""}
            />
          </Field>
        </FormModal>
      )}
    </>
  );
}
type Student = import("../lib/operations-api").ClassStudent;
function PlanTarget({
  students,
  classes,
  plan,
}: {
  students: Student[];
  classes: import("../lib/types").SportClass[];
  plan?: WorkoutPlan;
}) {
  const [target, setTarget] = useState(plan?.classId ? "class" : "member");
  return (
    <>
      <Field label="Đối tượng nhận">
        <select
          name="target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="member">Cá nhân</option>
          <option value="class">Cả lớp</option>
        </select>
      </Field>
      {target === "member" ? (
        <Field label="Học viên nhận kế hoạch">
          <select name="memberId" required defaultValue={plan?.memberId || ""}>
            <option value="">Chọn học viên</option>
            {students.map((s) => (
              <option key={s.memberId} value={s.memberId}>
                {s.fullName}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Lớp nhận kế hoạch">
          <select name="classId" required defaultValue={plan?.classId || ""}>
            <option value="">Chọn lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.className}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}
/** Form nhập nhiều bài tập cho một học viên trong một lần ghi kết quả. */
function LogForm({
  coachId,
  students,
  onClose,
}: {
  coachId: number;
  students: Student[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Exercise[]>([{ exerciseName: "" }]);
  const client = useQueryClient();
  const toast = useToast();
  const change = (i: number, key: keyof Exercise, value: string) =>
    setRows((rs) =>
      rs.map((r, k) =>
        k === i
          ? {
              ...r,
              [key]:
                key === "exerciseName"
                  ? value
                  : value === ""
                    ? undefined
                    : Number(value),
            }
          : r,
      ),
    );
  return (
    <FormModal
      title="Ghi kết quả buổi tập"
      wide
      onClose={onClose}
      onSubmit={async (d) => {
        await operations.saveLog({
          memberId: Number(d.get("memberId")),
          coachId,
          feedbackFromCoach: String(d.get("feedback")),
          details: rows,
        });
        await client.invalidateQueries({ queryKey: ["workout-logs"] });
        toast("Đã ghi kết quả buổi tập.");
      }}
    >
      <Field label="Học viên">
        <select name="memberId" required defaultValue="">
          <option value="">Chọn học viên</option>
          {students.map((s) => (
            <option key={s.memberId} value={s.memberId}>
              {s.fullName}
            </option>
          ))}
        </select>
      </Field>
      {rows.map((r, i) => (
        <fieldset key={i}>
          <legend>Bài tập {i + 1}</legend>
          <div className="form-grid">
            <Field label="Tên bài tập">
              <input
                value={r.exerciseName}
                required
                onChange={(e) => change(i, "exerciseName", e.target.value)}
              />
            </Field>
            <Field label="Số hiệp">
              <input
                type="number"
                min={1}
                step={1}
                value={r.sets ?? ""}
                onChange={(e) => change(i, "sets", e.target.value)}
              />
            </Field>
            <Field label="Số lần mỗi hiệp">
              <input
                type="number"
                min={1}
                step={1}
                value={r.reps ?? ""}
                onChange={(e) => change(i, "reps", e.target.value)}
              />
            </Field>
            <Field label="Mức tạ (kg)">
              <input
                type="number"
                min={0}
                step="0.1"
                value={r.weightKg ?? ""}
                onChange={(e) => change(i, "weightKg", e.target.value)}
              />
            </Field>
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={rows.length === 1}
            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
          >
            Bỏ bài tập này
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => setRows((rs) => [...rs, { exerciseName: "" }])}
      >
        Thêm bài tập
      </Button>
      <Field label="Nhận xét buổi tập">
        <textarea name="feedback" maxLength={4000} />
      </Field>
      <Notice>
        Kết quả được ghi theo thời điểm máy chủ nhận. Không tự gắn ID lớp vào ID
        buổi tập khi backend chưa trả dữ liệu buổi tương ứng.
      </Notice>
    </FormModal>
  );
}
/** So sánh các lần tập cùng bài từ nhật ký thật; đánh giá tiến độ do HLV ghi nhận. */
function Progress({ logs }: { logs: WorkoutLog[] }) {
  const [exercise, setExercise] = useState("");
  const names = [
    ...new Set(logs.flatMap((l) => l.details.map((d) => d.exerciseName))),
  ];
  const selected = exercise || names[0] || "";
  const rows = logs
    .flatMap((l) =>
      l.details
        .filter((d) => d.exerciseName === selected)
        .map((d, i) => ({ ...d, id: l.id * 1000 + i, createdAt: l.createdAt })),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <Panel title="Theo dõi tiến độ theo bài tập">
      <Field label="Bài tập theo dõi">
        <select value={selected} onChange={(e) => setExercise(e.target.value)}>
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </Field>
      <DataTable
        rows={rows}
        columns={[
          { key: "date", label: "Ngày", render: (r) => dateLabel(r.createdAt) },
          { key: "sets", label: "Số hiệp", render: (r) => r.sets ?? "—" },
          { key: "reps", label: "Số lần", render: (r) => r.reps ?? "—" },
          {
            key: "weight",
            label: "Mức tạ (kg)",
            render: (r) => r.weightKg ?? "—",
          },
        ]}
      />
      <p>
        So sánh cùng bài tập qua các buổi; nhận xét tiến độ do HLV ghi nhận.
      </p>
    </Panel>
  );
}
