package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Feedback;
import com.sportscenter.management.dto.Response.FeedbackResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface FeedbackRepository extends JpaRepository<Feedback, Integer> {
    // Lấy tên và đánh giá cùng truy vấn; giới hạn nhận xét riêng ngay tại cơ sở dữ liệu.
    @Query("""
            select new com.sportscenter.management.dto.Response.FeedbackResponse(
                f.id, f.fromUserId, f.toUserId, f.classId, f.rating, f.comment, f.type, f.createdAt,
                sender.fullName, case when f.type = 'CLASS_FEEDBACK' then c.className else recipient.fullName end)
            from Feedback f
            left join User sender on sender.id = f.fromUserId
            left join User recipient on recipient.id = f.toUserId
            left join Classes c on c.id = f.classId
            where f.type = :type and (:memberId is null or f.toUserId = :memberId)
            order by f.createdAt desc, f.id desc
            """)
    List<FeedbackResponse> browse(@Param("type") String type, @Param("memberId") Integer memberId);

    List<Feedback> findByToUserId(Integer toUserId);
    List<Feedback> findByFromUserId(Integer fromUserId);
    List<Feedback> findByClassId(Integer classId);
}
