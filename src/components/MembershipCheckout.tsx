// [VAI TRÒ] Đăng ký/gia hạn gói + chi tiết đơn/hóa đơn. MEMBER: chọn gói, xem QR, yêu cầu hoàn. LỄ TÂN: thu tiền mặt, hủy đơn, ghi nhận hoàn tiền.
/** Luồng mới: yêu cầu + hóa đơn chờ → thu tiền → backend xác nhận → gói có hiệu lực.
 * Quét QR, mở hóa đơn hoặc bấm chuyển trang không được gọi gia hạn hay tự đặt PAID. */
import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { usePermissions, useUsers } from "../lib/hooks";
import { membershipCheckout } from "../lib/membership-checkout";
import type {
  MembershipOffer,
  MembershipOrder,
  MembershipOrderInput,
  PaymentMethod,
} from "../lib/membership-checkout";
import type { Subscription } from "../lib/types";
import { dateLabel, errorText, idLabel, localDate, matches, money, timeLabel } from "../lib/utils";
import { Search } from "lucide-react";
import "../styles-membership-members.css";
import { ApiNotificationInbox } from "./ApiNotifications";
import { MembershipDelivery, TransferVerification } from "./MembershipDelivery";
import { usePaymentMember } from "../lib/use-payment-member";
import { MemberRefundAction } from "./RefundRequests";
import { RefundForm, RefundReceipt } from "./RefundForm";
import { PaymentQr } from "./PaymentQr";
import { MembershipBenefits } from "./MembershipBenefits";
import { MembershipPlanCompare } from "./MembershipPlanCompare";
import {
  Badge,
  MembershipStatus,
  Button,
  Confirm,
  DataTable,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Loading,
  MemberField,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  useToast,
} from "./ui";

// Chọn lời xác nhận theo đơn mua mới, gia hạn cùng gói hoặc đổi gói cho kỳ tiếp theo.
const orderAction = (order: MembershipOrder) =>
  order.kind === "NEW"
    ? "đăng ký gói mới"
    : order.sourcePackageId === order.package.id
      ? "gia hạn gói hiện tại"
      : "gia hạn với gói mới";
const orderStatus = {
  PENDING_PAYMENT: "Chờ thanh toán / xác nhận",
  CONFIRMED: "Hoàn thành",
  CANCELLED: "Đã hủy yêu cầu",
  REFUNDED: "Đã hoàn tiền",
};
const methodName = (method: string) =>
  method === "CASH" ? "Tiền mặt tại quầy" : "Chuyển khoản QR";
/**
 * Cái gì: dải 3 bước hiển thị tiến trình một đơn gói tập.
 * Làm sao: bước hoàn tất = done, bước hiện tại = current (aria-current="step"); CANCELLED/REFUNDED thay bước cuối bằng nhãn kết thúc.
 * Tại sao: chỉ là lớp trình bày cho trạng thái BE trả về, không thay đổi quy tắc thanh toán.
 */
function OrderSteps({ status, method }: { status: keyof typeof orderStatus; method: string }) {
  const paid = status === "CONFIRMED" || status === "REFUNDED";
  const last =
    status === "CANCELLED" ? "Đã hủy đơn" : status === "REFUNDED" ? "Đã hoàn tiền" : "Kích hoạt gói";
  const steps = [
    { label: "Tạo đơn", state: "done" },
    {
      label: method === "CASH" ? "Thu tiền mặt" : "Chuyển khoản QR",
      state: paid ? "done" : status === "PENDING_PAYMENT" ? "current" : "skipped",
    },
    {
      label: last,
      state: status === "CONFIRMED" ? "done" : status === "PENDING_PAYMENT" ? "todo" : "end",
    },
  ];
  return (
    <ol className="order-steps membership-order-full" aria-label="Tiến trình đơn">
      {steps.map((step) => (
        <li
          key={step.label}
          className={`order-step is-${step.state}`}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className="order-step-dot" aria-hidden="true" />
          {step.label}
        </li>
      ))}
    </ol>
  );
}
/** Tên chủ đơn lấy theo memberId, không nhầm với nhân viên thu tiền đang đăng nhập. */
function OrderMemberLabel({ order }: { order: MembershipOrder }) {
  // [API] usePaymentMember() (hook trong lib/use-payment-member.ts) → api.user → GET /users/{id}
  const member = usePaymentMember(order.memberId, order.memberName);
  return (
    <small>
      {member.name ? member.name + " · " : ""}TV{order.memberId} · HĐ
      {order.invoice.id}
    </small>
  );
}
const positiveId = (text: string | null) =>
  text &&
  /^\d+$/.test(text) &&
  Number.isSafeInteger(Number(text)) &&
  Number(text) > 0
    ? Number(text)
    : undefined;
// Danh sách đơn tải lại mỗi 10 giây; khi API lỗi thì dừng polling để người dùng chủ động thử lại.
const pendingInterval = (query: { state: { error: unknown } }) =>
  query.state.error ? false : 10000;

/** Khi đơn đã xác nhận/hoàn tiền, làm mới cache gói và hóa đơn để các màn liên quan đọc lại từ BE. */
function useConfirmedMemberships(orders?: MembershipOrder[]) {
  const client = useQueryClient();
  const refreshed = useRef(new Set<string>());
  useEffect(() => {
    for (const order of orders || []) {
      if (!["CONFIRMED", "REFUNDED"].includes(order.status)) continue;
      const key = `${order.id}:${order.status}`;
      if (refreshed.current.has(key)) continue;
      refreshed.current.add(key);
      // Trạng thái đơn thay đổi phải tải lại quyền thành viên từ backend.
      void client.invalidateQueries({
        queryKey: ["activeSubscription", order.memberId],
      });
      void client.invalidateQueries({
        queryKey: ["subscriptions", order.memberId],
      });
      void client.invalidateQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === "invoices" &&
          (!queryKey[1] || Number(queryKey[1]) === order.memberId),
      });
    }
  }, [orders, client]);
}

