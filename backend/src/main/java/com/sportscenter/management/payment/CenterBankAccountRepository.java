package com.sportscenter.management.payment;

import org.springframework.data.jpa.repository.JpaRepository;

/** Version của entity giúp chặn hai quản lý ghi đè cấu hình cùng lúc. */
// TẠO MỚI: CenterBankAccountRepository — Repository JPA của cấu hình ngân hàng; version hỗ trợ phát hiện cập nhật đồng thời.
public interface CenterBankAccountRepository extends JpaRepository<CenterBankAccount, Integer> {}
