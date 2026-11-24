import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useUsers } from "../lib/hooks";
import { trainingApi } from "../lib/training-api";
import type { ClassRegistration } from "../lib/training-api";
import { dateLabel, money } from "../lib/utils";
import {
  Badge,
  Button,
  Confirm,
  DataTable,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  Panel,
} from "../components/ui";
import { CourseOrderDetail } from "../components/CourseCheckout";
import "../styles-training.css";

export default function ClassRegistrations({
  courses = false,
}: {
  courses?: boolean;
}) {
  const { session } = useAuth(),
    users = useUsers(true),
    client = useQueryClient();
  const member = session!.user.roleName === "MEMBER";
  const [memberId, setMemberId] = useState("");
  const selected = member ? session!.user.id : Number(memberId) || undefined;
  const [cancel, setCancel] = useState<ClassRegistration | null>(null),
    [orderId, setOrderId] = useState(0);
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
  return (
    <>
      <PageHeader
        title={courses ? "Đơn khóa học" : "Lớp đã đăng ký"}
        description={
          courses
            ? "Theo dõi học phí, trạng thái thanh toán và ghi danh khóa học."
            : "Mỗi dòng là một lịch lớp cố định, có quyền tham gia đến hết hạn gói."
        }
        actions={
          <>
            <Link
              className="btn btn-primary"
              to={courses ? "/courses" : "/classes"}
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
          ) : !orders.data.length ? (
            <Empty title="Chưa có đơn khóa học" />
          ) : (
            <DataTable
              rows={orders.data}
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
                    <Button variant="ghost" onClick={() => setOrderId(o.id)}>
                      Xem đơn
                    </Button>
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
                render: (r) =>
                  r.status === "ACTIVE" && (
                    <Button variant="ghost" onClick={() => setCancel(r)}>
                      Hủy đăng ký
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Panel>
      {!courses && (
        <p className="muted">
          Lượt đặt buổi trước khi tách lớp vẫn được giữ trong{" "}
          <Link to="/session-bookings">lịch sử đặt buổi</Link>.
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
