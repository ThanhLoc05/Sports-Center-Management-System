package com.sportscenter.management.payment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Chỉ là tài khoản nhận tiền công khai, không chứa API key/mật khẩu ngân hàng. */
// TẠO MỚI: BankAccountData — DTO chứa tài khoản nhận tiền; kiểm tra định dạng và chuẩn hóa tên ngân hàng trước khi lưu/chụp vào đơn.
public record BankAccountData(
        @NotBlank @Pattern(regexp = "[0-9]{6}") String bankBin,
        @NotBlank @Size(max = 100) String bankName,
        @NotBlank @Pattern(regexp = "[0-9]{6,19}") String accountNo,
        @NotBlank @Size(max = 100) String accountName,
        @Size(max = 100) String gatewayName) {
    public BankAccountData normalized() {
        return new BankAccountData(bankBin.trim(), bankName.trim(), accountNo.trim(), accountName.trim(),
                gatewayName == null || gatewayName.isBlank() ? bankName.trim() : gatewayName.trim());
    }
}
