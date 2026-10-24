/**
 * FLOW 4 — ĐIỂM DANH VÀ LỊCH SỬ CÓ MẶT/VẮNG.
 * Thành viên xem lịch sử của mình; nhân viên/HLV chọn lớp để ghi nhận.
 * Danh sách chưa điểm danh được ghép từ booking BOOKED và dữ liệu attendance.
 */
import { useState } from "react";
import {
  Check,
  ClipboardCheck,
  Clock3,
  ScanLine,
  UserCheck,
  UserX,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useClasses, useUsers } from "../lib/hooks";
import { api } from "../lib/api";
import {
  addDays,
  dateLabel,
  downloadCsv,
  idLabel,
  localDate,
  matches,
  timeLabel,
} from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  Empty,
  ErrorState,
  ExportButton,
  Field,
  FormModal,
  Loading,
  MemberField,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  useToast,
} from "../components/ui";
export default function Attendance() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const member = session!.user.roleName === "MEMBER";
  const classes = useClasses();
  const users = useUsers();
  const [classId, setClassId] = useState(params.get("classId") || "");
  const effectiveClassId = classId || String(classes.data?.[0]?.id || "");
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState(false);
  const [start, setStart] = useState(localDate(addDays(-30)));
  const [end, setEnd] = useState(localDate());
  const [pending, setPending] = useState<number | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  /**
   * MEMBER truy vấn lịch sử của chính mình; vai trò khác truy vấn lớp đang chọn.
   * Khoảng ngày và ID nằm trong key; không gọi khi chưa có lớp hoặc ngày bị đảo.
   */
  const query = useQuery({
    queryKey: [
      "attendance",
      member ? session!.user.id : undefined,
      member ? undefined : effectiveClassId,
      start,
      end,
    ],
    queryFn: () =>
      api.attendance(
        member ? session!.user.id : undefined,
        member ? undefined : Number(effectiveClassId),
        start,
        end,
      ),
    enabled: (member || !!effectiveClassId) && start <= end,
  });
  const bookings = useQuery({
    queryKey: ["classBookings", effectiveClassId],
    queryFn: () => api.bookings(undefined, Number(effectiveClassId)),
    enabled: !member && !!effectiveClassId,
  });
  const rows = (query.data || []).filter((a) =>
    matches(
      search,
      users.data?.find((u) => u.id === a.memberId)?.fullName,
      a.memberId,
      idLabel(a.memberId),
    ),
  );
  const present = (query.data || []).filter(
    (a) => a.status === "PRESENT",
  ).length;
  const absent = (query.data || []).filter((a) => a.status === "ABSENT").length;
  /**
   * Danh sách cần điểm danh = booking BOOKED trừ người đã có attendance trong
   * tập dữ liệu đang tải; đây là phép ghép phía frontend, không phải bảng SQL mới.
   */
  const roster =
    bookings.data?.filter(
      (b) =>
        b.status === "BOOKED" &&
        !query.data?.some((a) => a.memberId === b.memberId),
    ) || [];
  const currentClass = classes.data?.find(
    (c) => c.id === Number(effectiveClassId),
  );
  /**
   * Gửi memberId người học, classId và checkedInBy là người đang thao tác.
   * pending khóa thao tác tương ứng trong lúc chờ; chỉ báo thành công sau API
   * và luôn bỏ trạng thái chờ ở finally để không bị kẹt khi lỗi.
   */
  async function quickCheck(memberId: number, status: string) {
    setPending(memberId);
    try {
      await api.checkIn({
        memberId,
        classId: Number(effectiveClassId),
        checkedInBy: session!.user.id,
        status,
      });
      await client.invalidateQueries();
      toast("Đã ghi nhận điểm danh.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Không thể điểm danh.", "error");
    } finally {
      setPending(null);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="EVERY VISIT COUNTS"
        title={member ? "Lịch sử điểm danh" : "Điểm danh"}
        description="Ghi nhận sự hiện diện. Trân trọng từng nỗ lực."
        actions={
          <>
            <ExportButton
              onClick={() =>
                downloadCsv("diem-danh.csv", [
                  ["Mã", "ID thành viên", "ID lớp", "Thời gian", "Trạng thái"],
                  ...rows.map((a) => [
                    a.id,
                    a.memberId,
                    a.classId,
                    a.checkedInAt,
                    a.status,
                  ]),
                ])
              }
            />
            {!member && (
              <Button onClick={() => setCreate(true)}>
                <ScanLine size={17} />
                Điểm danh thành viên
              </Button>
            )}
          </>
        }
      />
      <div className="attendance-controls">
        {!member && (
          <Field label="Lớp học">
            <select
              value={effectiveClassId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Lớp cần điểm danh"
            >
              {classes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className} · {dateLabel(c.scheduleTime)}{" "}
                  {timeLabel(c.scheduleTime)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Từ ngày">
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </Field>
        <Field label="Đến ngày">
          <input
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </Field>
        {!member && currentClass && (
          <div className="attendance-class-note">
            <Clock3 size={17} />
            {currentClass.durationMinutes} phút · Tối đa{" "}
            {currentClass.maxCapacity} thành viên
          </div>
        )}
      </div>
      {start > end && (
        <Notice tone="warning">
          Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.
        </Notice>
      )}
      <div className="mini-stats">
        <div>
          <span className="mini-stat-icon green">
            <UserCheck size={22} />
          </span>
          <div>
            <p>Có mặt</p>
            <strong>{present}</strong>
          </div>
        </div>
        <div>
          <span className="mini-stat-icon orange">
            <UserX size={22} />
          </span>
          <div>
            <p>Vắng mặt</p>
            <strong>{absent}</strong>
          </div>
        </div>
        <div>
          <span className="mini-stat-icon purple">
            <ClipboardCheck size={22} />
          </span>
          <div>
            <p>
              {member
                ? "Tỷ lệ có mặt · phạm vi đã chọn"
                : "Chưa điểm danh trong lớp"}
            </p>
            <strong>
              {member
                ? `${present + absent ? Math.round((present / (present + absent)) * 100) : 0}%`
                : roster.length}
            </strong>
          </div>
        </div>
      </div>
      {!member && (
        <Panel
          title="Danh sách cần điểm danh"
          description="Chỉ ghi nhận một lần cho mỗi thành viên trong một lớp."
        >
          <div className="check-in-roster">
            {bookings.isPending && effectiveClassId ? (
              <Loading />
            ) : bookings.error ? (
              <ErrorState error={bookings.error} retry={bookings.refetch} />
            ) : roster.length ? (
              roster.map((b) => {
                const u = users.data?.find((u) => u.id === b.memberId);
                return (
                  <div className="check-in-person" key={b.id}>
                    <Avatar
                      name={u?.fullName || `TV ${b.memberId}`}
                      index={b.memberId}
                    />
                    <div>
                      <strong>
                        {u?.fullName || `Thành viên #${b.memberId}`}
                      </strong>
                      <small>{idLabel(b.memberId)}</small>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={
                        pending !== null || query.isPending || !!query.error
                      }
                      loading={pending === b.memberId}
                      onClick={() => quickCheck(b.memberId, "PRESENT")}
                    >
                      <Check size={15} />
                      Có mặt
                    </Button>
                    <button
                      className="text-danger"
                      disabled={
                        pending !== null || query.isPending || !!query.error
                      }
                      onClick={() => quickCheck(b.memberId, "ABSENT")}
                    >
                      Vắng
                    </button>
                  </div>
                );
              })
            ) : (
              <Empty
                title="Đã sẵn sàng cho buổi tập"
                description="Không còn thành viên nào chờ điểm danh trong lớp được chọn."
              />
            )}
          </div>
        </Panel>
      )}
      <Panel
        title={member ? "Các buổi tập đã ghi nhận" : "Lịch sử đã điểm danh"}
        action={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm thành viên..."
          />
        }
      >
        {query.isPending && (member || effectiveClassId) ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                key: "member",
                label: "Thành viên",
                render: (a) => {
                  const u = users.data?.find((u) => u.id === a.memberId);
                  return (
                    <div className="person-cell">
                      <Avatar
                        name={u?.fullName || `TV ${a.memberId}`}
                        index={a.memberId}
                        size="small"
                      />
                      <span>
                        <strong>
                          {u?.fullName || `Thành viên #${a.memberId}`}
                        </strong>
                        <small>{idLabel(a.memberId)}</small>
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "class",
                label: "Lớp học",
                render: (a) =>
                  classes.data?.find((c) => c.id === a.classId)?.className ||
                  `Lớp #${a.classId}`,
              },
              {
                key: "time",
                label: "Thời gian ghi nhận",
                render: (a) => (
                  <div className="contact-cell">
                    <strong>{timeLabel(a.checkedInAt)}</strong>
                    <small>{dateLabel(a.checkedInAt)}</small>
                  </div>
                ),
              },
              {
                key: "checker",
                label: "Người ghi nhận",
                render: (a) =>
                  users.data?.find((u) => u.id === a.checkedInBy)?.fullName ||
                  `Nhân viên #${a.checkedInBy || "—"}`,
              },
              {
                key: "status",
                label: "Trạng thái",
                render: (a) => <Badge status={a.status} />,
              },
            ]}
          />
        )}
      </Panel>
      {!member && (
        <Notice>
          BE hiện chỉ chấp nhận điểm danh theo lớp, chưa có endpoint check-in
          trung tâm độc lập. Thời gian lọc danh sách lớp được áp dụng phía FE.
        </Notice>
      )}
      {create && (
        <FormModal
          title="Ghi nhận điểm danh"
          description="Chọn thành viên và lớp học đang tham gia."
          onClose={() => setCreate(false)}
          submitLabel="Lưu điểm danh"
          onSubmit={async (d) => {
            await api.checkIn({
              memberId: Number(d.get("memberId")),
              classId: Number(d.get("classId")),
              checkedInBy: session!.user.id,
              status: String(d.get("status")),
            });
            await client.invalidateQueries();
            toast("Đã ghi nhận điểm danh.");
          }}
        >
          <MemberField users={users.data || []} />
          <Field label="Lớp học">
            <select name="classId" required defaultValue={effectiveClassId}>
              {classes.data
                ?.filter((c) => c.status !== "CANCELLED")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.className} · {dateLabel(c.scheduleTime)}{" "}
                    {timeLabel(c.scheduleTime)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Trạng thái">
            <select name="status">
              <option value="PRESENT">Có mặt</option>
              <option value="ABSENT">Vắng mặt</option>
            </select>
          </Field>
          <Notice>
            Điểm danh đã lưu chưa thể sửa do backend chưa có endpoint cập nhật.
          </Notice>
        </FormModal>
      )}
    </>
  );
}
