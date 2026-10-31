package com.sportscenter.management.payment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Objects;

/** Quản lý cấu hình ngân hàng thật trong SQL; không lấy STK nhận tiền do member gửi lên. */
@Service @RequiredArgsConstructor @Transactional
// TẠO MỚI: BankAccountService — Lưu cấu hình ngân hàng trong SQL; kiểm tra version để hai quản lý không ghi đè dữ liệu của nhau.
public class BankAccountService {
    private final CenterBankAccountRepository repository;
    // Version 0 dành cho chưa cấu hình; version API = version DB + 1 để client cũ không ghi đè lần tạo đầu.
    public record Settings(BankAccountData bankAccount, int version) {}
    public record Change(@NotNull @Valid BankAccountData bankAccount, @NotNull @Min(0) Integer version) {}

    @Transactional(readOnly = true)
    public Settings get() {
        return repository.findById(1).map(v -> new Settings(v.isEnabled() ? v.data() : null, v.getVersion() + 1))
                .orElseGet(() -> new Settings(null, 0));
    }

    public Settings save(Change input) {
        CenterBankAccount account = repository.findById(1).orElseGet(CenterBankAccount::new);
        int version = account.getVersion() == null ? 0 : account.getVersion() + 1;
        if (!Objects.equals(input.version(), version)) throw conflict();
        BankAccountData data = input.bankAccount().normalized();
        account.setId(1); account.setBankBin(data.bankBin()); account.setBankName(data.bankName());
        account.setAccountNo(data.accountNo()); account.setAccountName(data.accountName()); account.setGatewayName(data.gatewayName());
        account.setEnabled(true); account.setUpdatedAt(LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")));
        account = repository.saveAndFlush(account);
        return new Settings(account.data(), account.getVersion() + 1);
    }

    public Settings clear(int version) {
        CenterBankAccount account = repository.findById(1).orElseThrow(BankAccountService::conflict);
        if (!Objects.equals(version, account.getVersion() + 1)) throw conflict();
        account.setEnabled(false); account.setUpdatedAt(LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")));
        account = repository.saveAndFlush(account);
        return new Settings(null, account.getVersion() + 1);
    }

    public BankAccountData requireAccount() {
        BankAccountData data = get().bankAccount();
        if (data == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Trung tâm chưa cấu hình tài khoản nhận tiền. Vui lòng chọn tiền mặt hoặc liên hệ lễ tân.");
        return data;
    }

    private static ResponseStatusException conflict() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Cấu hình ngân hàng đã đổi. Tải lại trước khi lưu.");
    }
}
