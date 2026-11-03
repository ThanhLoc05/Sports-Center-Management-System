package com.sportscenter.management.payment;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;
import java.time.LocalDateTime;

/** Một cấu hình dùng chung (ID=1). Đơn đã tạo giữ bản chụp riêng, không bị đổi tài khoản theo cài đặt mới. */
@Entity
@Table(name = "center_bank_account")
@Getter @Setter @NoArgsConstructor
// TẠO MỚI: CenterBankAccount — Entity cấu hình ngân hàng duy nhất của trung tâm; đơn đã tạo dùng snapshot riêng.
public class CenterBankAccount {
    @Id private Integer id;
    @Column(name = "bank_bin", length = 6, nullable = false) private String bankBin;
    @Nationalized @Column(name = "bank_name", length = 100, nullable = false) private String bankName;
    @Column(name = "account_no", length = 19, nullable = false) private String accountNo;
    @Nationalized @Column(name = "account_name", length = 100, nullable = false) private String accountName;
    @Column(name = "gateway_name", length = 100, nullable = false) private String gatewayName;
    @Column(nullable = false) private boolean enabled;
    @Version @Column(nullable = false) private Integer version;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;

    public BankAccountData data() { return new BankAccountData(bankBin, bankName, accountNo, accountName, gatewayName); }
}
