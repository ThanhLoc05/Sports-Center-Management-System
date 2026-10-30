import BookingForm from "../components/BookingForm";
import { usePermissions } from "../lib/hooks";
/**
 * FLOW 2 — QUẢN LÝ BOOKING (MỐI LIÊN HỆ THÀNH VIÊN ↔ LỚP).
 * Thành viên thao tác cho mình; nhân viên chọn thành viên để hỗ trợ.
 * Hủy booking trả chỗ của một học viên, khác với quản lý hủy toàn bộ lớp.
 */
import { useState } from "react";
import { CalendarDays, Plus, XCircle } from "lucide-react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useClasses, useUsers } from "../lib/hooks";
import type { Booking } from "../lib/types";
import { dateLabel, idLabel, matches, timeLabel } from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  DataTable,
  ErrorState,
  Loading,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  useToast,
} from "../components/ui";
export default function Bookings() {
  const { session } = useAuth();
  const can = usePermissions();
  const member = session!.user.roleName === "MEMBER",
    coach = session!.user.roleName === "COACH",
    demo = session!.mode === "demo";
  const [params] = useSearchParams();
  const classes = useClasses();
  const users = useUsers();
  const [memberId, setMemberId] = useState(
    member ? String(session!.user.id) : params.get("memberId") || "",
  );
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [create, setCreate] = useState(false);
  const [cancel, setCancel] = useState<Booking | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  /**
   * API hiện bắt buộc phạm vi theo thành viên hoặc lớp, không có lấy tất cả.
   * enabled ngăn gọi khi chưa chọn phạm vi; member tự có ID của mình từ phiên.
   */
  const query = useQuery({
    queryKey: ["bookings", memberId, classId],
    queryFn: () =>
      api.bookings(Number(memberId) || undefined, Number(classId) || undefined),
    enabled: demo || !!memberId || !!classId,
  });
  const rows = (query.data || []).filter((b) => {
    const c = classes.data?.find((c) => c.id === b.classId),
      u = users.data?.find((u) => u.id === b.memberId);
    return (
      (!coach || classes.data?.some((c) => c.id === b.classId)) &&
      matches(
        search,
        c?.className,
        u?.fullName,
        idLabel(b.id, "DK"),
        b.memberId,
      ) &&
      (status === "all" || b.status === status)
    );
  });
  return (
    <>
      <PageHeader
        eyebrow="A PLACE FOR EVERYONE"
        title={member ? "Đăng ký lớp của tôi" : "Đăng ký lớp học"}
        description="Mỗi chỗ được giữ là một cam kết cho hành trình khỏe mạnh hơn."
        actions={
          <>
            <Link className="btn btn-secondary" to="/classes">
              <CalendarDays size={16} />
              Khám phá lớp học
            </Link>
            {(member || can("bookings.assist")) && (
              <Button onClick={() => setCreate(true)}>
                <Plus size={17} />
                Đăng ký lớp
              </Button>
            )}
          </>
        }
      />
      <Panel>
        <div className="table-toolbar">
          <div>
            <h2>
              Danh sách đăng ký<span className="count-chip">{rows.length}</span>
            </h2>
            <p>Theo dõi các đăng ký và hỗ trợ thay đổi lịch tập.</p>
          </div>
          <div className="table-filters">
            {!member && (
              <label className="inline-id-field">
                <span>ID thành viên</span>
                <input
                  type="number"
                  min="1"
                  placeholder="Tất cả"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                />
              </label>
            )}
            <Select
              label="Lọc theo lớp học"
              value={classId}
              onChange={setClassId}
            >
              <option value="">Tất cả lớp</option>
              {classes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="table-subtoolbar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm lớp, thành viên, mã đăng ký..."
          />
          <Select
            label="Trạng thái đăng ký"
            value={status}
            onChange={setStatus}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="BOOKED">Đã đăng ký</option>
            <option value="CANCELLED">Đã hủy</option>
          </Select>
        </div>
        {!demo && !memberId && !classId ? (
          <Notice>
            Chọn một lớp học hoặc nhập ID thành viên để tải đăng ký từ backend.
          </Notice>
        ) : query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                key: "id",
                label: "Mã đăng ký",
                render: (b) => (
                  <span className="mono">{idLabel(b.id, "DK")}</span>
                ),
              },
              {
                key: "member",
                label: "Thành viên",
                render: (b) => {
                  const u = users.data?.find((u) => u.id === b.memberId);
                  return (
                    <div className="person-cell">
                      <Avatar
                        name={u?.fullName || `TV ${b.memberId}`}
                        index={b.memberId}
                        size="small"
                      />
                      <span>
                        <strong>
                          {u?.fullName || `Thành viên #${b.memberId}`}
                        </strong>
                        <small>{idLabel(b.memberId)}</small>
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "class",
                label: "Lớp học",
                render: (b) => {
                  const c = classes.data?.find((c) => c.id === b.classId);
                  return (
                    <div className="contact-cell">
                      <strong>{c?.className || `Lớp #${b.classId}`}</strong>
                      <small>
                        {c
                          ? `${dateLabel(c.scheduleTime)} · ${timeLabel(c.scheduleTime)}`
                          : "Không có thông tin lịch"}
                      </small>
                    </div>
                  );
                },
              },
              {
                key: "date",
                label: "Ngày đăng ký",
                render: (b) => dateLabel(b.bookedAt),
              },
              {
                key: "status",
                label: "Trạng thái",
                render: (b) => <Badge status={b.status} />,
              },
              {
                key: "action",
                label: "Thao tác",
                render: (b) =>
                  b.status === "BOOKED" &&
                  (member || can("bookings.assist")) ? (
                    <button
                      className="text-danger"
                      onClick={() => setCancel(b)}
                    >
                      <XCircle size={15} />
                      Hủy đăng ký
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
            ]}
          />
        )}
      </Panel>
      {create && (
        <BookingForm
          memberId={Number(memberId) || undefined}
          onClose={() => setCreate(false)}
        />
      )}
      {cancel && (
        <Confirm
          title="Hủy đăng ký lớp?"
          description="Chỗ của thành viên sẽ được trả lại. Bạn có thể đăng ký lại nếu lớp vẫn còn chỗ và chưa bắt đầu."
          onClose={() => setCancel(null)}
          onConfirm={async () => {
            /**
             * Xác nhận hủy một booking rồi tải lại cache; số chỗ và lịch cá nhân phản ánh
             * dữ liệu mới sau phản hồi, không tự xóa một lớp khỏi hệ thống.
             */
            await api.cancelBooking(cancel.id);
            await client.invalidateQueries();
            toast("Đã hủy đăng ký lớp học.");
          }}
        />
      )}
    </>
  );
}
