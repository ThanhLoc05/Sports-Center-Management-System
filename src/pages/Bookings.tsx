import PersonalBookings from "../components/PersonalBookings";
import BookingForm from "../components/BookingForm";
import "../styles-bookings.css";
import { usePermissions } from "../lib/hooks";
/**
 * FLOW 2 — QUẢN LÝ BOOKING (MỐI LIÊN HỆ THÀNH VIÊN ↔ LỚP).
 * Thành viên thao tác cho mình; nhân viên chọn thành viên để hỗ trợ.
 * Hủy booking trả chỗ của một học viên, khác với quản lý hủy toàn bộ lớp.
 */
import { useState } from "react";
import { CalendarDays, Plus, Search, XCircle } from "lucide-react";
import { useSearchParams, Link } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { operations } from "../lib/operations-api";
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
export default function Bookings({ personal = false }: { personal?: boolean }) {
  return personal ? <PersonalBookings /> : <BookingTable />;
}

function BookingTable() {
  const { session } = useAuth();
  const can = usePermissions();
  const member = session!.user.roleName === "MEMBER",
    coach = session!.user.roleName === "COACH";
  const [params] = useSearchParams();
  const classes = useClasses();
  const users = useUsers(true);
  const initialSearch = !member && !coach ? params.get("memberId") || "" : "";
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState("all");
  const [create, setCreate] = useState(false);
  const [cancel, setCancel] = useState<Booking | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  const staff = !member && !coach;
  const selectedClass = classes.data?.find((item) => item.id === Number(classId));
  const query = useQuery({
    queryKey: ["bookings", session!.user.id, session!.user.roleName, member ? session!.user.id : classId],
    queryFn: () => member
      ? api.bookings(session!.user.id)
      : api.bookings(undefined, Number(classId)),
    enabled: member || (coach && !!selectedClass),
  });
  const coachNames = useQuery({
    queryKey: ["coachBookingNames", session!.user.id, selectedClass?.id],
    queryFn: () => operations.students(selectedClass!.id),
    enabled: coach && session!.mode === "api" && !!selectedClass,
  });
  const rosterClasses = staff
    ? (classes.data ?? []).filter((item) => !classId || item.id === Number(classId))
    : [];
  const rosters = useQueries({
    queries: rosterClasses.map((item) => ({
      queryKey: ["bookings", session!.user.id, session!.user.roleName, item.id],
      queryFn: () => api.bookings(undefined, item.id),
    })),
  });
  const rosterErrors = rosterClasses.filter((_, index) => rosters[index].isError);
  const bookings = staff ? rosters.flatMap((roster) => roster.data ?? []) : query.data ?? [];
  const loadingBookings = staff
    ? classes.isPending || (!bookings.length && rosters.some((roster) => roster.isPending))
    : query.isPending;
  const names = new Map(users.data?.map((user) => [user.id, user.fullName]));
  for (const student of coachNames.data ?? []) {
    if (student.fullName?.trim()) names.set(student.memberId, student.fullName.trim());
  }
  // Số thuần hoặc TV0010 tìm đúng mã thành viên; tên vẫn tìm gần đúng, không phân biệt dấu.
  const searchedMemberId = search.trim().match(/^(?:TV\s*)?(\d+)$/i);
  const rows = bookings.filter((b) => {
    const c = classes.data?.find((c) => c.id === b.classId);
    return (
      (!coach || classes.data?.some((c) => c.id === b.classId)) &&
      (!member ||
        (b.memberId === session!.user.id &&
          (!classId || b.classId === Number(classId)))) &&
      (!staff || !classId || b.classId === Number(classId)) &&
      (searchedMemberId
        ? b.memberId === Number(searchedMemberId[1])
        : matches(search, c?.className, names.get(b.memberId), idLabel(b.id, "DK"))) &&
      (status === "all" || b.status === status)
    );
  });
  return (
    <>
      <PageHeader
        eyebrow="A PLACE FOR EVERYONE"
        title={
          member
            ? "Đăng ký lớp của tôi"
            : coach
              ? "Học viên đăng ký"
              : "Đăng ký lớp học"
        }
        description={
          coach
            ? "Theo dõi danh sách học viên trong các lớp bạn phụ trách."
            : "Mỗi chỗ được giữ là một cam kết cho hành trình khỏe mạnh hơn."
        }
        actions={
          <>
            <Link className="btn btn-secondary" to={member && session!.mode === "api" ? "/sessions" : "/classes"}>
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
          <form
            className="booking-search-row"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput);
            }}
          >
            <SearchInput
              value={searchInput}
              onChange={(value) => {
                setSearchInput(value);
                if (!value) setSearch("");
              }}
              label="Tìm đăng ký theo ID hoặc tên thành viên"
              placeholder="Nhập ID, mã TV hoặc tên thành viên..."
            />
            <Button type="submit" variant="secondary">
              <Search size={16} />
              Tìm kiếm
            </Button>
            {search && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setClassId("");
                  setStatus("all");
                }}
              >
                Xem tất cả
              </Button>
            )}
          </form>
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
        {staff && users.error && <ErrorState error={users.error} retry={users.refetch} />}
        {coachNames.error && <ErrorState error={coachNames.error} retry={coachNames.refetch} />}
        {rosterErrors.length > 0 && (
          <Notice>
            Không tải được đăng ký của: {rosterErrors.map((item) => item.className).join(", ")}.{" "}
            <Button variant="secondary" onClick={() => {
              for (const roster of rosters) if (roster.isError) void roster.refetch();
            }}>Thử tải lại lớp bị lỗi</Button>
          </Notice>
        )}
        {!member && classes.error ? (
          <ErrorState error={classes.error} retry={classes.refetch} />
        ) : coach && !classes.isPending && !selectedClass ? (
          <Notice>Chọn lớp phụ trách để xem đăng ký.</Notice>
        ) : loadingBookings ? (
          <Loading />
        ) : !staff && query.error ? (
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
                  const name = names.get(b.memberId);
                  return (
                    <div className="person-cell">
                      <Avatar
                        name={name || `TV ${b.memberId}`}
                        index={b.memberId}
                        size="small"
                      />
                      <span>
                        <strong>
                          {name || `Thành viên #${b.memberId}`}
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
                render: (b) => (
                  <Badge status={b.status} />
                ),
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
          memberId={searchedMemberId ? Number(searchedMemberId[1]) : undefined}
          onClose={() => setCreate(false)}
        />
      )}
      {cancel && (
        <Confirm
          title="Hủy đăng ký lớp?"
          description="Hủy sẽ trả lại chỗ cho lớp. Hủy sát giờ có thể tính một vi phạm giữ chỗ."
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
