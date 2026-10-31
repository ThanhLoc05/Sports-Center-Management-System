package com.sportscenter.management.payment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/** GET cho người đăng nhập đọc tài khoản nhận tiền; chỉ quản lý được đổi/gỡ cấu hình. */
@RestController @RequiredArgsConstructor
@RequestMapping("/api/v1/payments/bank-account")
// TẠO MỚI: BankAccountController — API đọc/đổi/gỡ ngân hàng dùng chung; chỉ quản lý được sửa, người đã đăng nhập được đọc để thanh toán.
public class BankAccountController {
    private final BankAccountService service;
    @GetMapping @PreAuthorize("isAuthenticated()")
    public BankAccountService.Settings get() { return service.get(); }
    @PutMapping @PreAuthorize("hasRole('CENTER_MANAGER')")
    public BankAccountService.Settings put(@Valid @RequestBody BankAccountService.Change input) { return service.save(input); }
    @DeleteMapping @PreAuthorize("hasRole('CENTER_MANAGER')")
    public BankAccountService.Settings clear(@RequestParam @Min(0) int version) { return service.clear(version); }
}
