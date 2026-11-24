package com.sportscenter.management.training;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component @RequiredArgsConstructor
public class TrainingLock {
    private final JdbcTemplate jdbc;
    /** Serializes schedule/seat mutations across regular classes, courses and legacy session APIs. */
    public void acquire() {
        jdbc.queryForObject("SELECT COUNT(*) FROM dbo.regular_classes",Integer.class);
        Integer result=jdbc.queryForObject("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource='SPORTIVA:TRAINING',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; SELECT @r",Integer.class);
        if(result==null || result<0) throw new IllegalStateException("Không lấy được khóa lịch học. Vui lòng thử lại.");
    }
}
