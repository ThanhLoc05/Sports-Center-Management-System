package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "membership_packages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MembershipPackage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "package_id")
    private Integer id;

    @Column(name = "package_name", nullable = false)
    private String packageName;

    @Column(name = "duration_days", nullable = false)
    private Integer durationDays;

    @Column(name = "price", nullable = false, precision = 18, scale = 2)
    private BigDecimal price;

    @Column(name = "access_level", nullable = false)
    private String accessLevel;

    @Column(name = "description")
    private String description;

    @Column(name = "status", nullable = false)
    private String status;
}
