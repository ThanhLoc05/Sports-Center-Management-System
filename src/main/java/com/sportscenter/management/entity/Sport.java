package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;

@Entity
@Table(name = "sports")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Sport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "sport_id")
    private Integer id;

    @Column(name = "sport_name", nullable = false, unique = true)
    @Nationalized
    private String sportName;

    @Column(name = "description")
    @Nationalized
    private String description;
}