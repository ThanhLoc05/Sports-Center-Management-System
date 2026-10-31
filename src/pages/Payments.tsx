/**
 * FLOW 3 — HÓA ĐƠN, XÁC NHẬN THU TIỀN VÀ GHI NHẬN HOÀN TIỀN.
 * Tạo hóa đơn ở PENDING; xác nhận thu tiền mới chuyển PAID. Các lựa chọn phương thức
 * thanh toán chỉ ghi nhận phương thức, không tự thực hiện giao dịch ngân hàng.
 */
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CreditCard,
  FileText,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  MembershipOrders,
  MembershipOrderDetail,
} from "../components/MembershipCheckout";
import { transferReference } from "../lib/payment-qr";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useUsers } from "../lib/hooks";
import { api } from "../lib/api";

import { PaymentQr } from "../components/PaymentQr";
import { useDemoData } from "../lib/hooks";
import { usePermissions } from "../lib/hooks";
import type { Invoice } from "../lib/types";
import {
  dateLabel,
  downloadCsv,
  idLabel,
  matches,
  money,
  timeLabel,
} from "../lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  DataTable,
  ErrorState,
  ExportButton,
  Field,
  FormModal,
  Loading,
  MemberField,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  useToast,
} from "../components/ui";
export const methodLabels: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  CREDIT_CARD: "Thẻ tín dụng",
  VNPAY: "VNPay",
};
export default function Payments() {
  const { session } = useAuth();
  const can = usePermissions();
  const db = useDemoData();
  const [params] = useSearchParams();
  const member = session!.user.roleName === "MEMBER",
    manager = can("payments.refund"),
    demo = session!.mode === "demo";
  const users = useUsers();
  const [memberId, setMemberId] = useState(
    member ? String(session!.user.id) : params.get("memberId") || "",
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [create, setCreate] = useState(params.get("new") === "1" && !member);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [change, setChange] = useState<{
    invoice: Invoice;
    refund: boolean;
  } | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  /**
   * Có memberId: lấy lịch sử hóa đơn người đó. Không có memberId: API hiện chỉ
   * trả hóa đơn chờ thanh toán; tổng từ all bên dưới cũng chỉ phản ánh tập đã tải.
   */
  const query = useQuery({
    queryKey: ["invoices", memberId],
    queryFn: () => api.invoices(Number(memberId) || undefined),
  });
  const rows = (query.data || []).filter(
    (i) =>
      matches(
        search,
        idLabel(i.id, "HD"),
        users.data?.find((u) => u.id === i.memberId)?.fullName,
        i.memberId,
        transferReference(i.id, i.memberId),
      ) &&
      (status === "all" || i.paymentStatus === status) &&
      (method === "all" || i.paymentMethod === method),
  );
  const all = query.data || [];
  const sum = (s: string) =>
    all.filter((i) => i.paymentStatus === s).reduce((a, i) => a + i.amount, 0);
  return (
    <>
      <PageHeader
        eyebrow="CLARITY IN EVERY TRANSACTION"
        title={member ? "Hóa đơn của tôi" : "Thanh toán & hóa đơn"}
        description="Rõ ràng từng giao dịch. Chủ động trong mọi quyết định."
        actions={
          <>
            <ExportButton
              onClick={() =>
                downloadCsv("hoa-don-sportiva.csv", [
                  [
                    "Mã",
                    "ID thành viên",
                    "Số tiền",
                    "Phương thức",
                    "Trạng thái",
                    "Ngày tạo",
                  ],
                  ...rows.map((i) => [
                    idLabel(i.id, "HD"),
                    i.memberId,
                    i.amount,
                    methodLabels[i.paymentMethod],
                    i.paymentStatus,
                    i.createdAt,
                  ]),
                ])
              }
            />
            {can("payments.collect") && (
              <Button onClick={() => setCreate(true)}>
                <Plus size={17} />
                Tạo hóa đơn
              </Button>
            )}
          </>
        }
      />
      {!demo && (
        <MembershipOrders
          memberId={Number(memberId) || undefined}
          paymentPage
        />
      )}
      {member && (
        <Notice>
          Với hóa đơn chuyển khoản đang chờ, chọn “Thanh toán QR” để xem mã và
          nội dung. Nếu chưa có hóa đơn, liên hệ lễ tân lập hóa đơn cho gói đã
          đăng ký.
        </Notice>
      )}
      <div className="mini-stats">
        <div>
          <span className="mini-stat-icon green status-paid">
            <Wallet size={21} />
          </span>
          <div>
            <p>Đã thanh toán · danh sách hiện tại</p>
            <strong>{money(sum("PAID"))}</strong>
          </div>
        </div>
        <div>
          <span className="mini-stat-icon orange status-unpaid">
            <Receipt size={21} />
          </span>
          <div>
            <p>Đang chờ thanh toán</p>
            <strong>{money(sum("PENDING"))}</strong>
          </div>
        </div>
        <div>
          <span className="mini-stat-icon purple">
            <RotateCcw size={21} />
          </span>
          <div>
            <p>Đã hoàn tiền · danh sách hiện tại</p>
            <strong>{money(sum("REFUNDED"))}</strong>
          </div>
        </div>
      </div>
      {!demo && !member && !memberId && (
        <Notice>
          API hiện chỉ hỗ trợ danh sách hóa đơn chờ thanh toán hoặc lịch sử theo
          thành viên. Nhập ID thành viên để xem cả hóa đơn đã thanh toán và hoàn
          tiền.
        </Notice>
      )}
      <Panel>
        <div className="table-toolbar">
          <div>
            <h2>
              Danh sách hóa đơn<span className="count-chip">{rows.length}</span>
            </h2>
            <p>
              {!demo && !member && !memberId
                ? "Đang hiển thị các hóa đơn chờ thanh toán."
                : "Các giao dịch trong phạm vi đã chọn."}
            </p>
          </div>
          <div className="table-filters">
            {!member && (
              <label className="inline-id-field">
                <span>ID thành viên</span>
                <input
                  aria-label="Lọc hóa đơn theo ID thành viên"
                  type="number"
                  min="1"
                  placeholder="Tất cả"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                />
              </label>
            )}
            <Select
              label="Phương thức thanh toán"
              value={method}
              onChange={setMethod}
            >
              <option value="all">Tất cả phương thức</option>
              {Object.entries(methodLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="table-subtoolbar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm mã hóa đơn, thành viên..."
          />
          <Select
            label="Trạng thái hóa đơn"
            value={status}
            onChange={setStatus}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="PENDING">Chờ thanh toán</option>
            <option value="PAID">Đã thanh toán</option>
            <option value="REFUNDED">Đã hoàn tiền</option>
          </Select>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                key: "id",
                label: "Hóa đơn",
                render: (i) => (
                  <button className="invoice-id" onClick={() => setDetail(i)}>
                    <span>
                      <FileText size={16} />
                    </span>
                    {idLabel(i.id, "HD")}
                  </button>
                ),
              },
              {
                key: "member",
                label: "Thành viên",
                render: (i) => {
                  const u = users.data?.find((u) => u.id === i.memberId);
                  return (
                    <div className="person-cell">
                      <Avatar
                        name={u?.fullName || `TV ${i.memberId}`}
                        size="small"
                        index={i.memberId}
                      />
                      <span>
                        <strong>
                          {u?.fullName || `Thành viên #${i.memberId}`}
                        </strong>
                        <small>{idLabel(i.memberId)}</small>
                        <p>
                          Mã thanh toán:{" "}
                          <strong>{transferReference(i.id, i.memberId)}</strong>
                        </p>
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "amount",
                label: "Số tiền",
                render: (i) => (
                  <strong className="amount">{money(i.amount)}</strong>
                ),
              },
              {
                key: "method",
                label: "Phương thức",
                render: (i) => (
                  <span className="payment-method">
                    <CreditCard size={14} />
                    {methodLabels[i.paymentMethod] || i.paymentMethod}
                  </span>
                ),
              },
              {
                key: "date",
                label: "Ngày tạo",
                render: (i) => dateLabel(i.createdAt),
              },
              {
                key: "status",
                label: "Trạng thái",
                render: (i) => (
                  <div>
                    <Badge status={i.paymentStatus} />
                    {member &&
                      i.paymentStatus === "PENDING" &&
                      i.paymentMethod === "BANK_TRANSFER" && (
                        <button
                          className="btn btn-primary"
                          onClick={() => setDetail(i)}
                        >
                          Thanh toán QR
                        </button>
                      )}
                    {i.paymentStatus === "PENDING" && i.transferReportedAt && (
                      <small className="transfer-reported">
                        Đã báo chuyển khoản · chờ đối chiếu
                      </small>
                    )}
                  </div>
                ),
              },
              {
                key: "action",
                label: "Thao tác",
                render: (i) => (
                  <div className="row-actions">
                    <button
                      className="subtle-link"
                      onClick={() => setDetail(i)}
                    >
                      Chi tiết
                      <ArrowUpRight size={14} />
                    </button>
                    {i.membershipOrderId && (
                      <Link
                        to={`/payments?memberId=${i.memberId}&orderId=${i.membershipOrderId}`}
                      >
                        Xử lý yêu cầu gói
                      </Link>
                    )}
                    {can("payments.collect") &&
                      !i.membershipOrderId &&
                      i.paymentStatus === "PENDING" && (
                        <button
                          className="text-link"
                          onClick={() =>
                            setChange({ invoice: i, refund: false })
                          }
                        >
                          Thu tiền
                        </button>
                      )}
                    {manager &&
                      !i.membershipOrderId &&
                      i.paymentStatus === "PAID" && (
                        <button
                          className="text-danger"
                          onClick={() =>
                            setChange({ invoice: i, refund: true })
                          }
                        >
                          Hoàn tiền
                        </button>
                      )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Panel>
      {create && can("payments.collect") && (
        <FormModal
          title="Tạo hóa đơn mới"
          description="Kiểm tra thông tin và ghi nhận khoản thanh toán tại quầy."
          onClose={() => setCreate(false)}
          submitLabel="Tạo hóa đơn"
          onSubmit={async (d) => {
            /**
             * Tạo hóa đơn PENDING, gửi amount dạng số và người thu từ session. subscriptionId
             * là tùy chọn. Mở phiếu vừa tạo để xem, nhưng chưa xác nhận trung tâm đã thu tiền.
             */
            const invoice = await api.invoice({
              memberId: Number(d.get("memberId")),
              subscriptionId: d.get("subscriptionId")
                ? Number(d.get("subscriptionId"))
                : undefined,
              receptionistId: session!.user.id,
              amount: Number(d.get("amount")),
              paymentMethod: String(d.get("paymentMethod")),
              paymentStatus: "PENDING",
            });
            await client.invalidateQueries();
            toast("Đã tạo hóa đơn chờ thanh toán.");
            setDetail(invoice);
          }}
        >
          <MemberField
            users={users.data || []}
            defaultValue={Number(memberId) || undefined}
          />
          <Field
            label="ID đăng ký gói (nếu có)"
            hint="Để trống nếu thanh toán không gắn với một gói tập."
          >
            <input
              name="subscriptionId"
              type="number"
              min="1"
              placeholder="ID đăng ký gói thành viên"
            />
          </Field>
          <Field label="Số tiền (VND)">
            <input
              name="amount"
              type="number"
              min="1"
              max="1000000000"
              step="1"
              required
              placeholder="800000"
            />
          </Field>
          <Field label="Phương thức thanh toán">
            <select name="paymentMethod" required defaultValue="BANK_TRANSFER">
              {Object.entries(methodLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Notice>
            Hóa đơn được tạo ở trạng thái chờ thanh toán. Chỉ xác nhận đã thu
            tiền sau khi kiểm tra giao dịch thực tế.
          </Notice>
        </FormModal>
      )}
      {detail && (
        <InvoiceDetail
          key={detail.id}
          invoice={
            db?.invoices.find((i) => i.id === detail.id) ||
            query.data?.find((i) => i.id === detail.id) ||
            detail
          }
          name={
            users.data?.find((u) => u.id === detail.memberId)?.fullName ||
            `Thành viên #${detail.memberId}`
          }
          demo={demo}
          onClose={() => setDetail(null)}
        />
      )}
      {change &&
        can(change.refund ? "payments.refund" : "payments.collect") && (
          <Confirm
            className={change.refund ? "" : "payment-collection-dialog status-unpaid"}
            title={
              change.refund
                ? "Xác nhận hoàn tiền?"
                : "Xác nhận đã nhận thanh toán?"
            }
            description={`${idLabel(change.invoice.id, "HD")} · ${money(change.invoice.amount)}. ${change.refund ? "Thao tác này ghi nhận trạng thái hoàn tiền, không tự chuyển tiền về tài khoản ngân hàng." : "Chỉ xác nhận khi bạn đã kiểm tra trung tâm nhận đủ tiền."}`}
            danger={change.refund}
            onClose={() => setChange(null)}
            onConfirm={async () => {
              /**
               * Sau hộp thoại xác nhận mới gọi pay/refund. Nếu đang xem chính hóa đơn đó
               * thì cập nhật detail theo phản hồi server, rồi làm mới bảng và thống kê.
               */
              if (change.invoice.membershipOrderId)
                throw Error(
                  "Vui lòng xử lý hóa đơn này trong yêu cầu gói để đồng bộ thanh toán và kích hoạt.",
                );
              const updated = await api.pay(change.invoice.id, change.refund);
              if (detail?.id === updated.id) setDetail(updated);
              await client.invalidateQueries();
              toast(
                change.refund
                  ? "Đã ghi nhận hoàn tiền."
                  : "Đã xác nhận thanh toán.",
              );
            }}
          />
        )}
    </>
  );
}
/**
 * Dựng phiếu thu từ bản ghi hóa đơn. Nút in dùng chức năng trình duyệt để in/lưu PDF;
 * không phải endpoint xuất hóa đơn điện tử hay tích hợp cổng thanh toán.
 */
function InvoiceDetail({
  invoice: i,
  name,
  demo,
  onClose,
}: {
  invoice: Invoice;
  name: string;
  demo: boolean;
  onClose: () => void;
}) {
  // Hóa đơn gắn đơn gia hạn phải dùng đúng luồng của đơn, gồm tài khoản nhận tiền và trạng thái đối soát.
  // Không mở QR riêng từ cấu hình máy rồi làm sai thông tin của cùng một đơn trên màn hóa đơn.
  if (!demo && i.membershipOrderId)
    return (
      <MembershipOrderDetail orderId={i.membershipOrderId} onClose={onClose} />
    );
  return (
    <Modal className="invoice-detail-dialog" title="Chi tiết hóa đơn" onClose={onClose} wide>
      <PaymentQr invoice={i} />
      <div className="invoice-document" id="print-invoice">
        <div className="invoice-document-top">
          <div className="invoice-brand">
            sportiva<span>.</span>
            <small>SPORTS CENTER</small>
          </div>
          <div>
            <h3>PHIẾU THU</h3>
            <p>{idLabel(i.id, "HD")}</p>
            <Badge status={i.paymentStatus} />
          </div>
        </div>
        {demo && (
          <div className="invoice-demo-label">
            BẢN MINH HỌA · KHÔNG CÓ GIÁ TRỊ THANH TOÁN
          </div>
        )}
        <div className="detail-grid">
          <div>
            <span>Khách hàng</span>
            <strong>{name}</strong>
            <small>{idLabel(i.memberId)}</small>
          </div>
          <div>
            <span>Ngày lập</span>
            <strong>
              {dateLabel(i.createdAt)} · {timeLabel(i.createdAt)}
            </strong>
            <small>{methodLabels[i.paymentMethod] || i.paymentMethod}</small>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nội dung</th>
              <th className="text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {i.subscriptionId
                  ? `Thanh toán gói thành viên · Đăng ký #${i.subscriptionId}`
                  : "Dịch vụ trung tâm thể thao"}
              </td>
              <td className="text-right">{money(i.amount)}</td>
            </tr>
          </tbody>
        </table>
        <div className="invoice-total">
          <span>Tổng cộng</span>
          <strong>{money(i.amount)}</strong>
        </div>
        <div className="invoice-thanks">
          <strong>Cảm ơn bạn đã đồng hành cùng Sportiva.</strong>
          <p>Chúc bạn một hành trình tập luyện đầy năng lượng.</p>
          <small>
            Phiếu thu nội bộ · Không thay thế hóa đơn điện tử theo quy định.
          </small>
        </div>
      </div>
      <div className="modal-footer">
        <Button
          variant="secondary"
          onClick={() =>
            downloadCsv(`hoa-don-${i.id}.csv`, [
              [
                "Mã hóa đơn",
                "Khách hàng",
                "Số tiền",
                "Phương thức",
                "Trạng thái",
                "Ngày",
              ],
              [
                idLabel(i.id, "HD"),
                name,
                i.amount,
                methodLabels[i.paymentMethod],
                i.paymentStatus,
                i.createdAt,
              ],
            ])
          }
        >
          <ArrowDownToLine size={16} />
          Xuất CSV
        </Button>
        <Button onClick={() => window.print()}>
          <Printer size={16} />
          In / Lưu PDF
        </Button>
      </div>
    </Modal>
  );
}
