package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.WorkoutLogDetailRequest;
import com.sportscenter.management.dto.Request.WorkoutLogRequest;
import com.sportscenter.management.dto.Response.WorkoutLogDetailResponse;
import com.sportscenter.management.dto.Response.WorkoutLogResponse;
import com.sportscenter.management.entity.WorkoutLog;
import com.sportscenter.management.entity.WorkoutLogDetail;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.repository.WorkoutLogRepository;
import com.sportscenter.management.service.WorkoutLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class WorkoutLogServiceImpl implements WorkoutLogService {

    private final WorkoutLogRepository logRepository;
    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;

    @Override
    public WorkoutLogResponse createLog(WorkoutLogRequest request) {
        if (request == null || request.getMemberId() == null) {
            throw new IllegalArgumentException("Thông tin nhật ký và học viên là bắt buộc");
        }

        if (!userRepository.existsById(request.getMemberId())) {
            throw new IllegalArgumentException("Học viên không tồn tại");
        }

        Integer coachId = request.getCoachId() != null
                ? request.getCoachId()
                : securityUtils.getCurrentUserId();

        if (coachId == null) {
            coachId = request.getMemberId(); // Trường hợp học viên tự ghi nhật ký cá nhân
        }

        WorkoutLog log = WorkoutLog.builder()
                .memberId(request.getMemberId())
                .coachId(coachId)
                .scheduleId(request.getScheduleId())
                .feedbackFromCoach(request.getFeedbackFromCoach())
                .createdAt(LocalDateTime.now())
                .details(new ArrayList<>())
                .build();

        if (request.getDetails() != null && !request.getDetails().isEmpty()) {
            for (WorkoutLogDetailRequest d : request.getDetails()) {
                WorkoutLogDetail detail = WorkoutLogDetail.builder()
                        .workoutLog(log)
                        .exerciseName(d.getExerciseName())
                        .sets(d.getSets())
                        .reps(d.getReps())
                        .weightKg(d.getWeightKg())
                        .build();
                log.getDetails().add(detail);
            }
        }

        WorkoutLog saved = logRepository.save(log);
        return mapToResponse(saved);
    }

    @Override
    public WorkoutLogResponse updateFeedback(Integer logId, String feedback) {
        WorkoutLog log = logRepository.findById(logId)
                .orElseThrow(() -> new IllegalArgumentException("Nhật ký tập luyện không tồn tại"));

        log.setFeedbackFromCoach(feedback);
        WorkoutLog updated = logRepository.save(log);
        return mapToResponse(updated);
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkoutLogResponse> getLogsByMemberId(Integer memberId) {
        return logRepository.findByMemberId(memberId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkoutLogResponse> getLogsByCoachId(Integer coachId) {
        return logRepository.findByCoachId(coachId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<WorkoutLogResponse> getLogById(Integer id) {
        return logRepository.findById(id).map(this::mapToResponse);
    }

    private WorkoutLogResponse mapToResponse(WorkoutLog log) {
        List<WorkoutLogDetailResponse> details = log.getDetails() != null
                ? log.getDetails().stream().map(d -> WorkoutLogDetailResponse.builder()
                        .id(d.getId())
                        .exerciseName(d.getExerciseName())
                        .sets(d.getSets())
                        .reps(d.getReps())
                        .weightKg(d.getWeightKg())
                        .build()).collect(Collectors.toList())
                : new ArrayList<>();

        return WorkoutLogResponse.builder()
                .id(log.getId())
                .memberId(log.getMemberId())
                .coachId(log.getCoachId())
                .scheduleId(log.getScheduleId())
                .feedbackFromCoach(log.getFeedbackFromCoach())
                .createdAt(log.getCreatedAt())
                .details(details)
                .build();
    }
}
