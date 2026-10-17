package com.sportscenter;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * ============================================================================
 * ĐIỂM KHỞI CHẠY CHÍNH CỦA HỆ THỐNG (APPLICATION ENTRY POINT)
 * ============================================================================
 * Mọi cấu hình bảo mật chi tiết đã được chuyển về lớp SecurityConfig riêng biệt
 * tại package: com.sportscenter.auth.SecurityConfig
 */
@SpringBootApplication
public class SportsCenterApplication {

    public static void main(String[] args) {
        SpringApplication.run(SportsCenterApplication.class, args);
    }
}
