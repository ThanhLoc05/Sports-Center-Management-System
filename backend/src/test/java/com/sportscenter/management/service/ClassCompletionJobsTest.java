package com.sportscenter.management.service;

import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.repository.ClassRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class ClassCompletionJobsTest {
    @Test
    void completesOnlyClassesWhoseScheduledDurationHasEnded() {
        var repository = mock(ClassRepository.class);
        var now = LocalDateTime.of(2026, 11, 12, 11, 0);
        var ended = clazz(1, now.minusHours(1), 60);
        var ongoing = clazz(2, now.minusMinutes(30), 60);
        when(repository.findByStatusAndScheduleTimeLessThanEqual("SCHEDULED", now))
                .thenReturn(List.of(ended, ongoing));
        var clock = Clock.fixed(
                now.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant(),
                ZoneId.of("Asia/Ho_Chi_Minh"));
        var jobs = new ClassCompletionJobs(repository, clock);

        jobs.completeEndedClasses();

        assertEquals("COMPLETED", ended.getStatus());
        assertEquals("SCHEDULED", ongoing.getStatus());
        verify(repository).saveAll(List.of(ended));
    }

    private static Classes clazz(int id, LocalDateTime start, int duration) {
        return Classes.builder()
                .id(id)
                .scheduleTime(start)
                .durationMinutes(duration)
                .status("SCHEDULED")
                .build();
    }
}
