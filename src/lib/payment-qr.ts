import { getSession } from "./api";
import { can } from "./permissions";
import { readDemo } from "./demo";
export interface BankConfig {
  bankBin: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  gatewayName?: string;
}
const KEY = "sportiva-bank-config-v1";
export function getBankConfig(): BankConfig | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    validateBank(value);
    return value;
  } catch {
    return null;
  }
}
export function validateBank(value: BankConfig | null) {
  if (
    !value ||
    [value.bankBin, value.bankName, value.accountNo, value.accountName].some(
      (v) => typeof v !== "string",
    ) ||
    !/^\d{6}$/.test(value.bankBin) ||
    !/^\d{6,19}$/.test(value.accountNo) ||
    !value.bankName.trim() ||
    !value.accountName.trim()
  )
    throw new Error(
      "Nhập tên ngân hàng, BIN 6 số, tài khoản 6–19 số và tên chủ tài khoản.",
    );
}
function requireBankManager() {
  const session = getSession();
  if (
    !can(
      session,
      "roles.manage",
      session?.mode === "demo" ? readDemo() : undefined,
    )
  )
    throw new Error("Chỉ quản lý được cấu hình tài khoản nhận tiền.");
}
export function clearBankConfig() {
  requireBankManager();
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("sportiva:bank-changed"));
}
export function saveBankConfig(value: BankConfig) {
  requireBankManager();
  validateBank(value);
  localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new Event("sportiva:bank-changed"));
}
/** CRC-16/CCITT-FALSE của payload ASCII; QR được tạo tại máy, không gửi STK tới dịch vụ tạo ảnh. */
export function crc16(text: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const field = (id: string, value: string) => {
  if (value.length > 99) throw new Error("Trường QR quá dài.");
  return id + String(value.length).padStart(2, "0") + value;
};
/** Mã ASCII duy nhất gồm hóa đơn + thành viên; không cắt chuỗi làm mất thông tin đối soát. */
export function transferReference(invoiceId: number, memberId?: number) {
  if (!Number.isSafeInteger(invoiceId) || invoiceId < 1)
    throw new Error("Mã hóa đơn không hợp lệ.");
  if (
    memberId !== undefined &&
    (!Number.isSafeInteger(memberId) || memberId < 1)
  )
    throw new Error("Mã thành viên không hợp lệ.");
  const reference =
    memberId === undefined
      ? `SPORTIVA HD${invoiceId}`
      : `HD${invoiceId} TV${memberId}`;
  if (reference.length > 25)
    throw new Error("Mã thanh toán vượt độ dài cho phép, không thể tự cắt mã.");
  return reference;
}
/** Nội dung không dấu: giữ nguyên mã hóa đơn/thành viên, chỉ rút gọn tên khi cần.
 * Trường nội dung 62.08 tối đa 25 ký tự; không cắt mã đối soát để nhét tên.
 * Tên đầy đủ vẫn được hiển thị ở chi tiết hóa đơn, tên trong QR được báo rõ nếu rút gọn.
 */
export function transferContent(
  invoiceId: number,
  memberId: number,
  memberName: string,
) {
  const reference = transferReference(invoiceId, memberId);
  const words = memberName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length)
    throw new Error("Chưa có tên thành viên hợp lệ để tạo nội dung QR.");
  const available = 25 - reference.length - 1;
  let name = words.join(" ");
  if (name.length > available)
    name = words.map((w, i) => (i === words.length - 1 ? w : w[0])).join(" ");
  if (name.length > available || available < 1)
    throw new Error(
      "Mã và tên thành viên quá dài để tạo QR. Vui lòng liên hệ lễ tân; không tự cắt mã thanh toán.",
    );
  return reference + " " + name;
}
export function buildVietQr(
  config: BankConfig,
  amount: number,
  invoiceId: number,
  memberId?: number,
  memberName?: string,
) {
  validateBank(config);
  if (!Number.isSafeInteger(amount) || amount < 1 || String(amount).length > 13)
    throw new Error("Số tiền QR phải là số nguyên dương VND hợp lệ.");
  const beneficiary =
    field("00", config.bankBin) + field("01", config.accountNo);
  const provider =
    field("00", "A000000727") +
    field("01", beneficiary) +
    field("02", "QRIBFTTA");
  const payload =
    field("00", "01") +
    field("01", "12") +
    field("38", provider) +
    field("53", "704") +
    field("54", String(amount)) +
    field("58", "VN") +
    field(
      "62",
      field(
        "08",
        memberName && memberId
          ? transferContent(invoiceId, memberId, memberName)
          : transferReference(invoiceId, memberId),
      ),
    ) +
    "6304";
  return payload + crc16(payload);
}

/** QR minh họa chỉ chứa văn bản, không có tài khoản ngân hàng và không chuyển tiền. */
export function buildPreviewQr(
  amount: number,
  invoiceId: number,
  memberId?: number,
  memberName?: string,
) {
  if (!Number.isSafeInteger(amount) || amount < 1)
    throw new Error("Số tiền hóa đơn không hợp lệ.");
  transferReference(invoiceId, memberId);
  return (
    "SPORTIVA PREVIEW | HD" +
    invoiceId +
    (memberId === undefined ? "" : " TV" + memberId) +
    " | " +
    amount +
    " VND" +
    (memberName && memberId
      ? " | " + transferContent(invoiceId, memberId, memberName)
      : "") +
    " | NOT FOR PAYMENT"
  );
}
