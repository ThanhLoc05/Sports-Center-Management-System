package com.sportscenter.membership;

import com.sportscenter.membership.dto.MembershipRequests;
import com.sportscenter.user.UserService;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class MembershipController {
    private final MembershipService service;
    private final UserService users;

    public MembershipController(MembershipService service, UserService users) {
        this.service = service;
        this.users = users;
    }

    @GetMapping("/memberships")
    public List<Map<String, Object>> memberships(@RequestParam(defaultValue = "true") boolean activeOnly) {
        return service.memberships(activeOnly);
    }

    @PostMapping("/memberships")
    @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> createMembership(@Valid @RequestBody MembershipRequests.MembershipRequest request) {
        return service.createMembership(request.name(), request.durationDays(), request.price(), request.description());
    }

    @GetMapping("/memberships/mine")
    @PreAuthorize("hasRole('MEMBER')")
    public List<Map<String, Object>> memberMemberships(@AuthenticationPrincipal UserDetails user) {
        return service.memberMemberships(user.getUsername());
    }

    @PostMapping("/memberships/subscribe")
    @PreAuthorize("hasAnyRole('MEMBER', 'RECEPTIONIST')")
    public Map<String, Object> subscribe(@AuthenticationPrincipal UserDetails user,
                                        @Valid @RequestBody MembershipRequests.SubscriptionRequest request) {
        boolean receptionist = user.getAuthorities().stream()
                .anyMatch(authority -> Objects.equals(authority.getAuthority(), "ROLE_RECEPTIONIST"));
        long memberId = receptionist ? requiredMemberId(request.memberId()) : users.memberId(user.getUsername());
        if (!receptionist && request.memberId() != null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Thành viên chỉ được đăng ký gói cho tài khoản của mình.");
        }
        return service.subscribe(memberId, request.membershipId(), request.paymentMethod(),
                receptionist ? user.getUsername() : null);
    }

    @GetMapping("/memberships/invoices/mine")
    @PreAuthorize("hasRole('MEMBER')")
    public List<Map<String, Object>> memberInvoices(@AuthenticationPrincipal UserDetails user) {
        return service.invoices(user.getUsername(), false);
    }

    @GetMapping("/invoices")
    @PreAuthorize("hasAnyRole('MANAGER', 'RECEPTIONIST')")
    public List<Map<String, Object>> invoices() {
        return service.invoices(null, true);
    }

    @GetMapping("/reports/revenue")
    @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> revenueReport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.revenueReport(from, to);
    }

    private long requiredMemberId(Long memberId) {
        if (memberId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lễ tân cần cung cấp memberId.");
        return memberId;
    }
}
