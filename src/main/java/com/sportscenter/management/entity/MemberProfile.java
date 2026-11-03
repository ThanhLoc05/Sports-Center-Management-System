package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;

import java.time.LocalDate;

@Entity
@Table(name = "member_profiles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberProfile {

    @Id
    @Column(name = "member_id")
    private Integer memberId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "member_id")
    private User user;

    @Column(name = "dob")
    private LocalDate dob;

    @Column(name = "gender")
    @Nationalized
    private String gender;

    @Column(name = "address")
    @Nationalized
    private String address;

    @Column(name = "fitness_goals", columnDefinition = "NVARCHAR(MAX)")
    @Nationalized
    private String fitnessGoals;
}