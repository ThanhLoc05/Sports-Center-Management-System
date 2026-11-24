package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.MembershipPackageRequest;
import com.sportscenter.management.entity.MembershipPackage;
import com.sportscenter.management.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MembershipPackageBenefitsTest {
    private final MembershipPackageRepository packages = mock(MembershipPackageRepository.class);
    private final MembershipServiceImpl service = new MembershipServiceImpl(
            mock(MemberSubscriptionRepository.class), packages, mock(UserRepository.class),
            mock(InvoiceRepository.class), mock(MembershipOrderRepository.class));

    @BeforeEach
    void saveReturnsStoredPackage() {
        when(packages.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    private MembershipPackageRequest request(String level) {
        return MembershipPackageRequest.builder().packageName("Gói kiểm thử")
                .accessLevel(level).durationDays(30).price(new BigDecimal("800000")).build();
    }

    @Test
    void vipDefaultsIncludeAllSportsTwoClassesDiscountAndAmenitiesInDescription() {
        var response = service.createPackage(request("VIP"));
        assertNull(response.getSportLimit());
        assertEquals(2, response.getMaxConcurrentClasses());
        assertEquals(10, response.getCourseDiscountPercent());
        assertTrue(response.getDescription().contains("Khăn tập và nước uống miễn phí"));
        assertFalse(response.getDescription().contains("nhóm nhỏ"));
    }

    @Test
    void standardDefaultsAreOneSportOneClassAndNoDiscount() {
        var response = service.createPackage(request("STANDARD"));
        assertEquals(1, response.getSportLimit());
        assertEquals(1, response.getMaxConcurrentClasses());
        assertEquals(0, response.getCourseDiscountPercent());
    }

    @Test
    void createsAndReturnsExplicitBenefitSettingsAndKeepsManagerDescription() {
        var input = request("VIP");
        input.setAllSports(false);
        input.setSportLimit(2);
        input.setMaxConcurrentClasses(3);
        input.setCourseDiscountPercent(15);
        input.setDescription("Mô tả riêng của quản lý");
        var response = service.createPackage(input);
        assertEquals(2, response.getSportLimit());
        assertEquals(3, response.getMaxConcurrentClasses());
        assertEquals(15, response.getCourseDiscountPercent());
        assertEquals("Mô tả riêng của quản lý", response.getDescription());
    }

    @Test
    void editingDescriptionPreservesBenefitsAndAllSportsCanBeExplicitlySelected() {
        var stored = MembershipPackage.builder().id(7).accessLevel("STANDARD")
                .sportLimit(2).maxConcurrentClasses(3).courseDiscountPercent(5).build();
        when(packages.findById(7)).thenReturn(Optional.of(stored));
        var input = request("STANDARD");
        input.setDescription("Nội dung đã chỉnh sửa");
        var response = service.updatePackage(7, input);
        assertEquals(2, response.getSportLimit());
        assertEquals(3, response.getMaxConcurrentClasses());
        assertEquals(5, response.getCourseDiscountPercent());
        input.setAllSports(true);
        assertNull(service.updatePackage(7, input).getSportLimit());
    }

    @Test
    void catalogReturnsSavedSettingsRatherThanInferringThemFromNameOrPrice() {
        when(packages.findAll()).thenReturn(List.of(MembershipPackage.builder()
                .packageName("Tên có chữ VIP nhưng cấp STANDARD").accessLevel("STANDARD")
                .sportLimit(2).maxConcurrentClasses(4).courseDiscountPercent(7).build()));
        var response = service.getAllPackages().getFirst();
        assertEquals(2, response.getSportLimit());
        assertEquals(4, response.getMaxConcurrentClasses());
        assertEquals(7, response.getCourseDiscountPercent());
        assertEquals("STANDARD", response.getAccessLevel());
    }

    @Test
    void rejectsInvalidBenefitSettingsBeforeSaving() {
        var input = request("VIP");
        input.setCourseDiscountPercent(101);
        assertThrows(IllegalArgumentException.class, () -> service.createPackage(input));
        input.setCourseDiscountPercent(10);
        input.setMaxConcurrentClasses(0);
        assertThrows(IllegalArgumentException.class, () -> service.createPackage(input));
        input.setMaxConcurrentClasses(2);
        input.setSportLimit(-1);
        assertThrows(IllegalArgumentException.class, () -> service.createPackage(input));
        verify(packages, never()).save(any());
    }
}
