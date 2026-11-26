import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useUsers } from "../lib/hooks";
import { trainingApi, weekday } from "../lib/training-api";
import type { ClassRegistration, ProgramKind } from "../lib/training-api";
import { dateLabel, money, parseDate, timeLabel } from "../lib/utils";
import {
  Badge,
  Button,
  Confirm,
  DataTable,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Panel,
} from "../components/ui";
import { CourseOrderDetail } from "../components/CourseCheckout";
import "../styles-training.css";

export default function ClassRegistrations({
  courses = false,
  enrolledOnly = false,
}: {
  courses?: boolean;
  enrolledOnly?: boolean;
}) {
  const { session } = useAuth(),
    users = useUsers(true),
    client = useQueryClient();
  const member = session!.user.roleName === "MEMBER";
  const [memberId, setMemberId] = useState("");
  const selected = member ? session!.user.id : Number(memberId) || undefined;
  const [cancel, setCancel] = useState<ClassRegistration | null>(null),
    [orderId, setOrderId] = useState(0);
  const [program, setProgram] = useState<{ id: number; kind: ProgramKind; from?: string; until?: string } | null>(null);
  const registrations = useQuery({
    queryKey: ["class-registrations", selected],
    queryFn: () => trainingApi.registrations(selected),
    enabled: !courses,
  });
  const orders = useQuery({
    queryKey: ["course-orders", selected],
    queryFn: () => trainingApi.orders(selected),
    enabled: courses,
    refetchInterval: (q) =>
      q.state.data?.some((o) => o.status === "PENDING_PAYMENT") ? 10000 : false,
  });
  const visibleOrders = orders.data?.filter((order) => !enrolledOnly || order.status === "CONFIRMED") ?? [];
  return (
    <>
      <PageHeader
        title={enrolledOnly ? "Khóa học đã mua" : courses ? "Đơn khóa học" : "Lớp đã đăng ký"}
        description={
          enrolledOnly ? "Xem lịch học, tiến độ theo lịch và chi tiết đơn đã xác nhận."
            : courses ? "Theo dõi học phí, trạng thái thanh toán và ghi danh khóa học."
            : "Mỗi dòng là một lịch lớp cố định, có quyền tham gia đến hết hạn gói."
        }
        actions={
          <>
            <Link
              className="btn btn-primary"
              to={courses ? "/courses" : "/regular-classes"}
            >
              {courses ? "Tìm khóa học" : "Tìm lớp học"}
            </Link>
            <Link className="btn btn-secondary" to="/schedule">
              Lịch cá nhân
            </Link>
          </>
        }
      />
      {!member && (
        <Panel>
          <Field label="Lọc theo học viên">
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Tất cả học viên</option>
              {users.data
                ?.filter((u) => u.roleName === "MEMBER")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} · TV{u.id}
                  </option>
                ))}
            </select>
          </Field>
          {users.error && (
            <ErrorState error={users.error} retry={users.refetch} />
          )}
        </Panel>
      )}
      <Panel>
        {courses ? (
          orders.isPending ? (
            <Loading />
          ) : orders.error ? (
            <ErrorState error={orders.error} retry={orders.refetch} />
          ) : !visibleOrders.length ? (
            <Empty title={enrolledOnly ? "Chưa có khóa học đã mua" : "Chưa có đơn khóa học"} />
          ) : (
            <DataTable
              rows={visibleOrders}
              columns={[
                {
                  key: "course",
                  label: "Khóa học",
                  render: (o) => <strong>{o.courseName}</strong>,
                },
                {
                  key: "member",
                  label: "Học viên",
                  render: (o) => `${o.memberName} · TV${o.memberId}`,
                },
                {
                  key: "amount",
                  label: "Học phí",
                  render: (o) => money(o.amount),
                },
                {
                  key: "date",
                  label: "Ngày tạo",
                  render: (o) => dateLabel(o.createdAt),
                },
                {
                  key: "status",
                  label: "Trạng thái",
                  render: (o) => <Badge status={o.status} />,
                },
                {
                  key: "action",
                  label: "Chi tiết",
                  render: (o) => (
                    <>
                      {enrolledOnly && (
                        <Button variant="ghost" onClick={() => setProgram({ id: o.courseId, kind: "COURSE" })}>
                          Xem lịch học
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => setOrderId(o.id)}>
                        Xem đơn
                      </Button>
                    </>
                  ),
                },
              ]}
            />
          )
        ) : registrations.isPending ? (
          <Loading />
        ) : registrations.error ? (
          <ErrorState
            error={registrations.error}
            retry={registrations.refetch}
          />
        ) : !registrations.data.length ? (
          <Empty title="Chưa có lịch lớp đã đăng ký" />
        ) : (
          <DataTable
            rows={registrations.data}
            columns={[
              {
                key: "name",
                label: "Lớp học",
                render: (r) => <strong>{r.className}</strong>,
              },
              {
                key: "member",
                label: "Học viên",
                render: (r) =>
                  users.data?.find((u) => u.id === r.memberId)?.fullName ||
                  `TV${r.memberId}`,
              },
              {
                key: "from",
                label: "Ngày ghi danh",
                render: (r) => dateLabel(r.validFrom),
              },
              {
                key: "until",
                label: "Quyền tham gia đến",
                render: (r) => dateLabel(r.validUntil),
              },
              {
                key: "status",
                label: "Trạng thái",
                render: (r) => <Badge status={r.status} />,
              },
              {
                key: "action",
                label: "Thao tác",
                render: (r) => (
                  <>
                    {member && (
                      <Button variant="ghost" onClick={() => setProgram({
                        id: r.regularClassId, kind: "REGULAR", from: r.validFrom, until: r.validUntil,
                      })}>
                        Xem lịch học
                      </Button>
                    )}
                    {r.status === "ACTIVE" && (
                      <Button variant="ghost" onClick={() => setCancel(r)}>
                        Hủy đăng ký
                      </Button>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
      </Panel>
      {program && <RegisteredSchedule program={program} onClose={() => setProgram(null)} />}
      {!courses && (
        <p className="muted">
          Lượt đặt buổi trước khi tách lớp vẫn được giữ trong{" "}
          <Link to={member ? "/classes" : "/session-bookings"}>danh sách buổi đã đặt</Link>.
        </p>
      )}
      {cancel && (
        <Confirm
          title={`Hủy đăng ký ${cancel.className}?`}
          description="Các buổi tương lai sẽ được hủy giữ chỗ. Lịch sử đã học được giữ. Bộ môn đã chọn trong kỳ gói vẫn giữ nguyên."
          onClose={() => setCancel(null)}
          onConfirm={async () => {
            await trainingApi.cancelRegistration(cancel.id);
            await client.invalidateQueries();
            setCancel(null);
          }}
        />
      )}
      {orderId > 0 && (
        <CourseOrderDetail orderId={orderId} onClose={() => setOrderId(0)} />
      )}
    </>
  );
}

function RegisteredSchedule({ program, onClose }: {
  program: { id: number; kind: ProgramKind; from?: string; until?: string };
  onClose: () => void;
}) {
  const details = useQuery({
    queryKey: ["program-detail", program.kind, program.id],
    queryFn: () => trainingApi.detail(program.kind, program.id),
  });
  const sessions = useQuery({
    queryKey: ["program-sessions", program.kind, program.id],
    queryFn: () => trainingApi.sessions(program.kind, program.id),
  });
  const memberSessions = (sessions.data ?? []).filter((item) => {
    const day = item.scheduleTime.slice(0, 10);
    return (!program.from || day >= program.from) && (!program.until || day <= program.until);
  });
  const upcoming = memberSessions
    .filter((item) => item.status === "SCHEDULED" && parseDate(item.scheduleTime) > new Date())
    .sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))
    .slice(0, 3);
  return (
    <Modal title={details.data?.name ?? "Lịch học"} onClose={onClose}>
      {details.isPending ? <Loading /> : details.error ? (
        <ErrorState error={details.error} retry={details.refetch} />
      ) : (
        <ul className="training-slot-list">
          {details.data.slots.map((slot) => (
            <li key={slot.dayOfWeek}>
              <strong>{weekday(slot.dayOfWeek)} · {slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)}</strong>
              <small>{[slot.coachName, slot.roomName].filter(Boolean).join(" · ")}</small>
            </li>
          ))}
        </ul>
      )}
      {sessions.isPending ? <Loading /> : sessions.error ? (
        <ErrorState error={sessions.error} retry={sessions.refetch} />
      ) : (
        <>
          <p>Buổi đã hoàn thành theo lịch: {memberSessions.filter((item) => item.status === "COMPLETED").length}</p>
          {upcoming.length > 0 && (
            <ul>{upcoming.map((item) => (
              <li key={item.id}>{dateLabel(item.scheduleTime)} · {timeLabel(item.scheduleTime)}</li>
            ))}</ul>
          )}
        </>
      )}
      <Link to="/schedule" onClick={onClose}>Xem lịch hoạt động</Link>
    </Modal>
  );
}
