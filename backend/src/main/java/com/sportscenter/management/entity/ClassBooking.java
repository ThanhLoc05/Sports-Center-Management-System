package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "class_bookings",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "UQ_Member_Class",
                        columnNames = {"class_id", "member_id"}
                )
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClassBooking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "booking_id")
    private Integer id;

    @Column(name = "class_id", nullable = false)
    private Integer classId;

    @Column(name = "member_id", nullable = false)
    private Integer memberId;

    @Column(name = "booked_at")
    private LocalDateTime bookedAt;

    @Column(name = "status")
    private String status;
}