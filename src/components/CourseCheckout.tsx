import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useCourseFeature } from "../lib/course-feature";
import { trainingApi } from "../lib/training-api";
import { dateLabel, money, timeLabel } from "../lib/utils";
import { PaymentQr } from "./PaymentQr";
import { MemberRefundAction } from "./RefundRequests";
import { RefundForm, RefundReceipt } from "./RefundForm";
import {
  Badge,
  Button,
  Confirm,
  ErrorState,
  Loading,
  Modal,
  Notice,
  useToast,
} from "./ui";

export function CourseOrderDetail({
  orderId,
  onClose,
}: {
  orderId: number;
  onClose: () => void;
}) {
  const { session } = useAuth(),
    client = useQueryClient(),
    toast = useToast();
  const staff = session?.user.roleName !== "MEMBER";
  const { enabled: courseEnabled } = useCourseFeature();
  const [action, setAction] = useState<"cash" | "cancel" | "refund" | null>(
    null,
  );
  const query = useQuery({
    queryKey: ["course-order", orderId],
    queryFn: () => trainingApi.order(orderId),
    refetchInterval: (q) =>
      q.state.data?.status === "PENDING_PAYMENT" ? 5000 : false,
  });
  const refresh = async () => {
    await client.invalidateQueries();
  };
  const order = query.data;
  return (
    <Modal title="Đơn đăng ký khóa học" onClose={onClose} wide>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        order && (
          <>
            <div className="detail-grid">
              <div>
                <span>Khóa học</span>
                <strong>{order.courseName}</strong>
              </div>
              <div>
                <span>Học viên</span>
                <strong>
                  {order.memberName} · TV{order.memberId}
                </strong>
              </div>
              <div>
                <span>Trạng thái</span>
                <Badge status={order.status} />
              </div>
              <div>
                <span>Mã đối soát</span>
                <strong>{order.paymentReference}</strong>
              </div>
              <div>
                <span>Học phí</span>
                <strong>
                  {money(order.listPrice)}
                  {order.discountPercent > 0 &&
                    ` · Giảm ${order.discountPercent}%`}
                </strong>
              </div>
              <div>
                <span>Cần thanh toán</span>
                <strong>{money(order.amount)}</strong>
              </div>
            </div>
            {order.status === "PENDING_PAYMENT" && (
              <>
                {courseEnabled ? (
                  <>
                    <Notice>
                      Giữ chỗ đến {timeLabel(order.expiresAt)} ngày{" "}
                      {dateLabel(order.expiresAt)}. Lịch khóa được ghi danh sau khi
                      thanh toán được xác nhận.
                    </Notice>
                    {order.paymentMethod === "BANK_TRANSFER" ? (
                      order.bankAccount ? (
                        <PaymentQr
                          invoice={order.invoice}
                          bankAccount={order.bankAccount}
                          memberName={order.memberName}
                        />
                      ) : (
                        <Notice>
                          Đơn thiếu tài khoản nhận tiền. Vui lòng liên hệ lễ tân.
                        </Notice>
                      )
                    ) : (
                      <Notice>
                        Thanh toán tiền mặt tại quầy. Chỉ lễ tân hoặc quản lý được
                        xác nhận đã thu.
                      </Notice>
                    )}
                  </>
                ) : (
                  <Notice>
                    Đơn được giữ để đối soát. Vui lòng không thanh toán thêm và
                    liên hệ lễ tân nếu đã chuyển khoản.
                  </Notice>
                )}
                <div className="row-actions">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await query.refetch();
                      toast("Đã tải lại trạng thái từ hệ thống.");
                    }}
                  >
                    Kiểm tra trạng thái
                  </Button>
                  {courseEnabled && staff && order.paymentMethod === "CASH" && (
                    <Button onClick={() => setAction("cash")}>
                      Xác nhận đã thu tiền mặt
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setAction("cancel")}>
                    Hủy đơn chưa thanh toán
                  </Button>
                </div>
              </>
            )}
            {order.status === "CONFIRMED" && (
              <Notice>
                Đã thanh toán và ghi danh toàn khóa. Các buổi học đã có trong
                lịch cá nhân.
              </Notice>
            )}
            {["EXPIRED", "CANCELLED"].includes(order.status) && (
              <Notice>
                Đơn đã hết hiệu lực. Nếu đã chuyển tiền, liên hệ lễ tân để đối
                soát; không chuyển thêm vào đơn này.
              </Notice>
            )}
            {order.invoice.paymentStatus === "PAID" &&
              (staff ? (
                <Button variant="secondary" onClick={() => setAction("refund")}>
                  Xử lý hoàn học phí
                </Button>
              ) : (
                <MemberRefundAction invoice={order.invoice} onSent={refresh} />
              ))}
            {order.invoice.paymentStatus === "REFUNDED" && (
              <RefundReceipt invoice={order.invoice} />
            )}
            {action === "refund" && (
              <RefundForm
                invoice={order.invoice}
                onClose={() => setAction(null)}
                onSaved={refresh}
              />
            )}
            {(action === "cancel" || (courseEnabled && action === "cash")) && (
              <Confirm
                title={
                  action === "cash"
                    ? "Xác nhận đã nhận đủ tiền mặt?"
                    : "Hủy đơn khóa học?"
                }
                description={
                  action === "cash"
                    ? `${order.memberName} · ${money(order.amount)}. Hệ thống sẽ ghi danh toàn khóa.`
                    : "Chỉ hủy đơn chưa nhận chuyển khoản. Chỗ giữ sẽ được giải phóng."
                }
                onClose={() => setAction(null)}
                onConfirm={async () => {
                  if (action === "cash")
                    await trainingApi.confirm(order.id, order.version);
                  else await trainingApi.cancelOrder(order.id);
                  await refresh();
                  setAction(null);
                }}
              />
            )}
          </>
        )
      )}
    </Modal>
  );
}
