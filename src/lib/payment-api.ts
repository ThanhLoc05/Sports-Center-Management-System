import { ApiError, getSession, request } from "./api";

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED";

export interface PaymentQrRequest {
  invoiceId: number;
  returnUrl?: string;
}

export interface PaymentQrResponse {
  paymentId: number;
  invoiceId: number;
  qrCode: string;
  expiresAt: string;
  status: PaymentStatus;
}

export interface PaymentStatusResponse {
  paymentId: number;
  invoiceId: number;
  status: PaymentStatus;
  paidAt?: string;
  failureReason?: string;
}

function apiSession() {
  const session = getSession();
  if (!session || session.mode !== "api")
    throw new ApiError("Chức năng này yêu cầu phiên đăng nhập API.", 401);
}

function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ApiError(`${label} không hợp lệ.`);
  return value;
}

export const paymentApi = {
  async createQr(input: PaymentQrRequest) {
    apiSession();
    const invoiceId = positiveId(input.invoiceId, "Mã hóa đơn");
    return request<PaymentQrResponse>("/payments/qr", {
      method: "POST",
      body: JSON.stringify({ ...input, invoiceId }),
    });
  },

  async status(paymentId: number) {
    apiSession();
    return request<PaymentStatusResponse>(
      `/payments/${positiveId(paymentId, "Mã thanh toán")}`,
    );
  },

  async confirm(paymentId: number) {
    apiSession();
    return request<PaymentStatusResponse>(
      `/payments/${positiveId(paymentId, "Mã thanh toán")}/confirm`,
      { method: "POST" },
    );
  },

  async cancel(paymentId: number) {
    apiSession();
    return request<PaymentStatusResponse>(
      `/payments/${positiveId(paymentId, "Mã thanh toán")}/cancel`,
      { method: "POST" },
    );
  },
};
