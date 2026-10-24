package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Integer id;

    @Column(name = "email", nullable = false, unique = true)
    @Nationalized
    private String email;

    @Column(name = "password_hash", nullable = false)
    @Nationalized
    private String passwordHash;

    @Column(name = "full_name", nullable = false)
    @Nationalized
    private String fullName;

    @Column(name = "phone", nullable = false, unique = true)
    @Nationalized
    private String phone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "role_id", nullable = false)
    private Role role;

    @Column(name = "status")
    @Nationalized
    private String status;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}