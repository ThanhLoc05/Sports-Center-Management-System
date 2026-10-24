package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "feedbacks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Feedback {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Column(name = "from_user_id", nullable = false)
    private Integer fromUserId;

    @Column(name = "to_user_id")
    private Integer toUserId;

    @Column(name = "class_id")
    private Integer classId;

    @Column(name = "rating")
    private Integer rating;

    @Column(name = "comment", nullable = false, columnDefinition = "NVARCHAR(MAX)")
    private String comment;

    @Column(name = "type")
    private String type; // MEMBER_TO_COACH, COACH_TO_MEMBER, CLASS_FEEDBACK

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
