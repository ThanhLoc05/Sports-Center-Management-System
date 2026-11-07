package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;

@Entity
@Table(name = "coach_profiles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CoachProfile {

    @Id
    @Column(name = "coach_id")
    private Integer coachId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "coach_id")
    private User user;

    @Column(name = "professional_level", length = 100)
    @Nationalized
    private String professionalLevel;

    @Column(name = "specialties", length = 500)
    @Nationalized
    private String specialties;

    @Column(name = "bio", columnDefinition = "NVARCHAR(MAX)")
    @Nationalized
    private String bio;
}
