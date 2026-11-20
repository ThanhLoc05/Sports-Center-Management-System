/**
 * HLV quản lý giáo án cá nhân/cả lớp, ghi kết quả và nhận xét sau buổi tập.
 * Thành viên chỉ xem dữ liệu của mình; quản lý có thể chọn HLV để tra cứu.
 * Nhật ký có thể lưu buổi học đã chọn bằng scheduleId.
 * Mỗi lần lưu thành công sẽ làm mới cache tương ứng để cập nhật màn hình.
 */
import { useEffect, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useClasses, useUsers } from "../lib/hooks";
import { useAssignedStudents } from "../lib/use-coach-data";
import { operations } from "../lib/operations-api";
import { api } from "../lib/api";
import type { WorkoutPlan, WorkoutLog, Exercise } from "../lib/operations-api";
import type { SportClass } from "../lib/types";
import { dateLabel, matches, timeLabel } from "../lib/utils";
import { workoutMetricUnits } from "../lib/training-metrics";
import type { WorkoutMetricUnit } from "../lib/training-metrics";
import { TrainingInstructions } from "./TrainingInstructions";
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

function classSessionLabel(item: SportClass) {
  return `${item.className} · ${dateLabel(item.scheduleTime)} ${timeLabel(item.scheduleTime)}`;
}

export default function ApiTraining() {
  const { session } = useAuth();
  return <TrainingContent key={`${session?.user.id}:${session?.user.roleName}`} />;
}
function TrainingContent() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const canCreatePlan = !!coachId && !students.error && !students.isPending;
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
  const classesById = new Map((classes.data || []).map((c) => [c.id, c]));
  const missingClassIds = [
    ...new Set(
      visibleLogs.flatMap(({ scheduleId }) =>
        scheduleId != null && !classesById.has(scheduleId) ? [scheduleId] : [],
      ),
    ),
  ];
  const recordedClasses = useQueries({
    queries: missingClassIds.map((id) => ({
      queryKey: ["classDetail", id, actor.id],
      queryFn: () => api.classDetail(id),
      enabled: !classes.isPending,
      retry: false,
    })),
  });
  for (const result of recordedClasses) {
    if (result.data) classesById.set(result.data.id, result.data);
  }
  const logSessionLabel = (log: WorkoutLog) => {
    if (log.scheduleId == null) return "Chưa gắn buổi học";
    const item = classesById.get(log.scheduleId);
    return item ? classSessionLabel(item) : `Buổi tập #${log.scheduleId}`;
  };
  const name = (id: number) =>
    students.data.find((s) => s.memberId === id)?.fullName || "Học viên #" + id;

  useEffect(() => {
    if (!coach || !canCreatePlan || searchParams.get("new") !== "1") return;

    setEdit(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new");
    setSearchParams(nextParams, { replace: true });
  }, [coach, canCreatePlan, searchParams, setSearchParams]);

  return (
    <>
      <PageHeader
        title={member ? "Kế hoạch tập luyện của tôi" : "Kế hoạch tập luyện"}
        description="Giáo án, kết quả từng buổi và nhận xét được lưu qua backend."
        actions={
          !member ? (
            <>
              <Button
                disabled={!canCreatePlan}
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
        <Panel className="panel-spaced" title="Huấn luyện viên phụ trách">
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
      <Panel className="panel-spaced" title="Danh sách kế hoạch">
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
      <Panel className="panel-spaced" title="Kết quả và tiến độ học viên">
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
                  label: "Buổi tập",
                  render: (l) => (
                    <div className="contact-cell">
                      <strong>{logSessionLabel(l)}</strong>
                      <small>
                        Ghi nhận {dateLabel(l.createdAt)} {timeLabel(l.createdAt)}
                      </small>
                    </div>
                  ),
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
                        <li key={d.id || i}>{exerciseResult(d)}</li>
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
            {selectedMember > 0 && (
              <Progress key={selectedMember} logs={visibleLogs} classesById={classesById} />
            )}
          </>
        )}
      </Panel>
      {detail && (
        <Modal className="content-preview-dialog" title={detail.title} onClose={() => setDetailId(null)}>
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
          classes={scopedClasses}
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
            {name(feedback.memberId)} ·{" "}
            {feedback.scheduleId == null
              ? dateLabel(feedback.createdAt)
              : logSessionLabel(feedback)}
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
  classes: SportClass[];
  plan?: WorkoutPlan;
}) {
  const [target, setTarget] = useState(plan?.classId ? "class" : "member");
  const [classId, setClassId] = useState(String(plan?.classId ?? ""));
  const selectedClass = classes.find((item) => item.id === Number(classId));
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
          <select
            name="classId"
            required
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
          >
            <option value="">Chọn lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.className}
              </option>
            ))}
          </select>
        </Field>
      )}
      <TrainingInstructions
        label="Nội dung giáo án"
        name="description"
        initialValue={plan?.description}
        minLength={3}
        rows={10}
        forClass={target === "class"}
        classSportId={selectedClass?.sportId}
      />
    </>
  );
}
type Measurement = "none" | "fitness" | WorkoutMetricUnit;
type ExerciseDraft = Exercise & { measurement?: Measurement };
const measurementLabels: Record<Measurement, string> = {
  none: "Chỉ ghi tên bài tập",
  fitness: "Số hiệp, số lần và mức tạ",
  ...workoutMetricUnits,
};
const metricSteps: Partial<Record<WorkoutMetricUnit, number>> = {
  repetitions: 1,
  rounds: 1,
  hitsPer20: 1,
};

