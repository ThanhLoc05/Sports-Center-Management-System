package com.sportscenter.management.training;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.MemberRefundRequest;
import com.sportscenter.management.dto.Request.RefundRequest;
import com.sportscenter.management.dto.Response.InvoiceResponse;
import com.sportscenter.management.dto.Response.RefundQuote;
import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.payment.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import static com.sportscenter.management.training.TrainingModels.*;

@Service @RequiredArgsConstructor @Transactional
public class CourseOrderService {
    private final JdbcTemplate jdbc;
    private final TrainingAccessService access;
    private final TrainingProgramService programs;
    private final BankAccountService bankAccounts;
    private final BankPaymentEventRepository events;
    private final SecurityUtils security;

    public CourseOrder create(CourseOrderInput request,String key) {
        programs.lock();
        if(key==null || key.isBlank() || key.length()>100) throw new IllegalArgumentException("Thiếu mã chống tạo đơn trùng");
        int member=access.requireMember(request.memberId()),actor=security.getCurrentUserId();
        access.lockMember(member);
        String fingerprint=hash(request.courseId()+"|"+member+"|"+request.paymentMethod());
        var retry=jdbc.queryForList("SELECT id,request_fingerprint FROM course_orders WHERE created_by=? AND idempotency_key=?",actor,key);
        if(!retry.isEmpty()) {
            if(!fingerprint.equals(retry.getFirst().get("request_fingerprint"))) throw conflict("Mã tạo đơn đã dùng cho một yêu cầu khác");
            return detail(((Number)retry.getFirst().get("id")).intValue());
        }
        var course=programs.data("COURSE",request.courseId());
        var membership=access.requireAccess(member);
        if(programs.hasConfirmedCourse(course.id(),member)) throw conflict("Thành viên đã mua khóa học này");
        if(programs.hasPendingCourse(course.id(),member)) throw conflict("Khóa này đã có đơn chờ thanh toán. Hãy mở đơn hiện tại.");
        programs.requireCourse(course,membership,true);
        if(!Set.of("CASH","BANK_TRANSFER").contains(request.paymentMethod())) throw new IllegalArgumentException("Phương thức thanh toán không hợp lệ");
        int discount=course.discountEligible()?membership.discountPercent():0;
        BigDecimal amount=course.price().multiply(BigDecimal.valueOf(100-discount)).divide(BigDecimal.valueOf(100),0,RoundingMode.HALF_UP);
        if(amount.signum()==0 && "BANK_TRANSFER".equals(request.paymentMethod())) throw conflict("Khóa được miễn học phí; chọn xác nhận tại quầy thay cho chuyển khoản");
        BankAccountData bank="BANK_TRANSFER".equals(request.paymentMethod())?bankAccounts.requireAccount():null;
        LocalDateTime now=access.now(),expires=now.plusMinutes(15);
        int id=jdbc.queryForObject("""
                INSERT course_orders(course_id,member_id,subscription_id,course_name_snapshot,list_price,discount_percent,amount,payment_method,status,
                    idempotency_key,request_fingerprint,created_by,created_at,expires_at,bank_bin_snapshot,bank_name_snapshot,bank_account_no_snapshot,bank_account_name_snapshot,bank_gateway_snapshot)
                OUTPUT INSERTED.id VALUES(?,?,?,?,?,?,?,?,'PENDING_PAYMENT',?,?,?,?,?,?,?,?,?,?)
                """,Integer.class,course.id(),member,membership.subscriptionId(),course.name(),course.price(),discount,amount,request.paymentMethod(),
                key,fingerprint,actor,now,expires,bank==null?null:bank.bankBin(),bank==null?null:bank.bankName(),bank==null?null:bank.accountNo(),bank==null?null:bank.accountName(),bank==null?null:bank.gatewayName());
        jdbc.update("INSERT invoices(course_order_id,member_id,amount,currency,payment_method,payment_status,created_at) VALUES(?,?,?,'VND',?,'PENDING',?)",id,member,amount,request.paymentMethod(),now);
        return detail(id);
    }

