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
@EnableJpaRepositories(basePackages = "com.sportscenter.management.repository")
public class SportsCenterApplication {

    public static void main(String[] args) {
        SpringApplication.run(SportsCenterApplication.class, args);
    }
}