function measurementFor(exercise: Exercise): Measurement {
  if (exercise.metricUnit != null && exercise.metricValue != null)
    return exercise.metricUnit;
  return exercise.sets != null ||
    exercise.reps != null ||
    exercise.weightKg != null
    ? "fitness"
    : "none";
}

function exerciseResult(exercise: Exercise) {
  const { exerciseName, sets, reps, weightKg, metricUnit, metricValue } =
    exercise;
  if (metricUnit != null && metricValue != null)
    return `${exerciseName}: ${metricValue} ${workoutMetricUnits[metricUnit]}`;
  const results = [
    sets != null && `${sets} hiệp`,
    reps != null && `${reps} lần`,
    weightKg != null && `${weightKg} kg`,
  ].filter(Boolean);
  return results.length
    ? `${exerciseName}: ${results.join(" · ")}`
    : exerciseName;
}

function exerciseDetails(
  row: ExerciseDraft,
  measurement: Measurement,
): Exercise {
  const exerciseName = row.exerciseName.trim();
  if (measurement === "none") return { exerciseName };
  if (measurement === "fitness")
    return {
      exerciseName,
      sets: row.sets,
      reps: row.reps,
      weightKg: row.weightKg,
    };
  return {
    exerciseName,
    metricUnit: measurement,
    metricValue: row.metricValue,
  };
}

