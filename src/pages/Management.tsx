import ApiPackages from "../components/ApiPackages";
import ApiStudents from "../components/ApiStudents";
import ApiNotifications from "../components/ApiNotifications";
/**
 * Điều hướng các màn quản lý theo phiên đăng nhập: API thật dùng component Api*.
 * Nhánh Legacy giữ phục vụ chế độ dữ liệu mẫu trong kiểm thử, không dùng thay API lỗi.
 * Chức năng chưa có API được hiển thị rõ trạng thái chờ kết nối ở component tương ứng.
 */
import { useState } from "react";
import { MembershipNotifications } from "../components/MembershipCheckout";
import { Link } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import {
  useClasses,
  useDemoData,
  usePermissions,
  useUsers,
} from "../lib/hooks";
import type { MembershipPackage, Package, User } from "../lib/types";
import {
  markNotificationsRead,
  savePackage,
  sendNotification,
} from "../lib/center";
import { coachMembers } from "../lib/entitlements";
import { api } from "../lib/api";
import { dateLabel, downloadCsv, matches, money } from "../lib/utils";
import {
  Badge,
  Button,
  DataTable,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Loading,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  useToast,
} from "../components/ui";
import { UserProfileModal } from "../components/ProfileEditor";

export function PackagesPage() {
  const { session } = useAuth();
  return session?.mode === "api" ? <ApiPackages /> : <LegacyPackagesPage />;
}
function LegacyPackagesPage() {
  const db = useDemoData();
  const { session } = useAuth();
  const packages = useQuery<MembershipPackage[]>({
    queryKey: ["membershipPackages"],
    queryFn: api.membershipPackages,
    enabled: session?.mode === "api",
  });
  const [edit, setEdit] = useState<Package | true | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Danh mục gói tập"
        description={
          db
            ? "Quản lý học phí, thời hạn, bộ môn được học và hạn mức đăng ký lớp."
            : "Danh mục học phí, thời hạn và cấp STANDARD/VIP của gói tập."
        }
        actions={
          <Button disabled={!db} onClick={() => setEdit(true)}>
            Thêm gói tập
          </Button>
        }
      />
      {!db && (
        <Notice>
          Danh mục được đọc từ backend. Màn hình hiện chỉ hỗ trợ xem, chưa mở
          thao tác thêm hoặc chỉnh sửa gói qua API.
        </Notice>
      )}
      <Panel>
        {/* Giữ nguyên DTO API; không suy thêm bộ môn hoặc hạn mức từ dữ liệu demo. */}
        {!db ? (
          packages.isPending ? (
            <Loading />
          ) : packages.error ? (
            <ErrorState error={packages.error} retry={packages.refetch} />
          ) : !packages.data?.length ? (
            <Empty
              title="Chưa có gói tập"
              description="Danh mục gói tập hiện đang trống."
            />
          ) : (
            <DataTable<MembershipPackage>
              rows={packages.data}
              columns={[
                {
                  key: "name",
                  label: "Gói",
                  render: (p) => <strong>{p.packageName}</strong>,
                },
                {
                  key: "price",
                  label: "Học phí",
                  render: (p) => money(p.price),
                },
                {
                  key: "days",
                  label: "Thời hạn",
                  render: (p) => `${p.durationDays} ngày`,
                },
                {
                  key: "access",
                  label: "Cấp gói",
                  render: (p) => p.accessLevel || "Chưa xác định",
                },
                {
                  key: "description",
                  label: "Mô tả",
                  render: (p) => p.description || "—",
                },
                {
                  key: "status",
                  label: "Trạng thái",
                  render: (p) => <Badge status={p.status} />,
                },
              ]}
            />
          )
        ) : (
          <DataTable
            rows={db?.packages || []}
            columns={[
              {
                key: "name",
                label: "Gói",
                render: (p) => <strong>{p.name}</strong>,
              },
              { key: "price", label: "Học phí", render: (p) => money(p.price) },
              {
                key: "days",
                label: "Thời hạn",
                render: (p) => `${p.durationDays} ngày`,
              },
              {
                key: "sports",
                label: "Bộ môn",
                render: (p) =>
                  p.sportIds
                    ?.map((id) => db?.sports.find((s) => s.id === id)?.name)
                    .join(", ") || "Tất cả bộ môn",
              },
              {
                key: "limit",
                label: "Lượt lớp",
                render: (p) => p.classLimit || "Không giới hạn",
              },
              {
                key: "status",
                label: "Trạng thái",
                render: (p) => <Badge status={p.status || "ACTIVE"} />,
              },
              {
                key: "actions",
                label: "Thao tác",
                render: (p) => (
                  <Button variant="ghost" onClick={() => setEdit(p)}>
                    Chỉnh sửa
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Panel>
      {edit && db && (
        <FormModal
          title={edit === true ? "Thêm gói tập" : "Chỉnh sửa gói tập"}
          onClose={() => setEdit(null)}
          onSubmit={async (d) => {
            savePackage(
              {
                name: String(d.get("name")).trim(),
                description: String(d.get("description")),
                price: Number(d.get("price")),
                durationDays: Number(d.get("days")),
                features: String(d.get("features")).split("\n").filter(Boolean),
                sportIds: d.getAll("sportIds").map(Number),
                classLimit: d.get("classLimit")
                  ? Number(d.get("classLimit"))
                  : null,
                status: String(d.get("status")),
              },
              edit === true ? undefined : edit.id,
            );
            await client.invalidateQueries();
            toast("Đã lưu quyền lợi gói demo.");
          }}
        >
          <div className="form-grid">
            <Field label="Tên gói">
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={edit === true ? "" : edit.name}
              />
            </Field>
            <Field label="Học phí (VND)">
              <input
                type="number"
                name="price"
                min="1"
                step="1"
                required
                defaultValue={edit === true ? undefined : edit.price}
              />
            </Field>
            <Field label="Thời hạn (ngày)">
              <input
                type="number"
                name="days"
                min="1"
                max="3650"
                required
                defaultValue={edit === true ? 30 : edit.durationDays}
              />
            </Field>
            <Field
              label="Số lượt lớp trong kỳ"
              hint="Để trống nếu không giới hạn."
            >
              <input
                type="number"
                name="classLimit"
                min="1"
                defaultValue={
                  edit === true ? undefined : edit.classLimit || undefined
                }
              />
            </Field>
          </div>
          <Field label="Mô tả">
            <textarea
              name="description"
              required
              defaultValue={edit === true ? "" : edit.description}
            />
          </Field>
          <fieldset>
            <legend>Bộ môn thành viên được đăng ký</legend>
            <div className="permission-grid">
              {db.sports.map((s) => (
                <label className="check-option" key={s.id}>
                  <input
                    type="checkbox"
                    name="sportIds"
                    value={s.id}
                    defaultChecked={
                      edit !== true && (edit.sportIds?.includes(s.id) ?? true)
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Quyền lợi (mỗi dòng một mục)">
            <textarea
              name="features"
              required
              defaultValue={edit === true ? "" : edit.features.join("\n")}
            />
          </Field>
          <Field label="Trạng thái bán">
            <select
              name="status"
              defaultValue={edit === true ? "ACTIVE" : edit.status || "ACTIVE"}
            >
              <option value="ACTIVE">Đang bán</option>
              <option value="INACTIVE">Ngừng bán</option>
            </select>
          </Field>
          <Notice>
            Ngừng bán không xóa lịch sử/gói đã mua. Thay đổi quyền lợi áp dụng
            cho việc kiểm tra booking tiếp theo trong demo.
          </Notice>
        </FormModal>
      )}
    </>
  );
}

export function StudentsPage() {
  const { session } = useAuth();
  return session?.mode === "api" ? <ApiStudents /> : <LegacyStudentsPage />;
}
function LegacyStudentsPage() {
  const db = useDemoData();
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const students = db
    ? session!.user.roleName === "COACH"
      ? coachMembers(db, session!.user.id)
      : db.users.filter((u) => u.roleName === "MEMBER")
    : [];
  return (
    <>
      <PageHeader
        title="Học viên phụ trách"
        description="Thông tin cơ bản, mục tiêu và trình độ của học viên trong phạm vi lớp/kế hoạch phụ trách."
      />
      {!db && (
        <Notice>
          Backend chưa cung cấp hồ sơ/mục tiêu học viên cho HLV. Không đọc dữ
          liệu demo thay cho hồ sơ thật.
        </Notice>
      )}
      <Panel>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm học viên, mục tiêu..."
        />
        <DataTable
          rows={students.filter((u) =>
            matches(search, u.fullName, u.fitnessGoals, u.email),
          )}
          columns={[
            {
              key: "name",
              label: "Học viên",
              render: (u) => <strong>{u.fullName}</strong>,
            },
            {
              key: "goal",
              label: "Mục tiêu",
              render: (u) => u.fitnessGoals || "Chưa cập nhật",
            },
            {
              key: "level",
              label: "Trình độ",
              render: (u) => u.level || "Chưa cập nhật",
            },
            {
              key: "detail",
              label: "Hồ sơ",
              render: (u) => (
                <Button variant="ghost" onClick={() => setSelected(u)}>
                  Xem hồ sơ
                </Button>
              ),
            },
          ]}
        />
      </Panel>
      {selected && (
        <UserProfileModal user={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

export function NotificationsPage() {
  const { session } = useAuth();
  return session?.mode === "api" && session.user.roleName === "MEMBER" ? (
    <MembershipNotifications />
  ) : session?.mode === "api" ? (
    <ApiNotifications />
  ) : (
    <LegacyNotificationsPage />
  );
}
function LegacyNotificationsPage() {
  const db = useDemoData();
  const { session } = useAuth();
  const can = usePermissions();
  const classes = useClasses();
  const [filter, setFilter] = useState("all");
  const [compose, setCompose] = useState(false);
  const [audience, setAudience] = useState("class");
  const toast = useToast();
  const client = useQueryClient();
  const rows = (db?.notifications || []).filter(
    (n) =>
      n.recipientId === session!.user.id && (filter === "all" || !n.readAt),
  );
  const students = db
    ? session!.user.roleName === "COACH"
      ? coachMembers(db, session!.user.id)
      : db.users.filter((u) => u.roleName === "MEMBER")
    : [];
  return (
    <>
      <PageHeader
        title="Thông báo & bài tập"
        description="Cập nhật lịch, học phí, bài tập và nhận xét dành cho tài khoản của bạn."
        actions={
          can("notifications.send") ? (
            <Button disabled={!db} onClick={() => setCompose(true)}>
              Gửi thông báo / bài tập
            </Button>
          ) : undefined
        }
      />
      {!db && (
        <Notice>
          Chưa có API thông báo. Chức năng gửi/đọc đang hỗ trợ demo local.
        </Notice>
      )}
      <Panel>
        <div className="table-toolbar">
          <Select label="Lọc thông báo" value={filter} onChange={setFilter}>
            <option value="all">Tất cả</option>
            <option value="unread">Chưa đọc</option>
          </Select>
          <Button
            variant="secondary"
            disabled={!db || !rows.length}
            onClick={() => markNotificationsRead()}
          >
            Đánh dấu tất cả đã đọc
          </Button>
        </div>
        {rows.length ? (
          rows.map((n) => (
            <article
              className={`notification-card ${n.readAt ? "" : "unread"}`}
              key={n.id}
            >
              <div>
                <strong>{n.title}</strong>
                <small>{dateLabel(n.createdAt)}</small>
              </div>
              <p>{n.content}</p>
              <Link
                className="text-link"
                to={n.link}
                onClick={() => markNotificationsRead(n.id)}
              >
                Xem nội dung
              </Link>
              {!n.readAt && (
                <Button
                  variant="ghost"
                  onClick={() => markNotificationsRead(n.id)}
                >
                  Đã đọc
                </Button>
              )}
            </article>
          ))
        ) : (
          <Empty
            title="Chưa có thông báo"
            description="Các cập nhật cho bạn sẽ xuất hiện tại đây."
          />
        )}
      </Panel>
      {compose && db && (
        <FormModal
          title="Gửi thông báo hoặc bài tập về nhà"
          onClose={() => setCompose(false)}
          onSubmit={async (d) => {
            sendNotification(
              String(d.get("title")),
              String(d.get("content")),
              audience === "member" ? Number(d.get("memberId")) : undefined,
              audience === "class" ? Number(d.get("classId")) : undefined,
            );
            await client.invalidateQueries();
            toast("Đã gửi thông báo demo đến đúng học viên.");
          }}
        >
          <Field label="Phạm vi gửi">
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="class">Học viên trong lớp</option>
              <option value="member">Một học viên</option>
              {session!.user.roleName !== "COACH" && (
                <option value="all">Tất cả thành viên</option>
              )}
            </select>
          </Field>
          {audience === "class" && (
            <Field label="Lớp nhận thông báo">
              <select name="classId" required defaultValue="">
                <option value="" disabled>
                  Chọn lớp
                </option>
                {classes.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.className}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {audience === "member" && (
            <Field label="Học viên nhận thông báo">
              <select name="memberId" required defaultValue="">
                <option value="" disabled>
                  Chọn học viên
                </option>
                {students.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Tiêu đề">
            <input name="title" required minLength={3} maxLength={150} />
          </Field>
          <Field label="Nội dung / bài tập">
            <textarea
              name="content"
              required
              minLength={5}
              maxLength={4000}
              rows={5}
            />
          </Field>
        </FormModal>
      )}
    </>
  );
}

export function OperationsReport({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const db = useDemoData();
  const classes = useClasses();
  const users = useUsers();
  const classRows = (classes.data || []).filter(
    (c) =>
      c.scheduleTime.slice(0, 10) >= start &&
      c.scheduleTime.slice(0, 10) <= end,
  );
  const query = useQuery({
    queryKey: ["class-booking-report", classRows.map((c) => c.id)],
    queryFn: async () => {
      const batches = await Promise.all(
        classRows.map((c) => api.bookings(undefined, c.id)),
      );
      return batches.flat();
    },
    enabled: !db && classRows.length > 0,
  });
  const bookings = db?.bookings || query.data || [];
  const inPeriod = bookings.filter(
    (b) => b.bookedAt.slice(0, 10) >= start && b.bookedAt.slice(0, 10) <= end,
  );
  const newMembers = (users.data || []).filter(
    (u) =>
      u.roleName === "MEMBER" &&
      u.createdAt &&
      u.createdAt.slice(0, 10) >= start &&
      u.createdAt.slice(0, 10) <= end,
  );
  const rows = classRows.map((c) => ({
    ...c,
    booked: bookings.filter((b) => b.classId === c.id && b.status === "BOOKED")
      .length,
    cancelled: bookings.filter(
      (b) => b.classId === c.id && b.status === "CANCELLED",
    ).length,
  }));
  return (
    <Panel className="panel-spaced"
      title="Thành viên & tình trạng đăng ký lớp"
      description={`Theo khoảng ${dateLabel(start)} – ${dateLabel(end)}`}
    >
      <div className="mini-stats">
        <div>
          <p>Thành viên có ngày tạo trong kỳ</p>
          <strong>
            {users.data?.some((u) => u.roleName === "MEMBER" && !u.createdAt)
              ? "Chưa có dữ liệu"
              : newMembers.length}
          </strong>
        </div>
        <div>
          <p>Lượt đăng ký ghi nhận trong kỳ</p>
          <strong>{inPeriod.length}</strong>
        </div>
        <div>
          <p>Lượt đang BOOKED của các lớp</p>
          <strong>{rows.reduce((a, c) => a + c.booked, 0)}</strong>
        </div>
      </div>
      {users.data?.some((u) => u.roleName === "MEMBER" && !u.createdAt) && (
        <Notice>
          Một số tài khoản chưa có ngày tạo từ API/dữ liệu cũ, không được tính
          vào số thành viên mới theo kỳ.
        </Notice>
      )}
      {query.error && (
        <Notice>
          Không tải được đầy đủ booking theo lớp. Vui lòng thử lại trước khi
          xuất báo cáo.
        </Notice>
      )}
      <DataTable
        rows={rows}
        columns={[
          { key: "name", label: "Lớp", render: (c) => c.className },
          {
            key: "booked",
            label: "Đang đăng ký",
            render: (c) => `${c.booked}/${c.maxCapacity}`,
          },
          { key: "cancel", label: "Đã hủy", render: (c) => c.cancelled },
          {
            key: "rate",
            label: "Tỷ lệ lấp đầy",
            render: (c) => `${Math.round((c.booked / c.maxCapacity) * 100)}%`,
          },
        ]}
      />
      <Button
        variant="secondary"
        disabled={
          !!query.error || (!db && query.isPending && classRows.length > 0)
        }
        onClick={() =>
          downloadCsv("bao-cao-dang-ky-lop.csv", [
            ["Lớp", "BOOKED", "CANCELLED", "Sức chứa"],
            ...rows.map((c) => [
              c.className,
              c.booked,
              c.cancelled,
              c.maxCapacity,
            ]),
          ])
        }
      >
        Xuất báo cáo lớp
      </Button>
    </Panel>
  );
}
