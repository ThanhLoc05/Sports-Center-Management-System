package com.sportscenter.management.payment;

import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import com.sportscenter.management.service.impl.MembershipOrderService;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Không gọi SePay thật: kiểm thử xác thực, đối soát đúng đơn và chống cộng tiền trùng. */
// TẠO MỚI: SepayWebhookServiceTest — Kiểm thử sai khóa, sai đơn/tài khoản, tiền thiếu/đủ và giao dịch gửi lại; không gọi ngân hàng thật.
class SepayWebhookServiceTest {
    private final PaymentIntegrationProperties config = new PaymentIntegrationProperties();
    private final BankPaymentEventRepository events = mock(BankPaymentEventRepository.class);
    private final InvoiceRepository invoices = mock(InvoiceRepository.class);
    private final MembershipOrderRepository orders = mock(MembershipOrderRepository.class);
    private final MembershipOrderService memberships = mock(MembershipOrderService.class);
    private final SepayWebhookService service = new SepayWebhookService(config, events, invoices, orders, memberships);
    private final LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")).withNano(0);
    private MembershipOrder order;
    private static final String KEY = "test-only-32-character-webhook-secret";

    @BeforeEach void setUp() {
        config.setWebhookEnabled(true); config.setSepayApiKey(KEY);
        order = MembershipOrder.builder().id(20).memberId(4).paymentMethod("BANK_TRANSFER").status("PENDING_PAYMENT")
                .createdAt(now.minusMinutes(10)).bankAccountNoSnapshot("0000000000").bankGatewaySnapshot("Vietcombank").build();
        when(invoices.findById(30)).thenReturn(Optional.of(Invoice.builder().id(30).membershipOrderId(20).memberId(4).amount(new BigDecimal("800000")).build()));
        when(orders.findByIdForUpdate(20)).thenReturn(Optional.of(order));
        when(events.receivedTotal(30)).thenReturn(new BigDecimal("800000"));
    }

