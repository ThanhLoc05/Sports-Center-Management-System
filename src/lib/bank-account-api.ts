import { request, ApiError } from "./api";
import { validateBank } from "./payment-qr";
import type { BankConfig } from "./payment-qr";

export interface CenterBankSettings {
  bankAccount: BankConfig | null;
  version: number;
}
/** Cấu hình dùng chung đọc/ghi qua SQL; version chặn ghi đè cấu hình đã được quản lý khác sửa. */
function checked(value: CenterBankSettings) {
  if (!value || !Number.isSafeInteger(value.version) || value.version < 0)
    throw new ApiError("Phản hồi cấu hình ngân hàng không hợp lệ.");
  if (value.bankAccount) validateBank(value.bankAccount);
  return value;
}
export const bankAccountApi = {
  // Đọc tài khoản chung và version hiện tại để hiển thị QR hoặc chuẩn bị chỉnh sửa.
  // [API] bankAccountApi.get → GET /payments/bank-account — được trang Lễ tân/Member gọi
  async get() {
    return checked(await request<CenterBankSettings>("/payments/bank-account"));
  },
  // Gửi PUT kèm version đã xem; BE quyết định quyền quản lý và xử lý xung đột cập nhật.
  async save(bankAccount: BankConfig, version: number) {
    validateBank(bankAccount);
    return checked(
      await request<CenterBankSettings>("/payments/bank-account", {
        method: "PUT",
        body: JSON.stringify({ bankAccount, version }),
      }),
    );
  },
  // Gỡ cấu hình cho đơn mới; các đơn đã có snapshot tài khoản không bị đổi theo thao tác này.
  async clear(version: number) {
    return checked(
      await request<CenterBankSettings>(
        "/payments/bank-account?version=" + version,
        { method: "DELETE" },
      ),
    );
  },
};
