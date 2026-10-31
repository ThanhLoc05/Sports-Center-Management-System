import { useState } from "react";
import type { MembershipOrder } from "../lib/membership-checkout";
import { dateLabel } from "../lib/utils";
import { Button, Notice, Panel, useToast } from "./ui";

/** Thông báo trong website lấy theo đơn đã xác nhận; sao chép chỉ giúp lễ tân báo lại cho thành viên. */
export function MembershipDelivery({
  order,
  memberName,
  staff = false,
  compact = false,
}: {
  order: MembershipOrder;
  memberName?: string;
  staff?: boolean;
  compact?: boolean;
}) {
  const toast = useToast();
  const [copying, setCopying] = useState(false);
  if (order.status !== "CONFIRMED" || !order.subscription) return null;
  const action =
    order.kind === "NEW"
      ? "đăng ký gói mới"
      : order.sourcePackageId === order.package.id
        ? "gia hạn gói hiện tại"
        : "gia hạn với gói mới";
  const message = `Thành viên ${memberName || "TV" + order.memberId} (TV${order.memberId}) đã ${action} thành công: ${order.package.name}. Thời hạn: ${dateLabel(order.subscription.startDate)} – ${dateLabel(order.subscription.endDate)}. Mã thanh toán: ${order.paymentReference}.`;
  return (
    <Panel title="Thông báo xác nhận gói">
      {!compact && <p>{message}</p>}
      <p>
        {order.delivery?.notification?.status === "SENT"
          ? "Đã lưu thông báo trong hệ thống"
          : "Chưa có trạng thái thông báo từ hệ thống"}
      </p>
      {staff && (
        <Button
          variant="secondary"
          loading={copying}
          onClick={async () => {
            setCopying(true);
            try {
              await navigator.clipboard.writeText(message);
              toast("Đã sao chép nội dung để báo thành viên.");
            } catch {
              toast(
                "Không sao chép được. Bạn có thể chọn nội dung hiển thị.",
                "error",
              );
            } finally {
              setCopying(false);
            }
          }}
        >
          Sao chép nội dung báo thành viên
        </Button>
      )}
    </Panel>
  );
}

/** Theo dõi giao dịch ngân hàng, chỉ backend được xác nhận đã nhận tiền cho đơn QR. */
export function TransferVerification({ order }: { order: MembershipOrder }) {
  const verification = order.bankTransfer;
  const labels = {
    WAITING: "Chờ nhận chuyển khoản",
    PROCESSING: "Đang đối soát giao dịch",
    AMOUNT_MISMATCH: "Số tiền nhận chưa khớp hóa đơn",
    FAILED: "Chưa xác minh được giao dịch",
  };
  return (
    <Panel title="Theo dõi chuyển khoản">
      <p role="status" aria-label="Trạng thái đối soát chuyển khoản">
        {verification
          ? labels[verification.status]
          : "Chờ kết quả xác nhận chuyển khoản từ hệ thống"}
      </p>
      {verification?.receivedAmount !== undefined && (
        <p>
          Số tiền hệ thống ghi nhận:{" "}
          {verification.receivedAmount.toLocaleString("vi-VN")}đ.
        </p>
      )}
      {verification?.transactionId && (
        <p>Mã giao dịch: {verification.transactionId}</p>
      )}
      <Notice>
        {verification && verification.automationEnabled !== false
          ? "Đơn chỉ hoàn thành khi backend xác nhận đã nhận đủ tiền và ghi nhận gói thành công."
          : "Xác nhận chuyển khoản tự động đang chờ kết nối. Giao diện sẽ tự cập nhật khi backend trả kết quả; lễ tân không xác nhận tiền mặt cho đơn QR."}
      </Notice>
      {verification?.status === "AMOUNT_MISMATCH" && (
        <p>
          Liên hệ lễ tân để kiểm tra khoản chuyển. Chưa chuyển lại toàn bộ số
          tiền khi chưa được hướng dẫn.
        </p>
      )}
    </Panel>
  );
}