    @Transactional(readOnly=true)
    public List<CourseOrder> list(Integer requestedMember) {
        Integer member=access.selectedMember(requestedMember);
        if(member==null && !security.isCenterManager() && !security.isReceptionist()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return jdbc.queryForList("SELECT id FROM course_orders WHERE (? IS NULL OR member_id=?) ORDER BY created_at DESC",Integer.class,member,member).stream().map(this::detail).toList();
    }

    @Transactional(readOnly=true)
    public CourseOrder detail(int id) {
        var row=order(id);
        int member=number(row,"member_id");
        if(!security.isOwnerOrAuthorized(member)) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Bạn chỉ được xem đơn khóa học của mình");
        InvoiceResponse invoice=invoiceForOrder(id);
        String memberName=jdbc.queryForObject("SELECT full_name FROM users WHERE user_id=?",String.class,member);
        BankAccountData bank=row.get("bank_account_no_snapshot")==null?null:new BankAccountData((String)row.get("bank_bin_snapshot"),(String)row.get("bank_name_snapshot"),(String)row.get("bank_account_no_snapshot"),(String)row.get("bank_account_name_snapshot"),(String)row.get("bank_gateway_snapshot"));
        return new CourseOrder(id,number(row,"course_id"),(String)row.get("course_name_snapshot"),member,memberName,number(row,"subscription_id"),
                (String)row.get("status"),(String)row.get("payment_method"),(BigDecimal)row.get("list_price"),number(row,"discount_percent"),(BigDecimal)row.get("amount"),
                time(row,"created_at"),time(row,"expires_at"),time(row,"confirmed_at"),number(row,"version"),invoice,reference(invoice.getId(),member),bank);
    }

    private Map<String,Object> order(int id) {
        var rows=jdbc.queryForList("SELECT * FROM course_orders WHERE id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Không tìm thấy đơn khóa học");
        return rows.getFirst();
    }

    public CourseOrder confirmCash(int id,int version) {
        if(!security.isCenterManager() && !security.isReceptionist()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        programs.lock();
        var row=order(id);
        if(!"CASH".equals(row.get("payment_method"))) throw conflict("Chuyển khoản chỉ được xác nhận từ giao dịch ngân hàng đã kiểm tra");
        if(number(row,"version")!=version && !"CONFIRMED".equals(row.get("status"))) throw conflict("Đơn đã thay đổi. Hãy tải lại.");
        confirm(id,false,null);
        return detail(id);
    }

    public CourseOrder reconcile(int id) {
        programs.lock();
        var row=order(id);
        if(!security.isOwnerOrAuthorized(number(row,"member_id"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        InvoiceResponse invoice=invoiceForOrder(id);
        if(!"BANK_TRANSFER".equals(row.get("payment_method")) || events.receivedTotal(invoice.getId()).compareTo(invoice.getAmount())!=0)
            throw conflict("Chưa có giao dịch ngân hàng đủ và đúng số tiền");
        confirm(id,true,"SEPAY-RECONCILE-"+invoice.getId());
        jdbc.update("UPDATE bank_payment_events SET status='APPLIED' WHERE invoice_id=? AND status='RECEIVED'",invoice.getId());
        return detail(id);
    }

    private void confirm(int id,boolean bank,String bankReference) {
        var row=order(id);
        if("CONFIRMED".equals(row.get("status"))) return;
        if(!"PENDING_PAYMENT".equals(row.get("status")) || !time(row,"expires_at").isAfter(access.now())) throw conflict("Đơn đã hết hạn giữ chỗ hoặc đã hủy");
        int member=number(row,"member_id"),courseId=number(row,"course_id");
        access.lockMember(member);
        var membership=access.requireAccess(member);
        var course=programs.data("COURSE",courseId);
        programs.requireCourse(course,membership,false);
        if(programs.hasConfirmedCourse(courseId,member)) throw conflict("Thành viên đã có ghi danh khóa học này");
        InvoiceResponse invoice=invoiceForOrder(id);
        if(!"PENDING".equals(invoice.getPaymentStatus()) || invoice.getAmount().compareTo((BigDecimal)row.get("amount"))!=0)
            throw conflict("Hóa đơn không khớp với đơn khóa học đang chờ");
        programs.bookProgramSessions("COURSE",courseId,member,course.startDate(),course.endDate());
        Integer actor=bank?null:security.getCurrentUserId();
        jdbc.update("UPDATE course_orders SET status='CONFIRMED',subscription_id=?,confirmed_at=?,confirmed_by=?,bank_transaction_id=?,version=version+1 WHERE id=?",
                membership.subscriptionId(),access.now(),actor,bankReference,id);
        jdbc.update("UPDATE invoices SET payment_status='PAID',paid_at=?,receptionist_id=? WHERE invoice_id=?",access.now(),actor,invoice.getId());
        programs.notifyMember("COURSE_CONFIRMED:"+id,course.createdBy(),member,"Đăng ký khóa học thành công",course.name()+". Học phí đã được xác nhận, lịch các buổi đã có trong lịch cá nhân.");
    }

    public CourseOrder cancel(int id) {
        programs.lock();
        var row=order(id);
        if(!security.isOwnerOrAuthorized(number(row,"member_id"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if(!"PENDING_PAYMENT".equals(row.get("status"))) throw conflict("Chỉ hủy được đơn khóa học chưa thanh toán");
        InvoiceResponse invoice=invoiceForOrder(id);
        if(events.receivedTotal(invoice.getId()).signum()>0) throw conflict("Đơn đã có chuyển khoản. Liên hệ lễ tân để đối soát.");
        jdbc.update("UPDATE course_orders SET status='CANCELLED',version=version+1 WHERE id=?",id);
        jdbc.update("UPDATE invoices SET payment_status='CANCELLED' WHERE invoice_id=? AND payment_status='PENDING'",invoice.getId());
        return detail(id);
    }

    /** Called only after SepayWebhookService has authenticated the provider request. */
    public void acceptBankTransfer(Invoice invoice,SepayWebhookRequest input) {
        programs.lock();
        int id=invoice.getCourseOrderId();
        var row=order(id);
        if(!"BANK_TRANSFER".equals(row.get("payment_method")) || number(row,"member_id")!=invoice.getMemberId()
                || !Objects.equals(row.get("bank_account_no_snapshot"),input.accountNumber())
                || row.get("bank_gateway_snapshot")==null || !((String)row.get("bank_gateway_snapshot")).equalsIgnoreCase(input.gateway())) return;
        LocalDateTime bankDate;
        try { bankDate=LocalDateTime.parse(input.transactionDate(),DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")); }
        catch(RuntimeException error) { throw new IllegalArgumentException("Thời gian giao dịch ngân hàng không hợp lệ"); }
        if(bankDate.isBefore(time(row,"created_at").withNano(0)) || bankDate.isAfter(access.now().plusMinutes(5))) return;
        String fingerprint=hash(input.id()+"|"+input.gateway()+"|"+input.accountNumber()+"|"+input.transferType()+"|"+input.transferAmount().stripTrailingZeros().toPlainString()+"|"+input.content()+"|"+input.transactionDate());
        var duplicate=events.findByProviderEventId(input.id());
        if(duplicate.isPresent()) {
            if(!fingerprint.equals(duplicate.get().getPayloadFingerprint())) throw conflict("Mã giao dịch đã dùng với dữ liệu khác");
            return;
        }
        var event=new BankPaymentEvent();
        event.setProviderEventId(input.id()); event.setInvoiceId(invoice.getId()); event.setAmount(input.transferAmount());
        event.setPayloadFingerprint(fingerprint);event.setTransferContent(input.content());event.setBankReference(input.referenceCode());
        event.setTransactionAt(bankDate);event.setReceivedAt(access.now());
        event.setStatus("PENDING_PAYMENT".equals(row.get("status")) && time(row,"expires_at").isAfter(access.now())?"RECEIVED":"REVIEW_REQUIRED");
        events.saveAndFlush(event);
        if(!"RECEIVED".equals(event.getStatus()) || events.receivedTotal(invoice.getId()).compareTo(invoice.getAmount())!=0) return;
        // Keep authenticated funds in the ledger even if eligibility changed while payment was pending.
        try {
            access.lockMember(number(row,"member_id"));
            programs.requireCourse(programs.data("COURSE",number(row,"course_id")),access.requireAccess(number(row,"member_id")),false);
            if(!time(row,"expires_at").isAfter(access.now())) throw conflict("Đơn đã hết hạn giữ chỗ");
        } catch(ResponseStatusException | IllegalArgumentException businessConflict) {
            event.setStatus("REVIEW_REQUIRED"); events.save(event); return;
        }
        confirm(id,true,"SEPAY-"+input.id()); event.setStatus("APPLIED");
        events.save(event);
    }

    public void expirePendingOrders() {
        programs.lock();
        jdbc.update("UPDATE course_orders SET status='EXPIRED',version=version+1 WHERE status='PENDING_PAYMENT' AND expires_at<=?",access.now());
        jdbc.update("UPDATE i SET payment_status='CANCELLED' FROM invoices i JOIN course_orders o ON o.id=i.course_order_id WHERE o.status='EXPIRED' AND i.payment_status='PENDING' AND NOT EXISTS(SELECT 1 FROM bank_payment_events b WHERE b.invoice_id=i.invoice_id)");
    }

    public RefundQuote quoteRefund(int invoiceId) {
        var invoice=invoice(invoiceId);var row=order(invoice.getCourseOrderId());
        if(!security.isOwnerOrAuthorized(invoice.getMemberId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if(!"CONFIRMED".equals(row.get("status")) || !"PAID".equals(invoice.getPaymentStatus()) || invoice.getRefundedAt()!=null || invoice.getAmount().signum()<=0)
            throw conflict("Chỉ hoàn hóa đơn khóa học đã thanh toán, chưa hoàn");
        var course=programs.data("COURSE",number(row,"course_id"));
        LocalDate registered=time(row,"created_at").toLocalDate();
        long age=ChronoUnit.DAYS.between(registered,access.today());
        int percent;
        if("CANCELLED".equals(course.status())) percent=100;
        else if(invoice.getRefundRequestedAt()!=null) {
            return new RefundQuote(registered,registered.plusDays(2),invoice.getRefundRequestedPercent(),invoice.getRefundRequestedAmount());
        } else {
            LocalDateTime first=jdbc.queryForObject("SELECT MIN(schedule_time) FROM classes WHERE course_id=? AND status<>'CANCELLED'",LocalDateTime.class,course.id());
            if(first==null || !first.isAfter(access.now()) || age<0 || age>2) throw conflict("Tự động hoàn khóa chỉ áp dụng trước khai giảng và trong 3 ngày từ lúc đăng ký");
            percent=age==0?100:90;
        }
        BigDecimal amount=invoice.getAmount().multiply(BigDecimal.valueOf(percent)).divide(BigDecimal.valueOf(100),0,RoundingMode.HALF_UP);
        return new RefundQuote(registered,"CANCELLED".equals(course.status())?access.today():registered.plusDays(2),percent,amount);
    }

    public InvoiceResponse requestRefund(int invoiceId,MemberRefundRequest request) {
        programs.lock();
        var invoice=invoice(invoiceId);
        if(!Objects.equals(security.getCurrentUserId(),invoice.getMemberId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if(invoice.getRefundRequestedAt()!=null) throw conflict("Hóa đơn đã có yêu cầu hoàn tiền");
        RefundQuote quote=quoteRefund(invoiceId);
        if(quote.amount().compareTo(request.expectedAmount())!=0) throw conflict("Mức hoàn đã thay đổi. Vui lòng tải lại.");
        jdbc.update("UPDATE invoices SET refund_requested_at=?,refund_request_reason=?,refund_requested_amount=?,refund_requested_percent=? WHERE invoice_id=?",access.now(),request.reason().trim(),quote.amount(),quote.percent(),invoiceId);
        return invoice(invoiceId);
    }

    public InvoiceResponse refund(int invoiceId,RefundRequest request) {
        programs.lock();
        if(!security.isCenterManager() && !security.isReceptionist()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        var invoice=invoice(invoiceId);var row=order(invoice.getCourseOrderId());
        RefundQuote quote=quoteRefund(invoiceId);
        if(!request.returned() || !"CASH".equals(request.method()) || !reference(invoiceId,invoice.getMemberId()).equals(request.reference()) || quote.amount().compareTo(request.expectedAmount())!=0)
            throw conflict("Cần xác nhận đã hoàn đúng số tiền và mã hóa đơn tại quầy");
        jdbc.update("UPDATE invoices SET payment_status='REFUNDED',refunded_amount=?,refunded_at=?,refund_reason=?,refund_method='CASH',refund_reference=?,refunded_by=? WHERE invoice_id=?",
                quote.amount(),access.now(),request.reason().trim(),request.reference(),security.getCurrentUserId(),invoiceId);
        jdbc.update("UPDATE course_orders SET status='REFUNDED',version=version+1 WHERE id=?",row.get("id"));
        programs.cancelMemberSessions("COURSE",number(row,"course_id"),invoice.getMemberId());
        programs.notifyMember("COURSE_REFUNDED:"+row.get("id"),programs.data("COURSE",number(row,"course_id")).createdBy(),invoice.getMemberId(),"Đã hoàn học phí khóa học","Đã ghi nhận hoàn "+quote.amount()+" VND cho khóa "+row.get("course_name_snapshot")+". Gói thành viên vẫn được giữ nguyên.");
        return invoice(invoiceId);
    }

    private InvoiceResponse invoiceForOrder(int id) {
        Integer invoice=jdbc.queryForObject("SELECT invoice_id FROM invoices WHERE course_order_id=?",Integer.class,id);
        return invoice(invoice);
    }
    public InvoiceResponse invoice(int id) {
        var rows=jdbc.query("SELECT * FROM invoices WHERE invoice_id=?",(rs,n)->InvoiceResponse.builder()
                .id(id).courseOrderId((Integer)rs.getObject("course_order_id")).membershipOrderId((Integer)rs.getObject("membership_order_id"))
                .memberId(rs.getInt("member_id")).subscriptionId((Integer)rs.getObject("subscription_id")).receptionistId((Integer)rs.getObject("receptionist_id"))
                .amount(rs.getBigDecimal("amount")).currency(rs.getString("currency")).paymentMethod(rs.getString("payment_method")).paymentStatus(rs.getString("payment_status"))
                .createdAt(rs.getTimestamp("created_at").toLocalDateTime()).paidAt(rs.getTimestamp("paid_at")==null?null:rs.getTimestamp("paid_at").toLocalDateTime())
                .refundRequestedAt(rs.getTimestamp("refund_requested_at")==null?null:rs.getTimestamp("refund_requested_at").toLocalDateTime())
                .refundRequestReason(rs.getString("refund_request_reason")).refundRequestedAmount(rs.getBigDecimal("refund_requested_amount")).refundRequestedPercent((Integer)rs.getObject("refund_requested_percent"))
                .refundedAt(rs.getTimestamp("refunded_at")==null?null:rs.getTimestamp("refunded_at").toLocalDateTime()).refundedAmount(rs.getBigDecimal("refunded_amount"))
                .refundReason(rs.getString("refund_reason")).refundMethod(rs.getString("refund_method")).refundReference(rs.getString("refund_reference")).refundedBy((Integer)rs.getObject("refunded_by")).build(),id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Không tìm thấy hóa đơn");
        return rows.getFirst();
    }

    private static int number(Map<String,Object> row,String key) { return ((Number)row.get(key)).intValue(); }
    private static LocalDateTime time(Map<String,Object> row,String key) { return row.get(key)==null?null:((java.sql.Timestamp)row.get(key)).toLocalDateTime(); }
    private static String reference(int invoice,int member) { return "HD"+invoice+" TV"+member; }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception error) { throw new IllegalStateException(error); }
    }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
}
