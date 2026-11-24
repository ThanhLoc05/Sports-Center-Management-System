import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCatalog } from "../lib/catalog";
import { useUsers } from "../lib/hooks";
import { trainingApi, weekday } from "../lib/training-api";
import type {
  Availability,
  ProgramKind,
  TrainingProgram,
} from "../lib/training-api";
import { dateLabel, money, timeLabel, localDate } from "../lib/utils";
import { TrainingProgramForm } from "../components/TrainingProgramForm";
import { CourseOrderDetail } from "../components/CourseCheckout";
import { ClassDetail } from "./Classes";
import type { SportClass } from "../lib/types";
import {
  Badge,
  Button,
  Confirm,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Loading,
  Modal,
  Notice,
  PageHeader,
  Panel,
  useToast,
} from "../components/ui";
import "../styles-training.css";

export default function TrainingPrograms({
  kind = "REGULAR",
}: {
  kind?: ProgramKind;
}) {
  const { session } = useAuth(),
    catalog = useCatalog(),
    client = useQueryClient(),
    toast = useToast();
  const [params, setParams] = useSearchParams();
  const member = session!.user.roleName === "MEMBER",
    coach = session!.user.roleName === "COACH";
  const manager = ["CENTER_MANAGER", "MANAGER"].includes(
      session!.user.roleName,
    ),
    course = kind === "COURSE";
  const users = useUsers(true);
  const [memberId, setMemberId] = useState("");
  const selectedMember = member
    ? session!.user.id
    : Number(memberId) || undefined;
  const [sport, setSport] = useState("");
  const [coachId, setCoachId] = useState("");
  const [windows, setWindows] = useState<Availability[]>([]);
  const [day, setDay] = useState("1"),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState("");
  const [form, setForm] = useState<TrainingProgram | "new" | null>(null);
  const [detail, setDetail] = useState<TrainingProgram | null>(null);
  const [register, setRegister] = useState<TrainingProgram | null>(null);
  const [stop, setStop] = useState<TrainingProgram | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SportClass | null>(null);
  const [orderId, setOrderId] = useState(Number(params.get("orderId")) || 0);
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const coaches = useQuery({ queryKey: ["coaches"], queryFn: api.coaches });
  const rights = useQuery({
    queryKey: ["training-access", selectedMember],
    queryFn: () => trainingApi.access(selectedMember),
    enabled: !!selectedMember,
  });
  const search = {
    sportId: Number(sport) || undefined,
    coachId: Number(coachId) || undefined,
    memberId: selectedMember,
    availability: windows,
  };
  const query = useQuery({
    queryKey: ["training-programs", kind, search],
    queryFn: () => trainingApi.search(kind, search),
    enabled: !member || !!sport,
  });
  const sessions = useQuery({
    queryKey: ["program-sessions", kind, detail?.id],
    queryFn: () => trainingApi.sessions(kind, detail!.id),
    enabled: !!detail,
  });
  const refresh = async () => {
    await client.invalidateQueries();
  };
  const actionLabel = course ? "Đăng ký khóa học" : "Đăng ký lịch lớp";
  return (
    <>
      <PageHeader
        eyebrow={course ? "HỌC THEO LỘ TRÌNH" : "LỊCH CỐ ĐỊNH HẰNG TUẦN"}
        title={course ? "Khóa học" : "Lớp học"}
        description={
          course
            ? "Có khai giảng, đủ số buổi và mục tiêu rõ ràng. Gói thành viên cần bao phủ toàn khóa."
            : "Chọn môn yêu thích, tìm lịch phù hợp và giữ chỗ theo thời hạn gói của bạn."
        }
        actions={
          <>
            {manager && (
              <Button onClick={() => setForm("new")}>
                <Plus size={16} />
                {course ? "Tạo khóa học" : "Tạo lớp thường"}
              </Button>
            )}
            <Link
              className="btn btn-secondary"
              to={course ? "/course-orders" : "/bookings"}
            >
              {course ? "Đơn khóa học" : "Lớp đã đăng ký"}
            </Link>
          </>
        }
      />
      <div className="training-tabs">
        <Link className={!course ? "active" : ""} to="/classes">
          Lớp thường
        </Link>
        <Link className={course ? "active" : ""} to="/courses">
          Khóa học
        </Link>
        <Link to="/schedule">Lịch hoạt động</Link>
      </div>
      {!member && !coach && (
        <Panel
          title="Hỗ trợ học viên"
          description="Chọn học viên để xem các lớp/khóa phù hợp với gói của người đó."
        >
          <Field label="Học viên">
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Xem toàn bộ danh mục</option>
              {users.data
                ?.filter(
                  (u) => u.roleName === "MEMBER" && u.status === "ACTIVE",
                )
                .map((u) => (
                  <option value={u.id} key={u.id}>
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
      {selectedMember && (
        <div className="training-rights">
          {rights.isPending ? (
            <Loading />
          ) : rights.error ? (
            <ErrorState error={rights.error} retry={rights.refetch} />
          ) : rights.data?.hasActiveMembership ? (
            <>
              <strong>
                Gói {rights.data.accessLevel} · đến{" "}
                {dateLabel(rights.data.endDate!)}
              </strong>
              <span>
                {rights.data.activeClassCount}/
                {rights.data.maxConcurrentClasses} lớp thường đang đăng ký
              </span>
              <span>
                {rights.data.sportLimit == null
                  ? "Tất cả bộ môn"
                  : `${rights.data.sportLimit} bộ môn/kỳ`}
              </span>
              {!course && (
                <small>
                  Bộ môn được chốt khi đăng ký lớp đầu tiên. Xem danh sách chưa
                  chốt môn.
                </small>
              )}
              {course && (
                <small>
                  Khóa học tính học phí riêng và không chiếm số lớp thường. Ưu
                  đãi gói: {rights.data.courseDiscountPercent}% trên khóa được
                  áp dụng.
                </small>
              )}
            </>
          ) : (
            <Notice>
              Học viên cần gói đã thanh toán và đang có hiệu lực.{" "}
              <Link to="/memberships">Xem gói thành viên</Link>
            </Notice>
          )}
        </div>
      )}
      <Panel
        title="1. Chọn bộ môn"
        description="Danh sách được kiểm tra theo quyền gói, hạn gói, chỗ trống và lịch đã đăng ký."
      >
        {catalog.error ? (
          <ErrorState error={catalog.error} retry={catalog.retry} />
        ) : (
          <div className="training-sport-picker">
            {!member && (
              <Button
                variant={!sport ? "primary" : "secondary"}
                onClick={() => setSport("")}
              >
                Tất cả môn
              </Button>
            )}
            {Object.entries(catalog.sports).map(([id, name]) => (
              <Button
                key={id}
                variant={sport === id ? "primary" : "secondary"}
                onClick={() => setSport(id)}
              >
                {name}
              </Button>
            ))}
          </div>
        )}
      </Panel>
      {(!member || sport) && (
        <Panel
          title="2. Lọc theo lịch rảnh (tùy chọn)"
          description="Một lớp phù hợp khi toàn bộ lịch học hằng tuần nằm trong các khoảng rảnh bạn nhập."
        >
          <div className="training-filter">
            <Field label="Ngày rảnh">
              <select value={day} onChange={(e) => setDay(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option value={d} key={d}>
                    {weekday(d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rảnh từ">
              <input
                type="time"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="Đến">
              <input
                type="time"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={!!from && !!until && from >= until}
              onClick={() =>
                setWindows((old) => [
                  ...old,
                  {
                    dayOfWeek: Number(day),
                    ...(from ? { fromTime: from } : {}),
                    ...(until ? { toTime: until } : {}),
                  },
                ])
              }
            >
              Thêm khoảng rảnh
            </Button>
            <Field label="HLV mong muốn">
              <select
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
              >
                <option value="">Tất cả HLV</option>
                {coaches.data?.map((c) => (
                  <option key={c.coachId} value={c.coachId}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="training-chips">
            {windows.map((w, i) => (
              <button
                key={i}
                onClick={() =>
                  setWindows((old) => old.filter((_, n) => n !== i))
                }
              >
                {weekday(w.dayOfWeek!)} · {w.fromTime || "00:00"}–
                {w.toTime || "23:59"} ×
              </button>
            ))}
            {windows.length > 0 && (
              <Button variant="ghost" onClick={() => setWindows([])}>
                Xóa bộ lọc lịch
              </Button>
            )}
          </div>
        </Panel>
      )}
      {member && !sport ? (
        <Empty
          title="Chọn bộ môn bạn muốn học"
          description="Sau đó bạn sẽ thấy các lớp phù hợp với gói và có thể lọc thêm lịch rảnh."
        />
      ) : query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : !query.data?.length ? (
        <Empty
          title="Chưa có lịch học phù hợp"
          description={
            selectedMember
              ? "Kiểm tra gói đang dùng, lớp đã đăng ký hoặc nới khoảng giờ rảnh. Bạn có thể chọn môn khác để tìm tiếp."
              : "Quản lý có thể tạo lớp thường hoặc khóa học mới."
          }
        />
      ) : (
        <div className="training-program-grid">
          {query.data.map((p) => (
            <article className="panel training-program" key={p.id}>
              <div className="training-card-top">
                <span>
                  {p.sportName} · {p.trainingLevel}
                </span>
                <Badge status={p.status} />
              </div>
              <h2>{p.name}</h2>
              <p>{p.description || "Chưa cập nhật nội dung học."}</p>
              <div className="training-card-facts">
                <span>
                  <CalendarDays size={16} />
                  {p.slots.length} buổi/tuần
                  {course && ` · ${p.totalSessions} buổi`}
                </span>
                <span>
                  <Users size={16} />
                  Còn {p.remainingCapacity}/{p.maxCapacity} chỗ
                </span>
                <span>
                  {p.requiredAccessLevel === "VIP"
                    ? "Dành cho VIP"
                    : "Standard & VIP"}
                </span>
              </div>
              <ul className="training-slot-list">
                {p.slots.map((s) => (
                  <li key={s.dayOfWeek}>
                    <strong>
                      {weekday(s.dayOfWeek)} · {s.startTime.slice(0, 5)}–
                      {s.endTime.slice(0, 5)}
                    </strong>
                    <small>
                      {s.coachName} · {s.roomName}
                    </small>
                  </li>
                ))}
              </ul>
              {course ? (
                <>
                  <p>
                    {dateLabel(p.startDate!)} → {dateLabel(p.endDate!)}
                  </p>
                  <div className="training-price">
                    <strong>{money(p.payableAmount ?? p.price!)}</strong>
                    {p.discountPercent > 0 && (
                      <>
                        <del>{money(p.price!)}</del>
                        <span>Giảm {p.discountPercent}% theo gói</span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p className="muted">
                  {p.registered
                    ? `Đã đăng ký · quyền tham gia đến ${dateLabel(p.registrationUntil!)}`
                    : "Lớp duy trì liên tục · đăng ký có hiệu lực theo gói"}
                </p>
              )}
              <div className="row-actions">
                <Button variant="secondary" onClick={() => setDetail(p)}>
                  Xem chi tiết
                </Button>
                {selectedMember && !p.registered && (
                  <Button
                    disabled={!p.eligible}
                    title={p.eligibilityReason}
                    onClick={() => { setPaymentKey(crypto.randomUUID()); setRegister(p); }}
                  >
                    {actionLabel}
                  </Button>
                )}
                {p.registered && (
                  <Link to={course ? "/course-orders" : "/bookings"}>
                    Xem đăng ký
                  </Link>
                )}
                {manager && (
                  <>
                    <Button variant="ghost" onClick={() => setForm(p)}>
                      Sửa
                    </Button>
                    {p.status !== "CANCELLED" && (
                      <Button variant="ghost" onClick={() => setStop(p)}>
                        {!course && p.status === "PAUSED"
                          ? "Mở lại"
                          : "Ngừng nhận lớp"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {form && (
        <TrainingProgramForm
          kind={kind}
          item={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
        />
      )}
      {register &&
        (course ? (
          <FormModal
            title={`Đăng ký ${register.name}`}
            submitLabel="Tạo đơn khóa học"
            onClose={() => setRegister(null)}
            onSubmit={async (data) => {
              const order = await trainingApi.createOrder(
                register.id,
                String(data.get("paymentMethod")),
                selectedMember,
                paymentKey +
                  ":" +
                  register.id +
                  ":" +
                  String(data.get("paymentMethod")),
              );
              await refresh();
              setOrderId(order.id);
            }}
          >
            <p>
              Học phí sau ưu đãi:{" "}
              <strong>{money(register.payableAmount!)}</strong>
            </p>
            <p>
              Khóa: {dateLabel(register.startDate!)} →{" "}
              {dateLabel(register.endDate!)}
            </p>
            <Field label="Thanh toán">
              <select name="paymentMethod">
                <option value="BANK_TRANSFER">QR chuyển khoản</option>
                <option value="CASH">Tiền mặt tại quầy</option>
              </select>
            </Field>
            <Notice>
              Hệ thống kiểm tra lại hạn gói và chỗ trống khi tạo đơn và khi xác
              nhận thanh toán.
            </Notice>
          </FormModal>
        ) : (
          <Confirm
            title={`Đăng ký ${register.name}?`}
            description={`Giữ chỗ toàn bộ lịch hằng tuần đến ${dateLabel(rights.data?.endDate || "")}. Lớp này dùng 1 suất lớp thường của gói.`}
            onClose={() => setRegister(null)}
            onConfirm={async () => {
              await trainingApi.register(register.id, selectedMember);
              await refresh();
              setRegister(null);
              toast("Đã đăng ký lớp. Xem các buổi trong lịch cá nhân.");
            }}
          />
        ))}
      {stop && (
        <Confirm
          title={
            course
              ? "Hủy toàn khóa học?"
              : stop.status === "PAUSED"
                ? "Mở lại lớp?"
                : "Tạm ngừng lớp?"
          }
          description={
            course
              ? "Các buổi tương lai bị hủy. Đơn đã thu cần được lễ tân xử lý học phí."
              : stop.status === "PAUSED"
                ? "Hệ thống kiểm tra lại lịch phòng và HLV. Học viên cần đăng ký lại."
                : "Các đăng ký hiện tại và buổi tương lai sẽ dừng; lịch sử được giữ lại."
          }
          onClose={() => setStop(null)}
          onConfirm={async () => {
            if (course) await trainingApi.cancelCourse(stop.id);
            else
              await trainingApi.status(
                stop.id,
                stop.status === "PAUSED" ? "ACTIVE" : "PAUSED",
              );
            await refresh();
            setStop(null);
          }}
        />
      )}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)} wide>
          <p>{detail.description}</p>
          <Notice>
            {course
              ? `${detail.totalSessions} buổi · ${dateLabel(detail.startDate!)} đến ${dateLabel(detail.endDate!)}`
              : "Lịch tuần duy trì liên tục. Danh sách bên dưới là các buổi cụ thể đã được lên lịch."}
          </Notice>
          {sessions.isPending ? (
            <Loading />
          ) : sessions.error ? (
            <ErrorState error={sessions.error} retry={sessions.refetch} />
          ) : (
            <div className="training-sessions">
              {sessions.data
                ?.filter(
                  (s) =>
                    s.scheduleTime.slice(0, 10) >=
                    localDate(),
                )
                .map((s) => (
                  <button key={s.id} onClick={() => setSessionDetail(s)}>
                    <span>
                      {dateLabel(s.scheduleTime)} · {timeLabel(s.scheduleTime)}
                    </span>
                    <Badge status={s.status} />
                    <small>Xem buổi học</small>
                  </button>
                ))}
            </div>
          )}
        </Modal>
      )}
      {sessionDetail && (
        <ClassDetail
          item={sessionDetail}
          onClose={() => setSessionDetail(null)}
        />
      )}
      {orderId > 0 && (
        <CourseOrderDetail
          orderId={orderId}
          onClose={() => {
            setOrderId(0);
            if (params.has("orderId")) {
              params.delete("orderId");
              setParams(params, { replace: true });
            }
          }}
        />
      )}
    </>
  );
}
