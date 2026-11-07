package com.sportscenter.management.repository;
import com.sportscenter.management.entity.GeneralNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.Optional;
public interface GeneralNotificationRepository extends JpaRepository<GeneralNotification,Long> {
    Slice<GeneralNotification> findByRecipientIdOrderByCreatedAtDescIdDesc(Integer recipientId, Pageable pageable);
    Optional<GeneralNotification> findByIdAndRecipientId(Long id,Integer recipientId);
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update GeneralNotification n set n.readAt=:at where n.id=:id and n.recipientId=:recipient and n.readAt is null")
    int markRead(@Param("id") Long id,@Param("recipient") Integer recipient,@Param("at") LocalDateTime at);
}
