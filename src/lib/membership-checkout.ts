/** Hợp đồng FE cho yêu cầu mua/gia hạn. Không gọi API gia hạn cũ vì API đó kích hoạt ngay.
 * Backend phải tính giá, tạo hóa đơn chờ và kích hoạt gói trong giao dịch xác nhận thu tiền.
 * Không lưu đơn, hóa đơn hay trạng thái PAID giả vào localStorage. */
import { ApiError, request } from "./api";
import { transferReference } from "./payment-qr";
import type { BankConfig } from "./payment-qr";
import type { Invoice, Subscription } from "./types";

export interface MembershipOffer {
  id: number;
  name: string;
  price: number;
  durationDays: number;
  status: "ACTIVE" | "INACTIVE";
  description?: string;
}
export type PaymentMethod = "CASH" | "BANK_TRANSFER";
export interface MembershipOrder {
  id: number;
  memberId: number;
  kind: "NEW" | "RENEWAL";
  sourceSubscriptionId?: number;
  sourcePackageId?: number;
  status: "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED";
  package: MembershipOffer;
  invoice: Invoice;
  paymentReference: string;
  bankAccount?: BankConfig;
  createdAt: string;
  confirmedAt?: string;
  subscription?: Subscription;
  version: number;
}
export interface MembershipOrderInput {
  memberId: number;
  packageId: number;
  sourceSubscriptionId?: number;
  paymentMethod: PaymentMethod;
}
function id(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ApiError("Mã dữ liệu không hợp lệ.");
  return value;
}
function offer(value: MembershipOffer): MembershipOffer {
  if (
    !value ||
    !value.name ||
    !Number.isSafeInteger(value.price) ||
    value.price < 1 ||
    !Number.isSafeInteger(value.durationDays) ||
    value.durationDays < 1 ||
    !["ACTIVE", "INACTIVE"].includes(value.status)
  )
    throw new ApiError(
      "Chưa nhận được tên, giá và thời hạn gói hợp lệ từ máy chủ.",
    );
  id(value.id);
  return value;
}
/** Từ chối phản hồi sai chủ hóa đơn, sai giá hoặc trạng thái mâu thuẫn; không tự sửa dữ liệu tiền. */
export function validateMembershipOrder(
  value: MembershipOrder,
): MembershipOrder {
  if (
    !value ||
    !["NEW", "RENEWAL"].includes(value.kind) ||
    !["PENDING_PAYMENT", "CONFIRMED", "CANCELLED"].includes(value.status) ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0
  )
    throw new ApiError("Dữ liệu yêu cầu thanh toán không hợp lệ.");
  id(value.id);
  id(value.memberId);
  offer(value.package);
  const invoice = value.invoice;
  if (
    !invoice ||
    invoice.memberId !== value.memberId ||
    invoice.amount !== value.package.price ||
    !["CASH", "BANK_TRANSFER"].includes(invoice.paymentMethod) ||
    value.paymentReference !== transferReference(invoice.id, value.memberId)
  )
    throw new ApiError(
      "Hóa đơn không khớp thành viên, giá gói hoặc mã thanh toán.",
    );
  if (value.kind === "RENEWAL") {
    id(value.sourceSubscriptionId!);
    id(value.sourcePackageId!);
  }
  if (value.status === "PENDING_PAYMENT" && invoice.paymentStatus !== "PENDING")
    throw new ApiError("Trạng thái yêu cầu và hóa đơn chưa đồng bộ.");
  if (
    value.status === "CONFIRMED" &&
    (invoice.paymentStatus !== "PAID" ||
      !value.subscription ||
      value.subscription.memberId !== value.memberId ||
      value.subscription.packageId !== value.package.id ||
      !value.confirmedAt)
  )
    throw new ApiError(
      "Chưa có kết quả xác nhận thanh toán và kích hoạt gói hợp lệ.",
    );
  return value;
}
async function contract<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await request<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && [404, 405, 501].includes(error.status))
      throw new ApiError(
        "Dịch vụ yêu cầu thanh toán gói chưa sẵn sàng. Gói hiện tại chưa bị thay đổi; vui lòng liên hệ lễ tân.",
        error.status,
      );
    throw error;
  }
}
export const membershipCheckout = {
  async packages() {
    const data = await contract<MembershipOffer[]>("/membership-packages");
    if (!Array.isArray(data))
      throw new ApiError("Danh mục gói trả về không đúng định dạng.");
    return data.map(offer).filter((p) => p.status === "ACTIVE");
  },
  async list(memberId?: number) {
    const data = await contract<MembershipOrder[]>(
      "/membership-orders" + (memberId ? "?memberId=" + id(memberId) : ""),
    );
    if (!Array.isArray(data))
      throw new ApiError("Danh sách yêu cầu trả về không đúng định dạng.");
    const orders = data.map(validateMembershipOrder);
    if (memberId && orders.some((o) => o.memberId !== memberId))
      throw new ApiError("Yêu cầu thanh toán không thuộc thành viên đang xem.");
    return orders;
  },
  async detail(orderId: number) {
    const order = validateMembershipOrder(
      await contract<MembershipOrder>("/membership-orders/" + id(orderId)),
    );
    if (order.id !== orderId)
      throw new ApiError("Mã yêu cầu trả về không khớp.");
    return order;
  },
  async create(input: MembershipOrderInput, key: string) {
    id(input.memberId);
    id(input.packageId);
    const order = validateMembershipOrder(
      await contract<MembershipOrder>("/membership-orders", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(input),
      }),
    );
    if (
      order.memberId !== input.memberId ||
      order.package.id !== input.packageId ||
      order.invoice.paymentMethod !== input.paymentMethod ||
      (order.sourceSubscriptionId ?? undefined) !== input.sourceSubscriptionId
    )
      throw new ApiError("Yêu cầu trả về không khớp thông tin đã chọn.");
    return order;
  },
  async confirm(order: MembershipOrder, transactionId: string, key: string) {
    if (order.status !== "PENDING_PAYMENT")
      throw new ApiError("Yêu cầu không còn chờ thanh toán.");
    if (
      order.invoice.paymentMethod === "BANK_TRANSFER" &&
      !transactionId.trim()
    )
      throw new ApiError("Nhập mã giao dịch đã đối chiếu trên sao kê.");
    const updated = validateMembershipOrder(
      await contract<MembershipOrder>(
        "/membership-orders/" + id(order.id) + "/confirm-payment",
        {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({
            version: order.version,
            ...(order.invoice.paymentMethod === "BANK_TRANSFER"
              ? { bankTransactionId: transactionId.trim() }
              : {}),
          }),
        },
      ),
    );
    if (
      updated.id !== order.id ||
      updated.memberId !== order.memberId ||
      updated.invoice.id !== order.invoice.id ||
      updated.package.id !== order.package.id ||
      updated.invoice.amount !== order.invoice.amount ||
      updated.invoice.paymentMethod !== order.invoice.paymentMethod ||
      updated.status !== "CONFIRMED"
    )
      throw new ApiError(
        "Chưa nhận được xác nhận gia hạn hoàn tất từ máy chủ.",
      );
    return updated;
  },
};
