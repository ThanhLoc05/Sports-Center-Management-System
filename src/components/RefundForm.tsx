// [VAI TRÒ] LỄ TÂN ghi nhận hoàn tiền mặt cho hóa đơn.
import { useQuery } from "@tanstack/react-query";
import { transferReference } from "../lib/payment-qr";
import { api } from "../lib/api";
import type { Invoice } from "../lib/types";
import { dateLabel, errorText, money } from "../lib/utils";
import { Field, FormModal, Notice } from "./ui";

export function RefundForm({ invoice, onClose, onSaved }: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (invoice: Invoice) => Promise<void>;
}) {
  const quote = useQuery({
    queryKey: ["refund-quote", invoice.id],
    // [FLOW 3] LẤY API: GET /payments/invoices/{id}/refund-quote - mức hoàn và hạn hoàn để lễ tân đối chiếu.
    queryFn: () => api.refundQuote(invoice.id),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const offer = quote.data;
  const paymentReference = transferReference(invoice.id, invoice.memberId);
  return (
    // [FLOW 3] FORM "Ghi nhận hoàn tiền" (Lễ tân/Quản lý): chỉ hoàn TIỀN MẶT tại quầy; nhập lý do + mã HD.. TV.. + tick đã trả tiền; nút "Lưu xác nhận hoàn tiền".
    <FormModal title="Ghi nhận hoàn tiền" description={`Hóa đơn HĐ${invoice.id} · Đã thu ${money(invoice.amount)}`}
      onClose={onClose} submitLabel="Lưu xác nhận hoàn tiền" submitDisabled={!offer || quote.isFetching || quote.isError}
      onSubmit={async (data) => {
        if (!offer) return;
        const reason = String(data.get("reason") ?? "").trim();
        const reference = String(data.get("reference") ?? "").trim();
        if (!reason) throw Error("Vui lòng nhập lý do hoàn tiền.");
        if (reference !== paymentReference) throw Error("Mã thanh toán không khớp với hóa đơn đang hoàn.");
        // [FLOW 3] GỌI API HOÀN TIỀN: POST /payments/invoices/{id}/refund (method luôn là CASH).
        const result = await api.refund(invoice.id, {
          reason, reference, method: "CASH",
          returned: data.has("returned"), expectedAmount: offer.amount,
        });
        await onSaved(result);
      }}>
      {quote.isLoading && <Notice>Đang kiểm tra điều kiện hoàn tiền…</Notice>}
      {quote.error && <p role="alert" className="form-error">{errorText(quote.error)}</p>}
      {offer && !quote.error && <>
        <Notice>Ngày đăng ký {dateLabel(offer.registeredOn)} · Hạn hoàn đến hết {dateLabel(offer.lastRefundDate)}.
          {" "}Mức hoàn {invoice.refundRequestedAt ? "đã chốt khi thành viên gửi đơn" : "hiện tại"} <strong>{money(offer.amount)} ({offer.percent}%)</strong>.</Notice>
        <Field label="Lý do hoàn"><textarea name="reason" defaultValue={invoice.refundRequestReason} required maxLength={500} /></Field>
        {/* Trung tâm chỉ hoàn tiền mặt tại quầy: hiển thị cố định, không cho chọn chuyển khoản; backend cũng chỉ nhận CASH. */}
        <Field label="Phương thức trả tiền" hint="Trung tâm chỉ hoàn tiền mặt trực tiếp tại quầy.">
          <input value="Tiền mặt tại quầy" readOnly />
        </Field>
        <Field label="Mã thanh toán hóa đơn" hint={`Nhập đúng mã ${paymentReference} để xác nhận hóa đơn cần hoàn.`}>
          <input name="reference" required maxLength={120} autoComplete="off" placeholder="Nhập mã thanh toán hóa đơn" />
        </Field>
        <label className="check-option"><input type="checkbox" name="returned" required />
          Tôi xác nhận đã trả thành công {money(offer.amount)} tiền mặt cho thành viên.</label>
      </>}
    </FormModal>
  );
}

export function RefundReceipt({ invoice }: { invoice: Invoice }) {
  if (invoice.paymentStatus !== "REFUNDED") return null;
  return <div>
    <p><strong>Đã hoàn {money(invoice.refundedAmount ?? invoice.amount)}</strong></p>
    {invoice.refundMethod && <p>{invoice.refundMethod === "CASH" ? "Tiền mặt" : "Chuyển khoản"} · {invoice.refundReference === transferReference(invoice.id, invoice.memberId) ? "Mã thanh toán hóa đơn" : "Chứng từ"} {invoice.refundReference}</p>}
    {invoice.refundReason && <p>Lý do hoàn: {invoice.refundReason}</p>}
  </div>;
}
