package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;

@Entity
@Table(name = "rooms")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Room {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "room_id")
    private Integer id;

    @Column(name = "room_name", nullable = false, unique = true)
    @Nationalized
    private String roomName;

    @Column(name = "capacity", nullable = false)
    private Integer capacity;
}