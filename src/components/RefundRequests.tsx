import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Invoice } from "../lib/types";
import { dateLabel, errorText, money, timeLabel } from "../lib/utils";
import { Button, DataTable, ErrorState, Field, FormModal, Loading, Notice, Panel, useToast } from "./ui";

// [FLOW 3] PHẦN YÊU CẦU HOÀN CỦA MEMBER: xem mức hoàn (refund-quote) và gửi yêu cầu hoàn.
export function MemberRefundAction({ invoice, onSent }: { invoice: Invoice; onSent: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const client = useQueryClient();
  const quote = useQuery({
    queryKey: ["member-refund-quote", invoice.memberId, invoice.id],
    // [FLOW 3] LẤY API: GET /payments/invoices/{id}/refund-quote - Member xem mức hoàn trước khi gửi yêu cầu.
    queryFn: () => api.refundQuote(invoice.id),
    retry: false,
    gcTime: 0,
  });
  const offer = quote.data;
  return <section className="membership-order-card membership-order-full">
    <h3>Hoàn tiền gói tập</h3>
    {quote.isPending ? <Loading /> : quote.error ? <Notice>{errorText(quote.error)}</Notice> : offer && <>
      <p>Mức hoàn hiện tại <strong>{money(offer.amount)} ({offer.percent}%)</strong>. Hạn gửi đến hết ngày {dateLabel(offer.lastRefundDate)}.</p>
      {/* [FLOW 3] NÚT "Yêu cầu hoàn tiền" (Member): mở form nhập lý do. */}
      <Button variant="secondary" onClick={() => setOpen(true)}>Yêu cầu hoàn tiền</Button>
    </>}
    {open && offer && <FormModal title="Yêu cầu hoàn tiền" description={`HĐ${invoice.id} · Mức hoàn ${money(offer.amount)} (${offer.percent}%)`}
      onClose={() => setOpen(false)} submitLabel="Gửi yêu cầu"
      onSubmit={async data => {
        const reason = String(data.get("reason") ?? "").trim();
        if (!reason) throw Error("Vui lòng nhập lý do hoàn tiền.");
        try {
          // [FLOW 3] GỌI API MEMBER GỬI YÊU CẦU HOÀN: POST /payments/invoices/{id}/refund-request (mức hoàn được chốt lúc gửi).
          await api.requestRefund(invoice.id, reason, offer.amount);
        } catch (error) {
          await Promise.all([quote.refetch(), onSent()]);
          throw error;
        }
        toast("Đã gửi yêu cầu hoàn tiền cho lễ tân và quản lý.");
        await Promise.all([onSent(), client.invalidateQueries({ queryKey: ["membership-orders"] })]);
      }}>
      <Field label="Lý do yêu cầu hoàn tiền"><textarea name="reason" required maxLength={500} /></Field>
    </FormModal>}
  </section>;
}

export function RefundRequestQueue() {
  const queue = useQuery({
    queryKey: ["pending-refund-requests"],
    // [FLOW 3] LẤY API: GET /payments/refund-requests - danh sách yêu cầu hoàn chờ lễ tân xử lý.
    queryFn: api.pendingRefundRequests,
    refetchInterval: 10000,
    retry: false,
  });
  // [FLOW 3] BẢNG "Yêu cầu hoàn tiền chờ xử lý" (Lễ tân/Quản lý) + NÚT "Tải lại yêu cầu": GET /payments/refund-requests.
  return <Panel title="Yêu cầu hoàn tiền chờ xử lý" action={<Button variant="secondary" onClick={() => void queue.refetch()}>Tải lại yêu cầu</Button>}>
    {queue.isPending ? <Loading /> : queue.error ? <ErrorState error={queue.error} retry={queue.refetch} /> :
      queue.data?.length ? <DataTable label="Yêu cầu hoàn tiền chờ xử lý" rows={queue.data} columns={[
        { key: "invoice", label: "Hóa đơn / thành viên", render: i => `HĐ${i.id} · TV${i.memberId}` },
        { key: "time", label: "Ngày gửi", render: i => `${timeLabel(i.refundRequestedAt!)} · ${dateLabel(i.refundRequestedAt!)}` },
        { key: "reason", label: "Lý do", render: i => i.refundRequestReason },
        { key: "amount", label: "Số tiền hoàn", render: i => money(i.refundRequestedAmount!) },
        { key: "action", label: "Thao tác", render: i => <Link to={`/payments?orderId=${i.membershipOrderId}`}>Xử lý yêu cầu</Link> },
      ]} /> : <Notice>Chưa có yêu cầu hoàn tiền chờ xử lý.</Notice>}
  </Panel>;
}
