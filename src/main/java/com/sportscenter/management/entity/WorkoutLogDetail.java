package com.sportscenter.management.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;

import java.math.BigDecimal;

@Entity
@Table(name = "workout_log_details")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkoutLogDetail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "log_id", nullable = false)
    @JsonIgnore
    private WorkoutLog workoutLog;

    @Column(name = "exercise_name", nullable = false)
    @Nationalized
    private String exerciseName;

    @Column(name = "sets")
    private Integer sets;

    @Column(name = "reps")
    private Integer reps;

    @Column(name = "weight_kg", precision = 8, scale = 2)
    private BigDecimal weightKg;
}
