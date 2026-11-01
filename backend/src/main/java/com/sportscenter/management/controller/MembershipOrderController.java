package com.sportscenter.management.controller;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.ConfirmMembershipOrderRequest;
import com.sportscenter.management.dto.Request.MembershipOrderRequest;
import com.sportscenter.management.dto.Response.MembershipOfferResponse;
import com.sportscenter.management.dto.Response.MembershipOrderResponse;
import com.sportscenter.management.service.impl.MembershipOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Nhận request cho quy trình mua/gia hạn có thu tiền: tạo đơn chờ, xem đơn,
 * rồi chỉ xác nhận khoản thu đã kiểm tra để kích hoạt kỳ gói.
 * BỔ SUNG: tiền mặt do nhân viên xác nhận; QR chỉ do webhook SePay hợp lệ kích hoạt, không xác nhận thủ công.
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class MembershipOrderController {
    private final MembershipOrderService orderService;
    private final SecurityUtils securityUtils;

    /**
     * Lấy danh mục gói hợp lệ cho màn hình checkout.
     * Chỉ trả gói đang ACTIVE có giá và thời hạn hợp lệ; chưa tạo đơn hay hóa đơn.
     */
    @GetMapping("/membership-packages")
    @PreAuthorize("isAuthenticated()")
    public List<MembershipOfferResponse> packages() {
        return orderService.getPackages();
    }

    /**
     * Tạo yêu cầu đăng ký/gia hạn và hóa đơn PENDING.
     * Kiểm tra MEMBER chỉ tạo cho chính mình; lễ tân/quản lý được hỗ trợ thành viên.
     * Idempotency-Key giúp gửi lại request sau lỗi mạng mà không tạo đơn/hóa đơn trùng.
     */
    @PostMapping("/membership-orders")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MembershipOrderResponse> create(
            @Valid @RequestBody MembershipOrderRequest request,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        Integer currentId = securityUtils.getCurrentUserId();
        if (currentId == null) return ResponseEntity.status(401).build();
        if (securityUtils.hasRole("MEMBER") && !currentId.equals(request.getMemberId())) {
            return ResponseEntity.status(403).build();
        }
        if (!securityUtils.hasRole("MEMBER") && !securityUtils.isReceptionist() && !securityUtils.isCenterManager()) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.status(201).body(orderService.create(request, idempotencyKey));
    }

    /**
     * Lấy danh sách đơn của thành viên hoặc danh sách toàn trung tâm cho nhân viên.
     * Quyền sở hữu và giới hạn memberId được kiểm tra tiếp trong MembershipOrderService.
     */
    @GetMapping("/membership-orders")
    @PreAuthorize("isAuthenticated()")
    public List<MembershipOrderResponse> list(@RequestParam(required = false) Integer memberId) {
        return orderService.list(memberId);
    }

    /**
     * Lấy chi tiết một đơn cùng snapshot gói, hóa đơn, mã chuyển khoản và trạng thái gói.
     * Thành viên chỉ xem đơn của mình; nhân viên được quyền xem để đối soát.
     */
    @GetMapping("/membership-orders/{orderId}")
    @PreAuthorize("isAuthenticated()")
    public MembershipOrderResponse detail(@PathVariable Integer orderId) {
        return orderService.detail(orderId);
    }

    /**
     * Xác nhận đã nhận đủ tiền mặt. Chuyển khoản QR chỉ được xác nhận qua webhook ngân hàng.
     * Chỉ lễ tân/quản lý gọi được; service cập nhật invoice và subscription cùng transaction.
     */
    @PostMapping("/membership-orders/{orderId}/confirm-payment")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public MembershipOrderResponse confirm(
            @PathVariable Integer orderId,
            @Valid @RequestBody ConfirmMembershipOrderRequest request,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        return orderService.confirm(orderId, request, idempotencyKey);
    }

}
