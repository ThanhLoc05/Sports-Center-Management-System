package com.sportscenter.management.service;

import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.repository.ClassRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

@Component
@RequiredArgsConstructor
public class ClassCompletionJobs {
    private final ClassRepository classRepository;
    private final Clock clock;

    @Scheduled(fixedDelayString = "${app.classes.completion-delay-ms:60000}")
    @Transactional
    public void completeEndedClasses() {
        LocalDateTime now = LocalDateTime.now(clock);
        List<Classes> completed = classRepository
                .findByStatusAndScheduleTimeLessThanEqual("SCHEDULED", now)
                .stream()
                .filter(clazz -> {
                    int duration = clazz.getDurationMinutes() != null ? clazz.getDurationMinutes() : 60;
                    return !clazz.getScheduleTime().plusMinutes(duration).isAfter(now);
                })
                .toList();
        if (completed.isEmpty()) return;
        completed.forEach(clazz -> clazz.setStatus("COMPLETED"));
        classRepository.saveAll(completed);
    }
}
