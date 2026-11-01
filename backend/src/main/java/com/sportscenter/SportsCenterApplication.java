package com.sportscenter;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * ============================================================================
 * ĐIỂM KHỞI CHẠY CHÍNH CỦA HỆ THỐNG (APPLICATION ENTRY POINT)
 * ============================================================================
 * - scanBasePackages: Quét toàn bộ Spring Components từ package gốc 'com.sportscenter'
 * - EnableJpaRepositories: Khai báo tường minh package chứa các Repository JPA.
 */
@SpringBootApplication(scanBasePackages = "com.sportscenter")
// BỔ SUNG: đăng ký repository package payment để Spring tìm được các bảng ngân hàng/giao dịch/thông báo mới.
@EnableJpaRepositories(basePackages = {"com.sportscenter.management.repository", "com.sportscenter.management.payment"})
public class SportsCenterApplication {
    public static void main(String[] args) {
        SpringApplication.run(SportsCenterApplication.class, args);
    }
}
