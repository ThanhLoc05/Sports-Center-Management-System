package com.sportscenter.management.payment;

import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.entity.MembershipOrder;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MembershipOrderRepository;
import com.sportscenter.management.service.impl.MembershipOrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Adapter SePay theo tài liệu nhà cung cấp. Endpoint công khai nhưng bắt buộc API key riêng.
 * Chỉ cộng tiền vào đã xác thực; so khớp cả hóa đơn, thành viên, tài khoản/ngân hàng chụp tại lúc tạo đơn.
 * Tất cả xử lý giao dịch/đơn nằm cùng transaction; không tin trạng thái hay số tiền từ frontend.
 */
@Service @RequiredArgsConstructor @Transactional
// TẠO MỚI: SepayWebhookService — Xác thực, ghép đúng hóa đơn/thành viên, kiểm tra tiền và chống xử lý trùng trước khi kích hoạt gói.
public class SepayWebhookService {
    private final PaymentIntegrationProperties properties;
    private final BankPaymentEventRepository events;
    private final InvoiceRepository invoices;
    private final MembershipOrderRepository orders;
    private final MembershipOrderService membershipOrders;
    private static final Pattern REFERENCE = Pattern.compile("(?<![A-Z0-9])HD([1-9][0-9]{0,9})\\s+TV([1-9][0-9]{0,9})(?![A-Z0-9])");

    /** So sánh hằng thời gian; bí mật trống/ngắn hoặc chưa bật kết nối đều từ chối trước khi xử lý body. */
    public void authenticate(String authorization) {
        if (!properties.ready()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Kết nối đối soát ngân hàng chưa được bật/cấu hình.");
        String expected = "Apikey " + properties.getSepayApiKey();
        if (authorization == null || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), authorization.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Webhook không được xác thực.");
    }

    public void accept(SepayWebhookRequest input) {
        // ID 0 là mẫu Gửi thử của SePay: chỉ kiểm tra kết nối, không lưu tiền hoặc kích hoạt gói.
        // Controller vẫn xác thực API key trước khi gọi tới đây, kể cả với mẫu thử.
        if (Long.valueOf(0).equals(input.id())) return;
        if (!"in".equals(input.transferType())) return;
        var matcher = REFERENCE.matcher(input.content().toUpperCase(Locale.ROOT));
        if (!matcher.find()) return; // Giao dịch không chứa mã thanh toán của hệ thống, không tự đoán đơn theo tên.
        int invoiceId, memberId;
        try { invoiceId = Integer.parseInt(matcher.group(1)); memberId = Integer.parseInt(matcher.group(2)); }
        catch (NumberFormatException invalid) { return; }
        if (matcher.find()) return; // Nội dung có nhiều mã đơn: không tự chọn một đơn để thu.
        Invoice invoice = invoices.findById(invoiceId).orElse(null);
        if (invoice == null || invoice.getMembershipOrderId() == null || !Integer.valueOf(memberId).equals(invoice.getMemberId())) return;
        MembershipOrder order = orders.findByIdForUpdate(invoice.getMembershipOrderId()).orElse(null);
        if (order == null || !"BANK_TRANSFER".equals(order.getPaymentMethod()) || !Integer.valueOf(memberId).equals(order.getMemberId())) return;
        if (order.getBankAccountNoSnapshot() == null || !order.getBankAccountNoSnapshot().equals(input.accountNumber())
                || order.getBankGatewaySnapshot() == null || !order.getBankGatewaySnapshot().equalsIgnoreCase(input.gateway())) return;
        LocalDateTime bankDate;
        try { bankDate = LocalDateTime.parse(input.transactionDate(), DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")); }
        catch (RuntimeException invalid) { throw new IllegalArgumentException("Thời gian giao dịch ngân hàng không hợp lệ"); }
        LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh"));
        if (order.getCreatedAt() == null || bankDate.isBefore(order.getCreatedAt().withNano(0)) || bankDate.isAfter(now.plusMinutes(5))) return;
        String fingerprint = fingerprint(input);
        BankPaymentEvent duplicate = events.findByProviderEventId(input.id()).orElse(null);
        if (duplicate != null) {
            if (!fingerprint.equals(duplicate.getPayloadFingerprint())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Mã giao dịch đã được dùng với dữ liệu khác.");
            return; // Retry của nhà cung cấp không cộng tiền, không gia hạn và không tạo thêm thông báo.
        }
        BankPaymentEvent event = new BankPaymentEvent();
        event.setProviderEventId(input.id()); event.setInvoiceId(invoiceId); event.setAmount(input.transferAmount());
        event.setPayloadFingerprint(fingerprint); event.setTransferContent(input.content()); event.setBankReference(input.referenceCode());
        event.setTransactionAt(bankDate); event.setReceivedAt(now);
        event.setStatus("PENDING_PAYMENT".equals(order.getStatus()) ? "RECEIVED" : "REVIEW_REQUIRED");
        events.saveAndFlush(event); // Unique ID kiểm tra ngay trước khi cấp thêm thời hạn.
        if (!"PENDING_PAYMENT".equals(order.getStatus())) return;
        BigDecimal total = events.receivedTotal(invoiceId);
        // Cho phép nhiều lần chuyển thiếu cộng đủ đúng hóa đơn; thừa tiền cần đối soát, không tự quyết định hoàn tiền.
        if (total.compareTo(invoice.getAmount()) == 0) {
            membershipOrders.confirmBankTransfer(order.getId(), "SEPAY-" + input.id());
            event.setStatus("APPLIED"); events.save(event);
        }
    }

    private static String fingerprint(SepayWebhookRequest input) {
        try {
            String canonical = input.id() + "|" + input.gateway() + "|" + input.accountNumber() + "|" + input.transferType()
                    + "|" + input.transferAmount().stripTrailingZeros().toPlainString() + "|" + input.content() + "|" + input.transactionDate();
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
