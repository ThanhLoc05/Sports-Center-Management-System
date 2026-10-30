/** Luồng mới: yêu cầu + hóa đơn chờ → thu tiền → backend xác nhận → gói có hiệu lực.
 * Quét QR, mở hóa đơn hoặc bấm chuyển trang không được gọi gia hạn hay tự đặt PAID. */
import { useEffect, useRef, useState } from "react";
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
import { dateLabel, errorText, localDate, money } from "../lib/utils";
import { PaymentQr } from "./PaymentQr";
import {
  Badge,
  Button,
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

const orderAction = (order: MembershipOrder) =>
  order.kind === "NEW"
    ? "đăng ký gói mới"
    : order.sourcePackageId === order.package.id
      ? "gia hạn gói hiện tại"
      : "gia hạn với gói mới";
const orderStatus = {
  PENDING_PAYMENT: "Chờ thanh toán / xác nhận",
  CONFIRMED: "Đã xác nhận gói",
  CANCELLED: "Đã hủy yêu cầu",
};
const methodName = (method: string) =>
  method === "CASH" ? "Tiền mặt tại quầy" : "Chuyển khoản QR";
const positiveId = (text: string | null) =>
  text &&
  /^\d+$/.test(text) &&
  Number.isSafeInteger(Number(text)) &&
  Number(text) > 0
    ? Number(text)
    : undefined;
const pendingInterval = (query: { state: { error: unknown } }) =>
  query.state.error ? false : 10000;

function useConfirmedMemberships(orders?: MembershipOrder[]) {
  const client = useQueryClient();
  const confirmed = useRef(new Set<number>());
  useEffect(() => {
    for (const order of orders || []) {
      if (order.status !== "CONFIRMED" || confirmed.current.has(order.id)) continue;
      confirmed.current.add(order.id);
      // Xác nhận ở máy khác cũng phải tải lại quyền thật, không tự cấp quyền từ đơn.
      void client.invalidateQueries({ queryKey: ["activeSubscription", order.memberId] });
      void client.invalidateQueries({ queryKey: ["subscriptions", order.memberId] });
      void client.invalidateQueries({
        predicate: ({ queryKey }) => queryKey[0] === "invoices" &&
          (!queryKey[1] || Number(queryKey[1]) === order.memberId),
      });
    }
  }, [orders, client]);
}

export function MembershipCheckoutPage() {
  const { session } = useAuth();
  const member = session!.user.roleName === "MEMBER";
  const [params] = useSearchParams();
  const [memberId, setMemberId] = useState(
    member ? String(session!.user.id) : params.get("memberId") || "",
  );
  const selected = positiveId(memberId);
  const users = useUsers();
  const packages = useQuery({
    queryKey: ["membership-packages"],
    queryFn: membershipCheckout.packages,
    retry: false,
  });
  const subscriptions = useQuery({
    queryKey: ["subscriptions", selected],
    queryFn: () => api.subscriptions(selected!),
    enabled: !!selected,
  });
  const [draft, setDraft] = useState<{
    source?: Subscription;
    offer?: MembershipOffer;
  } | null>(null);
  const historyReady = !subscriptions.isPending && !subscriptions.isFetching && !subscriptions.error;
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
          <Button
            disabled={
              !selected || !historyReady
            }
            onClick={() => setDraft({ source: active })}
          >
            {active ? "Gia hạn gói tập" : "Đăng ký gói tập"}
          </Button>
        }
      />
      {!member && (
        <Panel title="Thành viên cần hỗ trợ">
          <Field label="ID thành viên xem gói">
            <input
              type="number"
              min="1"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            />
          </Field>
        </Panel>
      )}
      {subscriptions.isFetching && selected && <Loading />}
      {subscriptions.error && (
        <ErrorState error={subscriptions.error} retry={subscriptions.refetch} />
      )}
      {active && (
        <Panel
          title={
            packages.data?.find((p) => p.id === active.packageId)?.name ||
            "Gói hiện tại #" + active.packageId
          }
        >
          <p>
            {dateLabel(active.startDate)} – {dateLabel(active.endDate)} ·{" "}
            <Badge status="ACTIVE" />
          </p>
          <Notice>
            Yêu cầu gia hạn chưa thanh toán không làm mất thời hạn của gói đang
            dùng.
          </Notice>
        </Panel>
      )}
      <Panel
        title="Chọn gói tập"
        description="Giá và thời hạn lấy từ danh mục do trung tâm cung cấp."
      >
        {packages.isPending ? (
          <Loading />
        ) : packages.error ? (
          <ErrorState error={packages.error} retry={packages.refetch} />
        ) : packages.data?.length ? (
          <div className="pricing-grid">
            {packages.data.map((pkg) => (
              <article className="pricing-card" key={pkg.id}>
                <h3>{pkg.name}</h3>
                <p>{pkg.description}</p>
                <div className="pricing-price">
                  <strong>{money(pkg.price)}</strong>
                  <span>/ {pkg.durationDays} ngày</span>
                </div>
                <Button
                  disabled={
                    !selected ||
                    !historyReady
                  }
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
                  <Badge
                    status={
                      s.status === "ACTIVE" && s.endDate < localDate()
                        ? "EXPIRED"
                        : s.status
                    }
                  />
                ),
              },
              {
                key: "renew",
                label: "Thao tác",
                render: (s) => (
                  <Button
                    variant="secondary"
                    disabled={!historyReady || !["ACTIVE", "EXPIRED"].includes(s.status) || (!!active && active.id !== s.id)}
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
          source={subscriptions.data?.find((s) => s.id === draft.source?.id) || draft.source}
          offer={draft.offer}
          users={users.data || []}
          historyReady={historyReady && (!draft.source || !!subscriptions.data?.some((s) => s.id === draft.source!.id))}
          onClose={() => setDraft(null)}
        />
      )}
    </>
  );
}

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
    queryFn: membershipCheckout.packages,
    retry: false,
  });
  const [packageId, setPackageId] = useState(
    offer?.id || source?.packageId || 0,
  );
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const selected = packages.data?.find((p) => p.id === packageId);
  // Cùng nội dung + thử lại sau lỗi mạng dùng lại key; thay lựa chọn tạo key mới.
  const attempt = useRef({ fingerprint: "", key: "" });
  return (
    <FormModal
      title={source ? "Yêu cầu gia hạn gói tập" : "Yêu cầu đăng ký gói tập"}
      submitLabel="Tiếp tục đến thanh toán"
      submitDisabled={!selected || packages.isPending || !!packages.error || (!!source && (!historyReady || !["ACTIVE", "EXPIRED"].includes(source.status)))}
      onClose={onClose}
      onSubmit={async (data) => {
        // Không gia hạn từ lịch sử cache khi đang tải lại hoặc API đã lỗi.
        if (source && (!historyReady || !["ACTIVE", "EXPIRED"].includes(source.status)))
          throw Error("Chưa có dữ liệu hợp lệ để gia hạn gói này.");
        if (!selected)
          throw Error("Chọn gói có giá từ trung tâm trước khi tiếp tục.");
        const target =
          session!.user.roleName === "MEMBER"
            ? session!.user.id
            : Number(data.get("memberId"));
        if (source && source.memberId !== target)
          throw Error("Gói cũ không thuộc thành viên đã chọn.");
        const input: MembershipOrderInput = {
          memberId: target,
          packageId: selected.id,
          paymentMethod: method,
          ...(source ? { sourceSubscriptionId: source.id } : {}),
        };
        const fingerprint = JSON.stringify(input);
        if (attempt.current.fingerprint !== fingerprint)
          attempt.current = { fingerprint, key: crypto.randomUUID() };
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
        navigate(`/payments?memberId=${order.memberId}&orderId=${order.id}`);
      }}
    >
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
      <Field label="Phương thức thanh toán">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          <option value="CASH">Tiền mặt tại quầy</option>
          <option value="BANK_TRANSFER">Chuyển khoản QR</option>
        </select>
      </Field>
      {selected && (
        <p>
          <strong>Tổng tiền: {money(selected.price)}</strong>
          <br />
          {source
            ? source.packageId === selected.id
              ? "Gia hạn gói hiện tại"
              : "Gia hạn với gói mới"
            : "Đăng ký gói mới"}
        </p>
      )}
      <Notice>
        {method === "CASH"
          ? "Lễ tân nhận yêu cầu và chỉ xác nhận gói sau khi nhận đủ tiền mặt."
          : "Hóa đơn sẽ hiển thị QR, đúng số tiền và mã chuyển khoản kèm mã thành viên. Quét QR không tự xác nhận đã nhận tiền."}
      </Notice>
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
  const effectiveMember =
    session!.user.roleName === "MEMBER" ? session!.user.id : memberId;
  const query = useQuery({
    queryKey: ["membership-orders", effectiveMember],
    queryFn: () => membershipCheckout.list(effectiveMember),
    retry: false,
    refetchInterval: pendingInterval,
  });
  useConfirmedMemberships(query.error ? undefined : query.data);
  const fromUrl = paymentPage ? positiveId(params.get("orderId")) : undefined;
  const detailId = fromUrl || selected;
  const rows = (query.data || []).filter(
    (o) =>
      (can("payments.collect") || o.memberId === session!.user.id) &&
      `${o.id} ${o.memberId} ${o.invoice.id} ${o.paymentReference} ${o.package.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Panel
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
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm mã thanh toán, mã thành viên, gói tập..."
          />
          <DataTable
            rows={rows}
            columns={[
              {
                key: "reference",
                label: "Mã thanh toán / thành viên",
                render: (o) => (
                  <>
                    <strong>{o.paymentReference}</strong>
                    <small>
                      TV{o.memberId} · HĐ{o.invoice.id}
                    </small>
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
                render: (o) => orderStatus[o.status],
              },
              {
                key: "view",
                label: "Thao tác",
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
  const query = useQuery({
    queryKey: ["membership-order", orderId],
    queryFn: () => membershipCheckout.detail(orderId),
    retry: false,
    refetchInterval: (q) =>
      q.state.error || q.state.data?.status !== "PENDING_PAYMENT"
        ? false
        : 8000,
  });
  const order = query.data;
  useConfirmedMemberships(query.error || !order ? undefined : [order]);
  const owner =
    order && (order.memberId === session!.user.id || can("payments.collect"));
  const [checked, setChecked] = useState(false),
    [transaction, setTransaction] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const confirmKey = useRef({ fingerprint: "", key: "" });
  const lastStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      order?.status === "CONFIRMED" &&
      lastStatus.current === "PENDING_PAYMENT"
    ) {
      toast(
        order.subscription!.startDate > localDate()
          ? "Đã xác nhận thanh toán. Gói mới có hiệu lực từ " + dateLabel(order.subscription!.startDate) + "."
          : "Gói tập đã được xác nhận. Bạn có thể xem thời hạn mới trong Gói thành viên.",
      );
      void client.invalidateQueries({ queryKey: ["membership-orders"] });
    }
    lastStatus.current = order?.status;
  }, [order?.status, order?.memberId, client, toast]);
  return (
    <Modal
      title="Chi tiết hóa đơn gia hạn / đăng ký gói"
      onClose={onClose}
      wide
      dismissible={!busy}
    >
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : !owner ? (
        <Notice>Không có quyền xem hóa đơn của thành viên này.</Notice>
      ) : (
        order && (
          <>
            <div className="detail-grid">
              <div>
                <span>Mã thanh toán</span>
                <strong>{order.paymentReference}</strong>
                <p>
                  Thành viên: TV{order.memberId} · Hóa đơn: HD{order.invoice.id}
                </p>
              </div>
              <div>
                <span>Trạng thái</span>
                <strong>{orderStatus[order.status]}</strong>
                <p>{methodName(order.invoice.paymentMethod)}</p>
              </div>
            </div>
            <Panel title={order.package.name}>
              <p>
                {order.kind === "RENEWAL"
                  ? "Gia hạn từ đăng ký #" + order.sourceSubscriptionId
                  : "Đăng ký gói mới"}{" "}
                · {order.package.durationDays} ngày
              </p>
              <h3>{money(order.invoice.amount)}</h3>
            </Panel>
            {order.status === "CONFIRMED" ? (
              <Notice>
                Đã xác nhận {orderAction(order)} {order.package.name}. Thời hạn:{" "}
                {dateLabel(order.subscription!.startDate)} –{" "}
                {dateLabel(order.subscription!.endDate)}.{" "}
                {order.subscription!.startDate > localDate() && (
                  <>Gói mới có hiệu lực từ {dateLabel(order.subscription!.startDate)}; quyền mới chưa áp dụng trước ngày này. </>
                )}
                <Link to="/memberships" onClick={onClose}>
                  Xem gói tập
                </Link>
              </Notice>
            ) : (
              order.status === "PENDING_PAYMENT" && (
                <>
                  {order.invoice.paymentMethod === "BANK_TRANSFER" ? (
                    <PaymentQr
                      invoice={order.invoice}
                      bankAccount={order.bankAccount}
                    />
                  ) : (
                    <Notice>
                      Đơn đang chờ nhận tiền mặt tại quầy. Chỉ sau khi lễ tân
                      nhận đủ tiền và xác nhận, gói mới được gia hạn/kích hoạt.
                    </Notice>
                  )}
                  <p>
                    Hệ thống chỉ cập nhật gói sau xác nhận từ máy chủ. Mở hoặc
                    quét mã không chứng minh tiền đã vào tài khoản.
                  </p>
                  {can("payments.collect") && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!checked) return;
                        setBusy(true);
                        setError("");
                        try {
                          const fingerprint = JSON.stringify({
                            orderId,
                            version: order.version,
                            transaction: transaction.trim(),
                          });
                          if (confirmKey.current.fingerprint !== fingerprint)
                            confirmKey.current = {
                              fingerprint,
                              key: crypto.randomUUID(),
                            };
                          const updated = await membershipCheckout.confirm(
                            order,
                            transaction,
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
                      {order.invoice.paymentMethod === "BANK_TRANSFER" && (
                        <Field label="Mã giao dịch ngân hàng đã đối chiếu">
                          <input
                            required
                            value={transaction}
                            onChange={(e) => setTransaction(e.target.value)}
                            maxLength={100}
                          />
                        </Field>
                      )}
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setChecked(e.target.checked)}
                          required
                        />{" "}
                        {order.invoice.paymentMethod === "CASH"
                          ? "Tôi đã nhận đủ tiền mặt cho hóa đơn này"
                          : "Tôi đã đối chiếu giao dịch thực nhận: đúng mã, tài khoản và số tiền"}
                      </label>
                      {error && (
                        <p role="alert" className="form-error">
                          {error}
                        </p>
                      )}
                      <Button
                        type="submit"
                        loading={busy}
                        disabled={
                          !checked ||
                          busy ||
                          (order.invoice.paymentMethod === "BANK_TRANSFER" &&
                            !transaction.trim())
                        }
                      >
                        Xác nhận thu tiền và kích hoạt gói
                      </Button>
                    </form>
                  )}
                </>
              )
            )}
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => window.print()}>
                In / Lưu PDF
              </Button>
              <Button variant="secondary" onClick={() => void query.refetch()}>
                Kiểm tra cập nhật
              </Button>
              <Button onClick={onClose} disabled={busy}>
                Đóng
              </Button>
            </div>
          </>
        )
      )}
    </Modal>
  );
}

/** Thông báo xác nhận lấy từ đơn đã CONFIRMED trên server, không tự tạo thông báo thành công. */
export function MembershipNotifications() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["membership-orders", session!.user.id],
    queryFn: () => membershipCheckout.list(session!.user.id),
    retry: false,
    refetchInterval: pendingInterval,
  });
  const rows = query.data?.filter((o) => o.status === "CONFIRMED") || [];
  return (
    <>
      <PageHeader
        title="Thông báo & bài tập"
        description="Cập nhật xác nhận gói tập của tài khoản đang đăng nhập."
      />
      <Panel title="Xác nhận đăng ký / gia hạn">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : rows.length ? (
          rows.map((order) => (
            <article className="notification-card" key={order.id}>
              <strong>
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
                  <> · Gói mới có hiệu lực từ {dateLabel(order.subscription!.startDate)}; quyền mới chưa áp dụng trước ngày này.</>
                )}
              </p>
              <Link to={`/payments?orderId=${order.id}`}>
                Xem chi tiết hóa đơn
              </Link>
            </article>
          ))
        ) : (
          <Empty
            title="Chưa có xác nhận gói mới"
            description="Yêu cầu chờ thanh toán sẽ chưa tạo thông báo gia hạn thành công."
          />
        )}
      </Panel>
    </>
  );
}
