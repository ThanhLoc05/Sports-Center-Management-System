package com.sportscenter.management.payment;

import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Thông báo chỉ xuất hiện sau xác nhận; retry đơn không tạo thêm thông báo. */
// TẠO MỚI: MembershipNotificationServiceTest — Kiểm thử một đơn chỉ tạo một thông báo trong hệ thống, không gửi email.
class MembershipNotificationServiceTest {
    @Test void confirmationCreatesOnePersistentNotificationForTheCorrectMemberAndPackage() {
        var notifications=mock(MembershipNotificationRepository.class);var users=mock(UserRepository.class);
        var service=new MembershipNotificationService(notifications,users);
        when(users.findById(4)).thenReturn(Optional.of(User.builder().id(4).fullName("Nguyễn Văn An").build()));
        var order=MembershipOrder.builder().id(20).memberId(4).kind("RENEWAL").sourcePackageId(1).packageId(2).packageName("VIP TEST").build();
        var invoice=Invoice.builder().id(30).amount(new BigDecimal("5000")).build();
        var period=MemberSubscription.builder().startDate(LocalDate.now()).endDate(LocalDate.now().plusDays(29)).build();
        final MembershipNotification[] stored=new MembershipNotification[1];
        when(notifications.saveAndFlush(any())).thenAnswer(c->{stored[0]=c.getArgument(0);return stored[0];});
        assertNull(service.status(20));service.notifyConfirmed(order,invoice,period);
        assertEquals(4,stored[0].getMemberId());assertTrue(stored[0].getContent().contains("gia hạn với gói mới"));
        assertTrue(stored[0].getContent().contains("HD30 TV4"));assertTrue(stored[0].getContent().contains("5000 VND"));
        when(notifications.findByOrderId(20)).thenReturn(Optional.of(stored[0]));service.notifyConfirmed(order,invoice,period);
        verify(notifications,times(1)).saveAndFlush(any());assertEquals("SENT",service.status(20).notification().status());
    }
}