    private SepayWebhookRequest event(long id, String content, String account, String direction, int amount) {
        return new SepayWebhookRequest(id, "Vietcombank", now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")), account, content, direction, BigDecimal.valueOf(amount), "TEST-REF");
    }
    private SepayWebhookRequest valid() { return event(100, "HD30 TV4 NGUYEN VAN AN", "0000000000", "in", 800000); }

    @Test void onlyStrongConfiguredKeyIsAccepted() {
        assertDoesNotThrow(() -> service.authenticate("Apikey " + KEY));
        assertEquals(401, assertThrows(ResponseStatusException.class, () -> service.authenticate("Apikey wrong")).getStatusCode().value());
        assertThrows(ResponseStatusException.class, () -> service.authenticate(null));
        config.setSepayApiKey("");
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> service.authenticate("Apikey ")).getStatusCode().value());
        verifyNoInteractions(events, invoices, orders, memberships);
    }
    @Test void disabledIntegrationNeverAcceptsEvenTheCorrectKey() {
        config.setWebhookEnabled(false);
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> service.authenticate("Apikey " + KEY)).getStatusCode().value());
    }
    /** Mẫu thử dù chứa đúng mã đơn và đủ tiền vẫn không được ghi nhận thành giao dịch thật. */
    @Test void providerConnectionProbeCannotRecordMoneyOrActivateMembership() {
        service.authenticate("Apikey " + KEY);
        service.accept(event(0, "HD30 TV4 NGUYEN VAN AN", "0000000000", "in", 800000));
        verifyNoInteractions(events, invoices, orders, memberships);
    }
    @Test void exactReceiptIsStoredBeforeMembershipActivation() {
        service.accept(valid());
        var sequence = inOrder(events, memberships);
        sequence.verify(events).saveAndFlush(any());
        sequence.verify(events).receivedTotal(30);
        sequence.verify(memberships).confirmBankTransfer(20, "SEPAY-100");
    }
    @Test void outboundWrongAccountAndWrongMemberNeverActivate() {
        service.accept(event(100, "HD30 TV4", "0000000000", "out", 800000));
        service.accept(event(101, "HD30 TV4", "9999999999", "in", 800000));
        service.accept(event(102, "HD30 TV5", "0000000000", "in", 800000));
        verify(events, never()).saveAndFlush(any()); verifyNoInteractions(memberships);
    }
    @Test void wrongBankAndCashOrderNeverActivate() {
        SepayWebhookRequest v=valid();
        service.accept(new SepayWebhookRequest(v.id(), "MBBank", v.transactionDate(), v.accountNumber(), v.content(), "in", v.transferAmount(), v.referenceCode()));
        order.setPaymentMethod("CASH"); service.accept(valid());
        verify(events, never()).saveAndFlush(any()); verifyNoInteractions(memberships);
    }
    @Test void ambiguousAndIncompleteReferencesDoNotGuessTheOrder() {
        for(String memo: new String[]{"HD30 TV40", "HD30 TV4 HD31 TV4", "HD30", "Nguyen Van An", "XHD30 TV4", "HD30 TV4A"})
            service.accept(event(100, memo, "0000000000", "in", 800000));
        verify(events, never()).saveAndFlush(any()); verifyNoInteractions(memberships);
    }
    @Test void amountMismatchIsRecordedWithoutActivating() {
        when(events.receivedTotal(30)).thenReturn(new BigDecimal("500000"));
        service.accept(event(100, "HD30 TV4", "0000000000", "in", 500000));
        verify(events).saveAndFlush(any()); verifyNoInteractions(memberships);
    }
    @Test void twoPartialReceiptsCanCompleteOnlyWhenTheRecordedTotalMatches() {
        when(events.receivedTotal(30)).thenReturn(new BigDecimal("300000"), new BigDecimal("800000"));
        service.accept(event(100, "HD30 TV4", "0000000000", "in", 300000));
        verifyNoInteractions(memberships);
        service.accept(event(101, "HD30 TV4", "0000000000", "in", 500000));
        verify(memberships, times(1)).confirmBankTransfer(20, "SEPAY-101");
    }
    @Test void repeatedProviderEventDoesNotCountMoneyTwice() {
        service.accept(valid());
        ArgumentCaptor<BankPaymentEvent> capture=ArgumentCaptor.forClass(BankPaymentEvent.class);
        verify(events).saveAndFlush(capture.capture());
        when(events.findByProviderEventId(100L)).thenReturn(Optional.of(capture.getValue()));
        service.accept(valid());
        verify(events, times(1)).saveAndFlush(any()); verify(memberships, times(1)).confirmBankTransfer(anyInt(), anyString());
    }
    @Test void sameProviderIdWithDifferentAmountIsRejected() {
        service.accept(valid());
        ArgumentCaptor<BankPaymentEvent> capture=ArgumentCaptor.forClass(BankPaymentEvent.class);
        verify(events).saveAndFlush(capture.capture());
        when(events.findByProviderEventId(100L)).thenReturn(Optional.of(capture.getValue()));
        assertThrows(ResponseStatusException.class, () -> service.accept(event(100, "HD30 TV4 NGUYEN VAN AN", "0000000000", "in", 1)));
        verify(events, times(1)).saveAndFlush(any());
    }
    @Test void additionalTransferAfterConfirmationDoesNotRenewAgain() {
        order.setStatus("CONFIRMED"); service.accept(valid());
        ArgumentCaptor<BankPaymentEvent> capture=ArgumentCaptor.forClass(BankPaymentEvent.class);
        verify(events).saveAndFlush(capture.capture());
        assertEquals("REVIEW_REQUIRED", capture.getValue().getStatus()); verifyNoInteractions(memberships);
    }
    @Test void eventFromBeforeTheOrderOrFarInTheFutureCannotPayIt() {
        SepayWebhookRequest v=valid();
        for(LocalDateTime time:new LocalDateTime[]{now.minusDays(1),now.plusDays(1)})
            service.accept(new SepayWebhookRequest(v.id(),v.gateway(),time.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),v.accountNumber(),v.content(),v.transferType(),v.transferAmount(),v.referenceCode()));
        verifyNoInteractions(events, memberships);
    }
}