/** Trang chọn gói: tải danh mục và lịch sử thật, xác định gói hiện tại rồi mở form mua/gia hạn. */
export function MembershipCheckoutPage() {
  const { session } = useAuth();
  const member = session!.user.roleName === "MEMBER";
  const [params] = useSearchParams();
  const [memberId, setMemberId] = useState(
    member ? String(session!.user.id) : params.get("memberId") || "",
  );
  const selected = positiveId(memberId);
  // [API] useUsers() (hook trong lib/hooks.ts) → api.users → GET /users
  const users = useUsers(true);
  const [memberSearchInput, setMemberSearchInput] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const memberCode = memberSearch.trim().match(/^(?:TV\s*)?(\d+)$/i);
  // Danh sách chỉ lấy MEMBER từ API thật; tìm mã chính xác, tên gần đúng có hỗ trợ không dấu.
  const memberRows = (users.data || []).filter((user) => user.roleName === "MEMBER")
    .filter((user) => memberCode ? user.id === Number(memberCode[1]) : matches(memberSearch, user.fullName));
  const selectedMember = users.data?.find((user) => user.id === selected && user.roleName === "MEMBER");
  const packages = useQuery({
    queryKey: ["membership-packages"],
    // [FLOW 3] LẤY API: GET /membership-packages - danh sách gói đang bán để lễ tân chọn.
    queryFn: membershipCheckout.packages,
    retry: false,
  });
  const subscriptions = useQuery({
    queryKey: ["subscriptions", selected],
    // [FLOW 3] LẤY API: lịch sử gói của thành viên đang chọn (để biết đăng ký mới hay gia hạn).
    queryFn: () => api.subscriptions(selected!),
    enabled: !!selected,
  });
  const [draft, setDraft] = useState<{
    source?: Subscription;
    offer?: MembershipOffer;
  } | null>(null);
  // Chỉ cho tạo yêu cầu từ lịch sử đã tải xong; tránh gia hạn nhầm gói khi dữ liệu còn đang đổi.
  const historyReady =
    !subscriptions.isPending &&
    !subscriptions.isFetching &&
    !subscriptions.error;
  const active = subscriptions.data?.find(
    (s) =>
      s.status === "ACTIVE" &&
      s.startDate <= localDate() &&
      s.endDate >= localDate(),
  );
  return (
    <>
      <PageHeader
        title="Gói thành viên"
        description="Chọn gói, thanh toán và theo dõi xác nhận. Gói hiện tại chỉ thay đổi khi yêu cầu được duyệt."
        actions={
          // [NÚT] NÚT "Gia hạn gói tập / Đăng ký gói tập" → mở/đóng hộp thoại hoặc form (setDraft)
          <Button
            disabled={!selected || !historyReady}
            onClick={() => setDraft({ source: active })}
          >
            {active ? "Gia hạn gói tập" : "Đăng ký gói tập"}
          </Button>
        }
      />
      {!member && (
        <Panel className="panel-spaced" title="Thành viên cần hỗ trợ">
          {/* Tách tìm và chọn để lễ tân xem danh sách đầy đủ trước khi mở gói của đúng người. */}
          <form className="membership-member-search" onSubmit={(event) => {
            event.preventDefault(); setMemberSearch(memberSearchInput);
          }}>
            <SearchInput label="Tìm thành viên xem gói" placeholder="Nhập ID, mã TV hoặc tên thành viên..."
              value={memberSearchInput} onChange={(value) => {
                // Lọc ngay khi gõ để lễ tân thấy gợi ý tức thì; danh sách đã tải sẵn nên không gọi thêm API.
                setMemberSearchInput(value); setMemberSearch(value);
              }} />
            {/* [NÚT] NÚT "Tìm kiếm" → gửi form (xử lý ở onSubmit của form chứa nút) */}
            <Button type="submit" variant="secondary"><Search size={16} />Tìm kiếm</Button>
            {/* [NÚT] NÚT "Xem tất cả" → mở/đóng hộp thoại hoặc form (setMemberSearchInput) */}
            {memberSearch && <Button type="button" variant="ghost" onClick={() => {
              setMemberSearchInput(""); setMemberSearch("");
            }}>Xem tất cả</Button>}
          </form>
          {selectedMember && <Notice>Đang xem gói của {idLabel(selectedMember.id)} · {selectedMember.fullName}.</Notice>}
          {users.isPending ? <Loading /> : users.error ? <ErrorState error={users.error} retry={users.refetch} /> : (
            <DataTable rows={memberRows} label="Danh sách thành viên xem gói" columns={[
              { key: "id", label: "Mã thành viên", render: (user) => idLabel(user.id) },
              { key: "name", label: "Họ tên", render: (user) => <strong>{user.fullName}</strong> },
              { key: "contact", label: "Liên hệ", render: (user) => (
                <div className="contact-cell"><span>{user.email}</span><small>{user.phone || "—"}</small></div>
              ) },
              { key: "status", label: "Trạng thái", render: (user) => <Badge status={user.status} /> },
              { key: "select", label: "Thao tác", render: (user) => (
                // [NÚT] NÚT "Đang xem / Xem gói" → đổi cách hiển thị / bộ lọc trên màn hình (setMemberId)
                <Button variant={selected === user.id ? "primary" : "secondary"}
                  aria-label={`Xem gói của ${user.fullName}, ${idLabel(user.id)}`}
                  onClick={() => { setMemberId(String(user.id)); setDraft(null); }}>
                  {selected === user.id ? "Đang xem" : "Xem gói"}
                </Button>
              ) },
            ]} />
          )}
        </Panel>
      )}
      {subscriptions.isFetching && selected && <Loading />}
      {subscriptions.error && (
        <ErrorState error={subscriptions.error} retry={subscriptions.refetch} />
      )}
      {active && (
        <Panel className="panel-spaced"
          title={
            packages.data?.find((p) => p.id === active.packageId)?.name ||
            "Gói hiện tại #" + active.packageId
          }
        >
          <p>
            {dateLabel(active.startDate)} – {dateLabel(active.endDate)} ·{" "}
            <MembershipStatus status="ACTIVE" endDate={active.endDate} />
          </p>
          <Notice>
            Yêu cầu gia hạn chưa thanh toán không làm mất thời hạn của gói đang
            dùng.
          </Notice>
        </Panel>
      )}
      <Panel
        title="Chọn gói tập"
        description="So sánh bộ môn, số lớp được đăng ký, ưu đãi và thời hạn trước khi chọn gói."
      >
        {packages.isPending ? (
          <Loading />
        ) : packages.error ? (
          <ErrorState error={packages.error} retry={packages.refetch} />
        ) : packages.data?.some((p) => p.accessLevel === "STANDARD" || p.accessLevel === "VIP") ? (
          // Nhóm gói theo cấp STANDARD / VIP, giữ từng lựa chọn từ danh mục đang bán.
          <MembershipPlanCompare
            offers={packages.data}
            disabled={!selected || !historyReady}
            activePackageId={active?.packageId}
            onChoose={(pkg) => setDraft({ source: active, offer: pkg })}
          />
        ) : packages.data?.length ? (
          <div className="pricing-grid">
            {packages.data.map((pkg) => (
              <article className="pricing-card" key={pkg.id}>
                <div className="membership-package-heading">
                  <h3>{pkg.name}</h3>
                  {pkg.accessLevel && <span>{pkg.accessLevel}</span>}
                </div>
                <p>{pkg.description}</p>
                <div className="pricing-price">
                  <strong>{money(pkg.price)}</strong>
                  <span>/ {pkg.durationDays} ngày</span>
                </div>
                <MembershipBenefits value={pkg} />
                {pkg.demoPayment && (
                  <Notice>
                    Demo chuyển khoản: thực trả {money(pkg.payableAmount!)}. Giá
                    gói phía trên là giá niêm yết.
                  </Notice>
                )}
                {/* [NÚT] NÚT "Gia hạn gói hiện tại / Gia hạn với gói mới / Chọn gói tập" → mở/đóng hộp thoại hoặc form (setDraft) */}
                <Button
                  disabled={!selected || !historyReady}
                  onClick={() => setDraft({ source: active, offer: pkg })}
                >
                  {active
                    ? active.packageId === pkg.id
                      ? "Gia hạn gói hiện tại"
                      : "Gia hạn với gói mới"
                    : "Chọn gói tập"}
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Chưa có gói mở bán"
            description="Vui lòng liên hệ lễ tân."
          />
        )}
      </Panel>
      {selected && <MembershipOrders memberId={selected} />}
      <Panel
        title="Lịch sử đăng ký gói"
        description="Chỉ hiển thị gói đã được backend ghi nhận."
      >
        {!selected ? (
          <p>Chọn thành viên để xem lịch sử.</p>
        ) : (
          <DataTable
            rows={subscriptions.data || []}
            columns={[
              { key: "id", label: "Mã đăng ký", render: (s) => "GĐK" + s.id },
              {
                key: "package",
                label: "Gói",
                render: (s) =>
                  packages.data?.find((p) => p.id === s.packageId)?.name ||
                  "Gói #" + s.packageId,
              },
              {
                key: "dates",
                label: "Thời hạn",
                render: (s) =>
                  dateLabel(s.startDate) + " – " + dateLabel(s.endDate),
              },
              {
                key: "status",
                label: "Trạng thái",
                render: (s) => (
                  <MembershipStatus status={s.status} endDate={s.endDate} />
                ),
              },
              {
                key: "renew",
                label: "Thao tác",
                render: (s) => (
                  // [NÚT] NÚT "Gia hạn" → mở/đóng hộp thoại hoặc form (setDraft)
                  <Button
                    variant="secondary"
                    disabled={
                      !historyReady ||
                      !["ACTIVE", "EXPIRED"].includes(s.status) ||
                      (!!active && active.id !== s.id)
                    }
                    onClick={() => setDraft({ source: s })}
                  >
                    Gia hạn
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Panel>
      {draft && (
        <MembershipOrderForm
          memberId={selected!}
          source={
            subscriptions.data?.find((s) => s.id === draft.source?.id) ||
            draft.source
          }
          offer={draft.offer}
          users={users.data || []}
          historyReady={
            historyReady &&
            (!draft.source ||
              !!subscriptions.data?.some((s) => s.id === draft.source!.id))
          }
          onClose={() => setDraft(null)}
        />
      )}
    </>
  );
}

/** Form gom Member + gói + phương thức; lưu đơn chờ rồi điều hướng sang hóa đơn để thanh toán. */
export function MembershipOrderForm({
  memberId,
  source,
  offer,
  users = [],
  historyReady = true,
  onClose,
}: {
  memberId: number;
  source?: Subscription;
  offer?: MembershipOffer;
  users?: import("../lib/types").User[];
  historyReady?: boolean;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const packages = useQuery({
    queryKey: ["membership-packages"],
    // [FLOW 3] LẤY API: GET /membership-packages - danh sách gói trong form đăng ký/gia hạn.
    queryFn: membershipCheckout.packages,
    retry: false,
  });
  const [packageId, setPackageId] = useState(
    offer?.id || source?.packageId || 0,
  );
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const selected = packages.data?.find((p) => p.id === packageId);
  const standard = selected?.accessLevel === "STANDARD";
  const [sportId, setSportId] = useState(source?.selectedSportId ?? 0);
  const sports = useQuery({ queryKey: ["sports"], queryFn: api.sports, enabled: standard });
  // Cùng nội dung + thử lại sau lỗi mạng dùng lại key; thay lựa chọn tạo key mới.
  const attempt = useRef({ fingerprint: "", key: "" });
  return (
    // [NÚT] FORM "Yêu cầu gia hạn gói tập, nút "Tiếp tục đến thanh toán"" → gọi API membershipCheckout.create → POST /membership-orders
    <FormModal
      className="membership-checkout-dialog"
      description="Chọn gói và phương thức thanh toán để tạo hóa đơn."
      title={source ? "Yêu cầu gia hạn gói tập" : "Yêu cầu đăng ký gói tập"}
      submitLabel="Tiếp tục đến thanh toán"
      submitDisabled={
        !selected ||
        (standard && (!sportId || !sports.isSuccess)) ||
        packages.isPending ||
        !!packages.error ||
        (!!source &&
          (!historyReady || !["ACTIVE", "EXPIRED"].includes(source.status)))
      }
      onClose={onClose}
      onSubmit={async (data) => {
        // Không gia hạn từ lịch sử cache khi đang tải lại hoặc API đã lỗi.
        if (
          source &&
          (!historyReady || !["ACTIVE", "EXPIRED"].includes(source.status))
        )
          throw Error("Chưa có dữ liệu hợp lệ để gia hạn gói này.");
        if (!selected)
          throw Error("Chọn gói có giá từ trung tâm trước khi tiếp tục.");
        const target =
          session!.user.roleName === "MEMBER"
            ? session!.user.id
            : Number(data.get("memberId"));
        if (source && source.memberId !== target)
          throw Error("Gói cũ không thuộc thành viên đã chọn.");
        // Chỉ gửi mã gói/phương thức và gói cũ nếu gia hạn; số tiền phải do BE tính, không lấy từ form.
        const input: MembershipOrderInput = {
          memberId: target,
          packageId: selected.id,
          paymentMethod: method,
          ...(standard ? { selectedSportId: sportId } : {}),
          ...(source ? { sourceSubscriptionId: source.id } : {}),
        };
        const fingerprint = JSON.stringify(input);
        if (attempt.current.fingerprint !== fingerprint)
          attempt.current = { fingerprint, key: crypto.randomUUID() };
        // [FLOW 3] GỌI API TẠO ĐƠN: POST /membership-orders - tạo đơn chờ + hóa đơn PENDING (điểm bắt đầu Flow 3).
        const order = await membershipCheckout.create(
          input,
          attempt.current.key,
        );
        await client.invalidateQueries({ queryKey: ["membership-orders"] });
        toast(
          order.status === "CONFIRMED"
            ? "Yêu cầu đã được xác nhận. Đang mở hóa đơn."
            : "Đã tạo yêu cầu chờ thanh toán. Gói hiện tại chưa thay đổi.",
        );
        // Hai mã trên URL giúp trang Thanh toán mở đúng đơn vừa tạo, không phải tự tìm lại trong bảng.
        navigate(`/payments?memberId=${order.memberId}&orderId=${order.id}`);
      }}
    >
      {/* Tách thông tin nhập và tóm tắt để người dùng kiểm tra gói/số tiền trước khi tạo đơn. */}
      <section className="membership-checkout-card membership-checkout-fields" aria-label="Thông tin yêu cầu">
        <h3>Thông tin yêu cầu</h3>
        <MemberField
          users={users}
          defaultValue={memberId}
          selfOnly={session!.user.roleName === "MEMBER" || !!source}
        />
        {packages.isPending && <Loading />}
        {packages.error && (
          <ErrorState error={packages.error} retry={packages.refetch} />
        )}
        <Field label="Gói muốn sử dụng">
          <select
            value={packageId || ""}
            required
            onChange={(e) => setPackageId(Number(e.target.value))}
          >
            <option value="">Chọn gói tập</option>
            {packages.data?.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {money(p.price)} / {p.durationDays} ngày
              </option>
            ))}
          </select>
        </Field>
        {standard && (
          <Field label="Bộ môn của kỳ STANDARD">
            <select required value={sportId || ""} onChange={(e) => setSportId(Number(e.target.value))}>
              <option value="">Chọn một bộ môn</option>
              {sports.data?.map((sport) => <option key={sport.id} value={sport.id}>{sport.name}</option>)}
            </select>
          </Field>
        )}
        {standard && sports.error && <ErrorState error={sports.error} retry={sports.refetch} />}
        {standard && <Notice>Tập không giới hạn ở bộ môn đã chọn. Gói không bao gồm khăn và nước.</Notice>}
        {selected?.accessLevel === "VIP" && <Notice>Tập không giới hạn ở mọi bộ môn. Bao gồm khăn và nước.</Notice>}
        <Field label="Phương thức thanh toán">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            <option value="CASH">Tiền mặt tại quầy</option>
            <option value="BANK_TRANSFER">Chuyển khoản QR</option>
          </select>
        </Field>
      </section>
      <section className="membership-checkout-card membership-checkout-summary" aria-label="Tóm tắt yêu cầu">
        <h3>Tóm tắt yêu cầu</h3>
        {selected ? (
          <>
            <div className="membership-checkout-package">
              <strong>{selected.name}</strong>
              <span>
                {source
                  ? source.packageId === selected.id
                    ? "Gia hạn gói hiện tại"
                    : "Gia hạn với gói mới"
                  : "Đăng ký gói mới"}
              </span>
            </div>
            <dl className="membership-checkout-facts">
              <div>
                <dt>Thời hạn gói</dt>
                <dd>{selected.durationDays} ngày</dd>
              </div>
              {method === "BANK_TRANSFER" && selected.demoPayment && (
                <div>
                  <dt>Giá niêm yết</dt>
                  <dd>{money(selected.price)}</dd>
                </div>
              )}
            </dl>
            <MembershipBenefits value={selected} />
            {selected.description && <p>{selected.description}</p>}
            <div className="membership-checkout-total">
              <span>Tổng tiền thanh toán</span>
              <strong>
                {money(
                  method === "BANK_TRANSFER" && selected.demoPayment
                    ? selected.payableAmount!
                    : selected.price,
                )}
              </strong>
            </div>
            {method === "BANK_TRANSFER" && selected.demoPayment && (
              <div className="membership-checkout-demo">
                <span>Demo chuyển khoản</span>
                <p>
                  Hóa đơn và QR sử dụng số tiền demo ở trên. Chỉ chuyển đúng
                  số tiền được ghi trên hóa đơn.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="membership-checkout-empty">
            Chọn gói tập để xem thời hạn và số tiền cần thanh toán.
          </p>
        )}
      </section>
      <div className="membership-checkout-help">
        <Notice>
          {method === "CASH"
            ? "Lễ tân nhận yêu cầu và chỉ xác nhận gói sau khi nhận đủ tiền mặt."
            : "Hóa đơn sẽ hiển thị QR, đúng số tiền và mã chuyển khoản kèm mã thành viên. Quét QR không tự xác nhận đã nhận tiền."}
        </Notice>
      </div>
    </FormModal>
  );
}

/** Lễ tân và member đọc cùng bản ghi trên server. Poll chỉ tải trạng thái, không xác nhận giao dịch. */
export function MembershipOrders({
  memberId,
  paymentPage = false,
}: {
  memberId?: number;
  paymentPage?: boolean;
}) {
  const { session } = useAuth();
  const can = usePermissions();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  // Member luôn xem chính mình; memberId truyền vào dành cho nhân viên hỗ trợ tại quầy.
  const effectiveMember =
    session!.user.roleName === "MEMBER" ? session!.user.id : memberId;
  const query = useQuery({
    queryKey: ["membership-orders", effectiveMember],
    // [FLOW 3] LẤY API: GET /membership-orders?memberId= - danh sách đơn gói cho lễ tân/quản lý.
    queryFn: () => membershipCheckout.list(effectiveMember),
    retry: false,
    refetchInterval: pendingInterval,
  });
  useConfirmedMemberships(query.error ? undefined : query.data);
  // Link từ checkout ưu tiên mở orderId trên URL; bấm trong bảng thì dùng đơn đang chọn ở state.
  const fromUrl = paymentPage ? positiveId(params.get("orderId")) : undefined;
  const detailId = fromUrl || selected;
  // Lọc bảng trên dữ liệu đã tải, không thay trạng thái đơn trong SQL.
  const rows = (query.data || []).filter(
    (o) =>
      (can("payments.collect") || o.memberId === session!.user.id) &&
      (methodFilter === "ALL" || o.invoice.paymentMethod === methodFilter) &&
      (statusFilter === "ALL" || o.status === statusFilter) &&
      matches(search, o.memberName, o.id, o.memberId, o.invoice.id,
        o.paymentReference, o.package.name, `TV${o.memberId}`, `HD${o.invoice.id}`),
  );
  return (
    <Panel
      className="membership-orders-panel"
      title={
        can("payments.collect")
          ? "Yêu cầu đăng ký / gia hạn cần xử lý"
          : "Yêu cầu đăng ký / gia hạn của tôi"
      }
      description="Chờ thanh toán → xác nhận thu tiền → kích hoạt gói."
    >
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        <>
          <div className="form-grid">
            <Field label="Lọc phương thức thanh toán">
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
              >
                <option value="ALL">Tất cả phương thức</option>
                <option value="CASH">Tiền mặt</option>
                <option value="BANK_TRANSFER">Chuyển khoản QR</option>
              </select>
            </Field>
            <Field label="Lọc trạng thái đơn">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="PENDING_PAYMENT">Chờ thanh toán</option>
                <option value="CONFIRMED">Hoàn thành</option>
                <option value="CANCELLED">Đã hủy</option>
                <option value="REFUNDED">Đã hoàn tiền</option>
              </select>
            </Field>
          </div>
          <p className="muted">
            Đơn tiền mặt do lễ tân xác nhận sau khi nhận tiền. Đơn QR chờ kết
            quả đối soát từ hệ thống.
          </p>
          {/* [NÚT] NÚT "Tải lại danh sách đơn" → tải lại dữ liệu từ API */}
          <Button
            variant="secondary"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Tải lại danh sách đơn
          </Button>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm tên thành viên, mã hóa đơn, mã thanh toán, gói tập..."
          />
          <DataTable
            key={`${search}:${methodFilter}:${statusFilter}`}
            rows={rows}
            columns={[
              {
                key: "reference",
                label: "Mã thanh toán / thành viên",
                render: (o) => (
                  <>
                    <strong>{o.paymentReference}</strong>
                    <OrderMemberLabel order={o} />
                  </>
                ),
              },
              {
                key: "package",
                label: "Yêu cầu",
                render: (o) => (
                  <>
                    {o.kind === "RENEWAL" ? "Gia hạn: " : "Đăng ký: "}
                    {o.package.name}
                  </>
                ),
              },
              {
                key: "amount",
                label: "Số tiền",
                render: (o) => money(o.invoice.amount),
              },
              {
                key: "method",
                label: "Phương thức",
                render: (o) => methodName(o.invoice.paymentMethod),
              },
              {
                key: "status",
                label: "Trạng thái",
                render: (o) => (
                  <span className={`payment-status ${o.status === "PENDING_PAYMENT" ? "status-unpaid" : o.status === "CONFIRMED" ? "status-paid" : o.status === "REFUNDED" ? "badge-refunded" : ""}`}>
                    {o.status === "CONFIRMED" && o.invoice.refundRequestedAt ? "Chờ xử lý hoàn tiền" : orderStatus[o.status]}
                  </span>
                ),
              },
              {
                key: "view",
                label: "Thao tác",
                // [FLOW 3] NÚT "Chi tiết hóa đơn" trong danh sách đơn: mở hộp thoại chi tiết đơn/hóa đơn (MembershipOrderDetail bên dưới).
                render: (o) => (
                  <Button variant="secondary" onClick={() => setSelected(o.id)}>
                    Chi tiết hóa đơn
                  </Button>
                ),
              },
            ]}
          />
        </>
      )}
      {detailId && (
        <MembershipOrderDetail
          key={detailId}
          orderId={detailId}
          onClose={() => {
            setSelected(undefined);
            if (fromUrl)
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("orderId");
                  return next;
                },
                { replace: true },
              );
          }}
        />
      )}
    </Panel>
  );
}

/** Chi tiết đơn dùng chung cho Member/nhân viên: đọc kết quả BE, hiển thị QR hoặc form tiền mặt và vùng in hóa đơn. */
// [FLOW 3] HỘP THOẠI CHI TIẾT ĐƠN GÓI: nơi chứa toàn bộ nút của luồng thanh toán (QR, thu tiền mặt, hủy, in, hoàn tiền).
export function MembershipOrderDetail({
  orderId,
  onClose,
}: {
  orderId: number;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const can = usePermissions();
  const client = useQueryClient();
  const toast = useToast();
  // Liên kết nút xác nhận ở footer với form nhận tiền bằng thuộc tính form/id của HTML.
  const cashFormId = useId();
  const query = useQuery({
    queryKey: ["membership-order", orderId],
    // [FLOW 3] LẤY API: GET /membership-orders/{id} - chi tiết đơn + hóa đơn (trạng thái, số tiền, QR).
    queryFn: () => membershipCheckout.detail(orderId),
    retry: false,
    // Chi tiết đơn tải mỗi 8 giây khi còn chờ tiền/thông báo; hoàn tất hoặc lỗi thì ngừng polling.
    // Theo dõi trạng thái thật của đơn và thông báo trong website.
    // [FLOW 3] TỰ TẢI LẠI TRẠNG THÁI: khi đơn còn chờ, FE gọi lại GET /membership-orders/{id} định kỳ để thấy đơn QR đã được SePay đối soát.
    refetchInterval: (q) =>
      q.state.error
        ? false
        : q.state.data?.status === "PENDING_PAYMENT" ||
            (q.state.data?.status === "CONFIRMED" && !!q.state.data.invoice.refundRequestedAt) ||
            q.state.data?.delivery?.notification?.status === "PENDING"
          ? 8000
          : false,
  });
  const order = query.data;
  // [API] usePaymentMember() (hook trong lib/use-payment-member.ts) → api.user → GET /users/{id}
  const member = usePaymentMember(order?.memberId, order?.memberName);
  useConfirmedMemberships(query.error || !order ? undefined : [order]);
  const owner =
    order && (order.memberId === session!.user.id || can("payments.collect"));
  const [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const confirmKey = useRef({ fingerprint: "", key: "" });
  const lastStatus = useRef<string | undefined>(undefined);
  // Đổi đơn phải bỏ xác nhận của phiếu trước; không để checkbox thu tiền bị dùng lại.
  useEffect(() => {
    setChecked(false);
    setCancelOpen(false);
    setError("");
    confirmKey.current = { fingerprint: "", key: "" };
    lastStatus.current = undefined;
  }, [orderId]);
  useEffect(() => {
    if (
      order?.status === "CONFIRMED" &&
      lastStatus.current === "PENDING_PAYMENT"
    ) {
      toast(
        order.subscription!.startDate > localDate()
          ? "Đã xác nhận thanh toán. Gói mới có hiệu lực từ " +
              dateLabel(order.subscription!.startDate) +
              "."
          : "Gói tập đã được xác nhận. Bạn có thể xem thời hạn mới trong Gói thành viên.",
      );
      void client.invalidateQueries({ queryKey: ["membership-orders"] });
    }
    lastStatus.current = order?.status;
  }, [order?.status, order?.memberId, client, toast]);
  // Nút submit đặt ở footer và liên kết form bằng HTML form/id; kiểm tra thu tiền giữ nguyên.
  // Chỉ hiện nút thu tiền cho đơn CASH còn chờ và người có quyền; đơn QR đi theo webhook của BE.
  const canCollectCash =
    !!order &&
    order.status === "PENDING_PAYMENT" &&
    order.invoice.paymentMethod === "CASH" &&
    can("payments.collect");
  // Cho nhân viên hủy đơn lập sai; BE kiểm tra lại tiền đã nhận và phiên bản dưới khóa.
  const canCancel =
    !!order &&
    order.status === "PENDING_PAYMENT" &&
    can("payments.collect") &&
    (order.bankTransfer?.receivedAmount ?? 0) === 0;
  const canRefund =
    !!order &&
    order.status === "CONFIRMED" &&
    order.invoice.paymentStatus === "PAID" &&
    can("payments.refund");
  return (
    <>
    <Modal
      title="Chi tiết hóa đơn gia hạn / đăng ký gói"
      onClose={onClose}
      wide
      dismissible={!busy}
      className="membership-order-dialog"
    >
      {query.isPending ? (
        <div className="membership-order-body">
          <Loading />
        </div>
      ) : query.error ? (
        <div className="membership-order-body">
          <ErrorState error={query.error} retry={query.refetch} />
        </div>
      ) : !owner ? (
        <div className="membership-order-body">
          <Notice>Không có quyền xem hóa đơn của thành viên này.</Notice>
        </div>
      ) : (
        order && (
          <>
            <div className="membership-order-body" id="print-invoice">
              {/*
                Thanh tiến trình đơn: Tạo đơn → Thanh toán → Kích hoạt gói.
                Làm sao: chỉ suy ra từ order.status và phương thức đã có, không gọi thêm API; đơn hủy/hoàn tiền hiện bước cuối riêng.
                Tại sao: lễ tân nhìn một lần biết đơn đang kẹt ở bước nào; ẩn khi in để PDF hóa đơn không đổi.
              */}
              <OrderSteps status={order.status} method={order.invoice.paymentMethod} />
              <section
                className="membership-order-card"
                aria-label="Thông tin đơn"
              >
                <h3>Thông tin đơn</h3>
                <dl className="membership-order-facts">
                  <div>
                    <dt>Mã thanh toán</dt>
                    <dd>{order.paymentReference}</dd>
                  </div>
                  <div>
                    <dt>Thành viên</dt>
                    <dd>
                      {member.name || "Chưa có tên"}
                      <small>
                        TV{order.memberId} · Hóa đơn HD{order.invoice.id}
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>Phương thức</dt>
                    <dd>{methodName(order.invoice.paymentMethod)}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>
                      <span
                        className={`membership-order-state ${order.status === "CONFIRMED" ? "is-complete status-paid" : order.status === "PENDING_PAYMENT" ? "status-unpaid" : order.status === "REFUNDED" ? "badge-refunded" : ""}`}
                      >
                        {orderStatus[order.status]}
                      </span>
                    </dd>
                  </div>
                </dl>
              </section>
              <section
                className="membership-order-card"
                aria-label="Gói tập và số tiền"
              >
                <h3>Gói tập và số tiền</h3>
                <strong className="membership-order-package">
                  {order.package.name}
                </strong>
                <p>
                  {order.kind === "RENEWAL"
                    ? "Gia hạn từ đăng ký #" + order.sourceSubscriptionId
                    : "Đăng ký gói mới"}{" "}
                  · {order.package.durationDays} ngày
                </p>
                <MembershipBenefits value={order.package} />
                {order.package.description && <p>{order.package.description}</p>}
                {order.package.demoPayment && (
                  <Notice>
                    ĐƠN DEMO CHUYỂN KHOẢN · Giá niêm yết:{" "}
                    {money(order.package.price)}. Số tiền thực trả bên dưới được
                    áp dụng cho hóa đơn và QR.
                  </Notice>
                )}
                <div className="membership-order-total">
                  <span>
                    Số tiền{" "}
                    {order.status === "CONFIRMED"
                      ? "đã thanh toán"
                      : order.status === "REFUNDED"
                        ? "đã hoàn tiền"
                        : "cần thanh toán"}
                  </span>
                  <strong>
                    {money(
                      order.status === "REFUNDED"
                        ? (order.invoice.refundedAmount ?? order.invoice.amount)
                        : order.invoice.amount,
                    )}
                  </strong>
                </div>
              </section>
              {order.status === "CONFIRMED" ? (
                <>
                  <section
                    className="membership-order-card membership-order-full"
                    aria-label="Kết quả gia hạn"
                  >
                    <h3>
                      Kết quả {order.kind === "RENEWAL" ? "gia hạn" : "đăng ký"}
                    </h3>
                    <Notice>
                      Đã xác nhận {orderAction(order)} {order.package.name} lúc {timeLabel(order.confirmedAt!)} ngày {dateLabel(order.confirmedAt!)}. 
                      Thời hạn: {dateLabel(order.subscription!.startDate)} –{" "}
                      {dateLabel(order.subscription!.endDate)}.{" "}
                      {order.subscription!.startDate > localDate() && (
                        <>
                          Gói mới có hiệu lực từ{" "}
                          {dateLabel(order.subscription!.startDate)}; quyền mới
                          chưa áp dụng trước ngày này.{" "}
                        </>
                      )}
                      <Link to="/memberships" onClick={onClose}>
                        Xem gói tập
                      </Link>
                    </Notice>
                  </section>
                  <div className="membership-order-full membership-order-notification">
                    <MembershipDelivery
                      order={order}
                      memberName={member.name}
                      staff={can("payments.collect")}
                      compact
                    />
                  </div>
                </>
              ) : order.status === "PENDING_PAYMENT" ? (
                <section
                  className="membership-order-card membership-order-full"
                  aria-label="Thanh toán và xác nhận"
                >
                  <h3>
                    {order.invoice.paymentMethod === "BANK_TRANSFER"
                      ? "Chuyển khoản và đối soát"
                      : "Thu tiền mặt tại quầy"}
                  </h3>
                  {order.invoice.paymentMethod === "BANK_TRANSFER" ? (
                    <>
                      {/* [FLOW 3] KHUNG QR CHUYỂN KHOẢN (đơn BANK_TRANSFER): hiện tài khoản nhận, số tiền, nội dung HD.. TV.. TÊN (xem PaymentQr.tsx). */}
                      <PaymentQr
                        invoice={order.invoice}
                        bankAccount={order.bankAccount}
                        memberName={member.name}
                      />
                      <TransferVerification order={order} />
                    </>
                  ) : (
                    <Notice>
                      Đơn đang chờ nhận tiền mặt tại quầy. Chỉ sau khi lễ tân
                      nhận đủ tiền và xác nhận, gói mới được gia hạn/kích hoạt.
                    </Notice>
                  )}
                  {/* [FLOW 3] FORM THU TIỀN MẶT (chỉ Lễ tân/Quản lý, đơn CASH): tick xác nhận đã nhận đủ tiền rồi bấm nút xác nhận ở chân hộp thoại. */}
                  {canCollectCash && (
                    <form
                      id={cashFormId}
                      className="membership-cash-receipt"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                          !checked ||
                          busy ||
                          order.invoice.paymentMethod !== "CASH"
                        )
                          return;
                        setBusy(true);
                        setError("");
                        try {
                          const fingerprint = JSON.stringify({
                            orderId,
                            version: order.version,
                            method: "CASH",
                          });
                          if (confirmKey.current.fingerprint !== fingerprint)
                            confirmKey.current = {
                              fingerprint,
                              key: crypto.randomUUID(),
                            };
                          // Gửi khoản thu đã được nhân viên kiểm tra; chỉ hiển thị thành công theo response từ BE.
                          // [FLOW 3] GỌI API XÁC NHẬN THU TIỀN MẶT: POST /membership-orders/{id}/confirm-payment -> BE tạo gói, hóa đơn PAID, đơn CONFIRMED.
                          const updated = await membershipCheckout.confirm(
                            order,
                            "",
                            confirmKey.current.key,
                          );
                          client.setQueryData(
                            ["membership-order", orderId],
                            updated,
                          );
                          await client.invalidateQueries({
                            queryKey: ["membership-orders"],
                          });
                        } catch (err) {
                          setError(errorText(err));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <label className="membership-order-receipt">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setChecked(e.target.checked)}
                          required
                        />{" "}
                        <span>Tôi đã nhận đủ tiền mặt cho hóa đơn này</span>
                      </label>
                      {error && (
                        <p role="alert" className="form-error">
                          {error}
                        </p>
                      )}
                    </form>
                  )}
                  <p className="membership-order-help">
                    {order.invoice.paymentMethod === "BANK_TRANSFER"
                      ? "Quét mã không xác nhận tiền đã vào tài khoản. Trạng thái chỉ thay đổi sau khi hệ thống đối soát giao dịch."
                      : "Thành viên theo dõi kết quả tại mục Gói thành viên sau khi lễ tân xác nhận thu tiền."}
                  </p>
                </section>
              ) : order.status === "REFUNDED" ? (
                <section className="membership-order-card membership-order-full">
                  <h3>Kết quả hoàn tiền</h3>
                  <RefundReceipt invoice={order.invoice} />
                  <Notice>
                    Hóa đơn đã được hoàn tiền và gói liên quan đã bị hủy. Thao
                    tác này chỉ ghi nhận hoàn tiền trong hệ thống, không tự
                    chuyển tiền về tài khoản ngân hàng.
                  </Notice>
                </section>
              ) : (
                <section className="membership-order-card membership-order-full">
                  <h3>Trạng thái đơn</h3>
                  <Notice>Yêu cầu đã hủy. Không thanh toán cho đơn này.</Notice>
                </section>
              )}
              {order.status === "CONFIRMED" && order.invoice.paymentStatus === "PAID" && (
                order.invoice.refundRequestedAt ? (
                  <section className="membership-order-card membership-order-full">
                    <h3>Yêu cầu hoàn tiền · Chờ xử lý</h3>
                    <p>Đã gửi lúc {timeLabel(order.invoice.refundRequestedAt)} ngày {dateLabel(order.invoice.refundRequestedAt)}.</p>
                    <p>Lý do: {order.invoice.refundRequestReason}</p>
                    <p>Số tiền hoàn đã chốt: {money(order.invoice.refundRequestedAmount!)} ({order.invoice.refundRequestedPercent}%).</p>
                  </section>
                ) : session!.user.roleName === "MEMBER" && order.memberId === session!.user.id && (
                  // [FLOW 3] NÚT "Yêu cầu hoàn tiền" của Member (RefundRequests.tsx): Member gửi yêu cầu hoàn cho hóa đơn đã thanh toán.
                  <MemberRefundAction invoice={order.invoice} onSent={query.refetch} />
                )
              )}
              <p className="membership-order-updated membership-order-full">
                Trạng thái được tải từ hệ thống.{" "}
                {query.isFetching
                  ? "Đang kiểm tra cập nhật…"
                  : query.dataUpdatedAt
                    ? "Cập nhật lúc " +
                      new Date(query.dataUpdatedAt).toLocaleTimeString("vi-VN")
                    : ""}
              </p>
            </div>
            <div className="modal-footer membership-order-footer">
              <div className="membership-order-secondary">
                {/* [FLOW 3] NÚT "In / Lưu PDF": in hóa đơn bằng hộp thoại in của trình duyệt (chọn Lưu thành PDF). */}
                <Button variant="secondary" onClick={() => window.print()}>
                  In / Lưu PDF
                </Button>
                {/* [NÚT] NÚT "Kiểm tra cập nhật" → tải lại dữ liệu từ API */}
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void query.refetch()}
                >
                  {/* [FLOW 3] NÚT "Kiểm tra cập nhật": tải lại trạng thái đơn ngay (không chờ lần tự tải lại). */}
                  Kiểm tra cập nhật
                </Button>
              </div>
              <div className="membership-order-primary">
                {canCancel && (
                  // [FLOW 3] NÚT "Hủy đơn chờ" (Lễ tân/Quản lý): mở xác nhận hủy -> POST /membership-orders/{id}/cancel.
                  <Button variant="danger" disabled={busy} onClick={() => setCancelOpen(true)}>
                    Hủy đơn chờ
                  </Button>
                )}
                {/* [FLOW 3] NÚT "Ghi nhận hoàn tiền" (Lễ tân/Quản lý): mở form hoàn tiền mặt (RefundForm.tsx). */}
                {canRefund && (
                  <Button
                    variant="danger"
                    onClick={() => setRefundOpen(true)}
                    disabled={busy}
                  >
                    Ghi nhận hoàn tiền
                  </Button>
                )}
                {/* [FLOW 3] NÚT "Xác nhận thu tiền và kích hoạt gói": submit form thu tiền mặt ở trên -> gọi membershipCheckout.confirm. */}
                {canCollectCash && (
                  <Button
                    type="submit"
                    form={cashFormId}
                    loading={busy}
                    disabled={!checked || busy}
                  >
                    Xác nhận thu tiền và kích hoạt gói
                  </Button>
                )}
                {/* [NÚT] NÚT "Đóng" → chạy hàm onClose() */}
                <Button
                  variant={canCollectCash ? "secondary" : "primary"}
                  onClick={onClose}
                  disabled={busy}
                >
                  Đóng
                </Button>
              </div>
            </div>
          </>
        )
      )}
    </Modal>
    {cancelOpen && order && (
      // [NÚT] HỘP XÁC NHẬN "Hủy đơn chờ thanh toán?" → gọi API membershipCheckout.cancel → POST /membership-orders/{id}/cancel
      <Confirm title="Hủy đơn chờ thanh toán?"
        description={`Hủy hóa đơn HD${order.invoice.id} của TV${order.memberId}. Chỉ xác nhận khi chưa nhận tiền. Gói hiện tại được giữ nguyên và có thể tạo lại đơn đúng. Sau khi hủy, không chuyển tiền theo QR của đơn này.`}
        onClose={() => setCancelOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            // [FLOW 3] GỌI API HỦY ĐƠN CHỜ: POST /membership-orders/{id}/cancel -> đơn CANCELLED, hóa đơn CANCELLED.
            const updated = await membershipCheckout.cancel(order);
            client.setQueryData(["membership-order", orderId], updated);
            await client.invalidateQueries();
            setCancelOpen(false);
            toast("Đã hủy đơn chờ. Bạn có thể tạo lại yêu cầu đăng ký hoặc gia hạn.");
          } catch (error) {
            await query.refetch();
            throw error;
          } finally {
            setBusy(false);
          }
        }} />
    )}
    {refundOpen && canRefund && order && (
      <RefundForm invoice={order.invoice}
        onClose={() => setRefundOpen(false)}
        onSaved={async () => {
          await Promise.all([
            client.invalidateQueries({ queryKey: ["pending-refund-requests"] }),
            client.invalidateQueries({ queryKey: ["revenue-summary"] }),
            client.invalidateQueries({ queryKey: ["bookings"] }),
            client.invalidateQueries({ queryKey: ["membership-orders"] }),
            client.invalidateQueries({
              queryKey: ["activeSubscription", order.memberId],
            }),
            client.invalidateQueries({
              queryKey: ["subscriptions", order.memberId],
            }),
            client.invalidateQueries({
              predicate: ({ queryKey }) =>
                queryKey[0] === "invoices" &&
                (!queryKey[1] || Number(queryKey[1]) === order.memberId),
            }),
          ]);
          await query.refetch();
          toast("Đã ghi nhận hoàn tiền và đồng bộ trạng thái đơn.");
        }}
      />
    )}
    </>
  );
}

/** Thông báo xác nhận lấy từ đơn đã CONFIRMED trên server, không tự tạo thông báo thành công. */
export function MembershipNotifications() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["membership-orders", session!.user.id],
    // [FLOW 3] LẤY API: GET /membership-orders?memberId= - Member xem đơn gói của chính mình.
    queryFn: () => membershipCheckout.list(session!.user.id),
    retry: false,
    refetchInterval: pendingInterval,
  });
  // Danh sách thông báo xác nhận được dựng từ các đơn đã hoàn tất; đơn chờ chưa có thông báo thành công.
  const rows = query.data?.filter((o) => o.status === "CONFIRMED") || [];
  return (
    <>
      <PageHeader
        title="Thông báo & bài tập"
        description="Theo dõi đăng ký lớp, lịch học, gói tập và bài tập của bạn."
      />
      {query.isPending && <Loading />}
      {query.error && <ErrorState error={query.error} retry={query.refetch} />}
      <ApiNotificationInbox
        canShowEmpty={query.isSuccess}
        additionalCards={rows.map((order) => {
          const notification = order.delivery?.notification;
          const createdAt = notification?.createdAt ?? order.confirmedAt!;
          return {
            key: `membership:${order.id}`,
            id: notification?.id ?? order.id,
            createdAt,
            content: (
              <article className="inbox-card membership-inbox-card">
                <strong className="payment-status status-paid">
                  Đã xác nhận {orderAction(order)} {order.package.name}
                </strong>
                <p>
                  {order.paymentReference} · {money(order.invoice.amount)} · TV
                  {order.memberId}
                </p>
                <p>
                  Thời hạn: {dateLabel(order.subscription!.startDate)} –{" "}
                  {dateLabel(order.subscription!.endDate)}
                  {order.subscription!.startDate > localDate() && (
                    <>
                      {" "}
                      · Gói mới có hiệu lực từ{" "}
                      {dateLabel(order.subscription!.startDate)}; quyền mới chưa
                      áp dụng trước ngày này.
                    </>
                  )}
                </p>
                <small>Xác nhận gói · <time dateTime={createdAt}>{dateLabel(createdAt, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></small>
                <MembershipDelivery
                  order={order}
                  memberName={session!.user.fullName}
                />
                <Link to={`/payments?orderId=${order.id}`}>
                  Xem chi tiết hóa đơn
                </Link>
              </article>
            ),
          };
        })}
      />
    </>
  );
}