/** Form nhập nhiều bài tập cho một học viên trong một lần ghi kết quả. */
function LogForm({
  coachId,
  students,
  classes,
  onClose,
}: {
  coachId: number;
  students: Student[];
  classes: SportClass[];
  onClose: () => void;
}) {
  const { session } = useAuth();
  const actor = session!.user;
  const [memberId, setMemberId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [rows, setRows] = useState<ExerciseDraft[]>([{ exerciseName: "" }]);
  const bookingQueries = useQueries({
    queries: memberId
      ? classes.map((item) => ({
          queryKey: [
            "workout-class-bookings",
            actor.id,
            actor.roleName,
            item.id,
          ],
          queryFn: () => api.bookings(undefined, item.id),
          retry: false,
        }))
      : [],
  });
  const eligibleClasses = classes
    .filter((item, index) => {
      const result = bookingQueries[index];
      return (
        result?.isSuccess &&
        result.data.some(
          (booking) =>
            booking.classId === item.id &&
            booking.memberId === Number(memberId) &&
            booking.status === "BOOKED",
        )
      );
    })
    .sort((a, b) => b.scheduleTime.localeCompare(a.scheduleTime));
  const selectedClass = eligibleClasses.find(
    (item) => String(item.id) === scheduleId,
  );
  const sports = useQuery({
    queryKey: ["sports"],
    queryFn: api.sports,
    enabled: selectedClass?.sportId != null,
  });
  const sportName = sports.data?.find(
    (item) => item.id === selectedClass?.sportId,
  )?.name;
  const defaultMeasurement =
    selectedClass?.sportId != null &&
    sportName?.trim().toLowerCase() !== "fitness"
      ? "none"
      : "fitness";
  const invalidSchedule = !!scheduleId && !selectedClass;
  const bookingErrors = bookingQueries.filter((query) => query.isError);
  const client = useQueryClient();
  const toast = useToast();
  const updateRow = (index: number, changes: Partial<ExerciseDraft>) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...changes } : row)),
    );
  };
  const updateNumber = (
    index: number,
    field: "sets" | "reps" | "weightKg" | "metricValue",
    value: string,
  ) => {
    updateRow(index, {
      [field]: value === "" ? undefined : Number(value),
      measurement: rows[index].measurement ?? defaultMeasurement,
    });
  };
  return (
    <FormModal
      title="Ghi kết quả buổi tập"
      wide
      onClose={onClose}
      submitDisabled={invalidSchedule}
      onSubmit={async (d) => {
        if (invalidSchedule)
          throw new Error("Hãy chọn lại buổi tập trước khi lưu.");
        await operations.saveLog({
          memberId: Number(memberId),
          coachId,
          ...(selectedClass && { scheduleId: selectedClass.id }),
          feedbackFromCoach: String(d.get("feedback")),
          details: rows.map((row) =>
            exerciseDetails(row, row.measurement ?? defaultMeasurement),
          ),
        });
        await client.invalidateQueries({ queryKey: ["workout-logs"] });
        toast("Đã ghi kết quả buổi tập.");
      }}
    >
      <Field label="Học viên">
        <select
          name="memberId"
          required
          value={memberId}
          onChange={(e) => {
            setMemberId(e.target.value);
            setScheduleId("");
          }}
        >
          <option value="">Chọn học viên</option>
          {students.map((s) => (
            <option key={s.memberId} value={s.memberId}>
              {s.fullName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Buổi tập">
        <select
          name="scheduleId"
          value={scheduleId}
          disabled={!memberId}
          onChange={(e) => setScheduleId(e.target.value)}
        >
          <option value="">Ghi nhận riêng</option>
          {invalidSchedule && (
            <option value={scheduleId} disabled>
              Chọn lại buổi tập
            </option>
          )}
          {eligibleClasses.map((item) => (
            <option key={item.id} value={item.id}>
              {classSessionLabel(item)}
            </option>
          ))}
        </select>
      </Field>
      {bookingQueries.some((query) => query.isPending) && (
        <p role="status">Đang tải danh sách buổi tập...</p>
      )}
      {bookingErrors.length > 0 && (
        <ErrorState
          error={bookingErrors[0].error}
          retry={() => bookingErrors.forEach((query) => void query.refetch())}
        />
      )}
      {rows.map((r, i) => {
        const measurement = r.measurement ?? defaultMeasurement;
        return (
          <fieldset key={i}>
            <legend>Bài tập {i + 1}</legend>
            <div className="form-grid">
              <Field label="Tên bài tập">
                <input
                  value={r.exerciseName}
                  required
                  onChange={(e) =>
                    updateRow(i, { exerciseName: e.target.value })
                  }
                />
              </Field>
              <Field label="Cách ghi kết quả">
                <select
                  value={measurement}
                  onChange={(e) =>
                    updateRow(i, {
                      measurement: e.target.value as Measurement,
                      metricValue: undefined,
                    })
                  }
                >
                  {Object.entries(measurementLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {measurement === "fitness" ? (
                <>
                  <Field label="Số hiệp">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={r.sets ?? ""}
                      onChange={(e) => updateNumber(i, "sets", e.target.value)}
                    />
                  </Field>
                  <Field label="Số lần mỗi hiệp">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={r.reps ?? ""}
                      onChange={(e) => updateNumber(i, "reps", e.target.value)}
                    />
                  </Field>
                  <Field label="Mức tạ (kg)">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={r.weightKg ?? ""}
                      onChange={(e) =>
                        updateNumber(i, "weightKg", e.target.value)
                      }
                    />
                  </Field>
                </>
              ) : (
                measurement !== "none" && (
                  <Field label={`Kết quả (${workoutMetricUnits[measurement]})`}>
                    <input
                      type="number"
                      min={0}
                      max={measurement === "hitsPer20" ? 20 : 999999999.999}
                      step={metricSteps[measurement] ?? 0.001}
                      required
                      value={r.metricValue ?? ""}
                      onChange={(e) =>
                        updateNumber(i, "metricValue", e.target.value)
                      }
                    />
                  </Field>
                )
              )}
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
        );
      })}
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
    </FormModal>
  );
}
/** So sánh các lần tập cùng bài từ nhật ký thật; đánh giá tiến độ do HLV ghi nhận. */
function Progress({
  logs,
  classesById,
}: {
  logs: WorkoutLog[];
  classesById: ReadonlyMap<number, SportClass>;
}) {
  const [exercise, setExercise] = useState("");
  const [measurement, setMeasurement] = useState<Measurement>();
  const names = [
    ...new Set(logs.flatMap((l) => l.details.map((d) => d.exerciseName))),
  ];
  const selected = names.includes(exercise) ? exercise : (names[0] ?? "");
  const measurements = [
    ...new Set(
      logs.flatMap((log) =>
        log.details
          .filter((detail) => detail.exerciseName === selected)
          .map(measurementFor),
      ),
    ),
  ];
  const selectedMeasurement =
    measurement && measurements.includes(measurement)
      ? measurement
      : measurements[0];
  const rows = logs
    .flatMap((l) =>
      l.details
        .map((d, i) => ({
          ...d,
          id: d.id ?? l.id * 1000 + i,
          createdAt: l.createdAt,
          sessionTime:
            l.scheduleId == null
              ? undefined
              : classesById.get(l.scheduleId)?.scheduleTime,
        }))
        .filter(
          (d) =>
            d.exerciseName === selected &&
            measurementFor(d) === selectedMeasurement,
        ),
    )
    .sort((a, b) =>
      (a.sessionTime ?? a.createdAt).localeCompare(
        b.sessionTime ?? b.createdAt,
      ),
    );
  return (
    <Panel className="panel-spaced" title="Theo dõi tiến độ theo bài tập">
      <Field label="Bài tập theo dõi">
        <select
          value={selected}
          onChange={(e) => {
            setExercise(e.target.value);
            setMeasurement(undefined);
          }}
        >
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </Field>
      {measurements.length > 1 && (
        <Field label="Chỉ số theo dõi">
          <select
            value={selectedMeasurement}
            onChange={(e) => setMeasurement(e.target.value as Measurement)}
          >
            {measurements.map((value) => (
              <option key={value} value={value}>
                {measurementLabels[value]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <DataTable
        rows={rows}
        columns={[
          {
            key: "date",
            label: "Ngày",
            render: (r) => (
              <div className="contact-cell">
                <strong>{dateLabel(r.sessionTime ?? r.createdAt)}</strong>
                <small>
                  {r.sessionTime ? "Ngày buổi tập" : "Ngày ghi nhận"}
                </small>
              </div>
            ),
          },
          ...(selectedMeasurement === "fitness"
            ? [
                {
                  key: "sets",
                  label: "Số hiệp",
                  render: (r: Exercise) => r.sets ?? "—",
                },
                {
                  key: "reps",
                  label: "Số lần",
                  render: (r: Exercise) => r.reps ?? "—",
                },
                {
                  key: "weight",
                  label: "Mức tạ (kg)",
                  render: (r: Exercise) => r.weightKg ?? "—",
                },
              ]
            : selectedMeasurement && selectedMeasurement !== "none"
              ? [
                  {
                    key: "metric",
                    label: `Kết quả (${workoutMetricUnits[selectedMeasurement]})`,
                    render: (r: Exercise) => r.metricValue ?? "—",
                  },
                ]
              : [
                  {
                    key: "result",
                    label: "Kết quả",
                    render: () => "Chưa ghi chỉ số",
                  },
                ]),
        ]}
      />
      <p>
        So sánh cùng bài tập qua các buổi; nhận xét tiến độ do HLV ghi nhận.
      </p>
    </Panel>
  );
}
