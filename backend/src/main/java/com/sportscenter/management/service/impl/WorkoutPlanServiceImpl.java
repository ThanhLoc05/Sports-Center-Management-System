package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.WorkoutPlanRequest;
import com.sportscenter.management.dto.Response.WorkoutPlanResponse;
import com.sportscenter.management.entity.WorkoutPlan;
import com.sportscenter.management.repository.WorkoutPlanRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.service.WorkoutPlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class WorkoutPlanServiceImpl implements WorkoutPlanService {

    private final WorkoutPlanRepository planRepository;
    private final UserRepository userRepository;
    private final ClassRepository classRepository;
    private final SecurityUtils securityUtils;

    @Override
    public WorkoutPlanResponse createPlan(WorkoutPlanRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Thông tin kế hoạch không được để trống");
        }

        Integer coachId = request.getCoachId() != null
                ? request.getCoachId()
                : securityUtils.getCurrentUserId();

        var coach = coachId == null ? Optional.<com.sportscenter.management.entity.User>empty()
                : userRepository.findById(coachId);
        if (coach.isEmpty() || coach.get().getRole() == null
                || !"COACH".equals(coach.get().getRole().getRoleName())) {
            throw new IllegalArgumentException("Huấn luyện viên không hợp lệ hoặc chưa đăng nhập");
        }

        if ((request.getMemberId() == null) == (request.getClassId() == null)) {
            throw new IllegalArgumentException("Kế hoạch phải gắn với đúng một học viên hoặc một lớp");
        }

        if (request.getMemberId() != null) {
            var member = userRepository.findById(request.getMemberId());
            if (member.isEmpty() || member.get().getRole() == null
                    || !"MEMBER".equals(member.get().getRole().getRoleName())) {
                throw new IllegalArgumentException("Hội viên không tồn tại hoặc không phải tài khoản MEMBER");
            }
        }
        if (request.getClassId() != null && !classRepository.existsById(request.getClassId())) {
            throw new IllegalArgumentException("Lớp được chọn không tồn tại");
        }
        if (request.getTitle() == null || request.getTitle().isBlank()
                || request.getDescription() == null || request.getDescription().isBlank()) {
            throw new IllegalArgumentException("Tiêu đề và nội dung kế hoạch là bắt buộc");
        }

        WorkoutPlan plan = WorkoutPlan.builder()
                .title(request.getTitle())
                .coachId(coachId)
                .memberId(request.getMemberId())
                .classId(request.getClassId())
                .description(request.getDescription())
                .createdAt(LocalDateTime.now())
                .build();

        WorkoutPlan saved = planRepository.save(plan);
        return mapToResponse(saved);
    }

    @Override
    public WorkoutPlanResponse updatePlan(Integer id, WorkoutPlanRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Thông tin cập nhật kế hoạch không được để trống");
        }
        WorkoutPlan plan = planRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Kế hoạch học tập không tồn tại"));

        if (request.getMemberId() != null && request.getClassId() != null) {
            throw new IllegalArgumentException("Kế hoạch chỉ được gắn với hội viên hoặc lớp, không được gắn cả hai");
        }

        if (request.getTitle() != null && !request.getTitle().isBlank()) {
            plan.setTitle(request.getTitle());
        }
        if (request.getDescription() != null && !request.getDescription().isBlank()) {
            plan.setDescription(request.getDescription());
        }
        if (request.getMemberId() != null) {
            var member = userRepository.findById(request.getMemberId());
            if (member.isEmpty() || member.get().getRole() == null
                    || !"MEMBER".equals(member.get().getRole().getRoleName())) {
                throw new IllegalArgumentException("Hội viên không tồn tại hoặc không phải tài khoản MEMBER");
            }
            plan.setMemberId(request.getMemberId());
            plan.setClassId(null);
        }
        if (request.getClassId() != null) {
            if (!classRepository.existsById(request.getClassId())) {
                throw new IllegalArgumentException("Lớp được chọn không tồn tại");
            }
            plan.setClassId(request.getClassId());
            plan.setMemberId(null);
        }

        WorkoutPlan updated = planRepository.save(plan);
        return mapToResponse(updated);
    }

    @Override
    public void deletePlan(Integer id) {
        if (!planRepository.existsById(id)) {
            throw new IllegalArgumentException("Kế hoạch học tập không tồn tại");
        }
        planRepository.deleteById(id);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<WorkoutPlanResponse> getPlanById(Integer id) {
        return planRepository.findById(id).map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkoutPlanResponse> getPlansByMemberId(Integer memberId) {
        return planRepository.findByMemberId(memberId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkoutPlanResponse> getPlansByCoachId(Integer coachId) {
        return planRepository.findByCoachId(coachId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkoutPlanResponse> getPlansByClassId(Integer classId) {
        return planRepository.findByClassId(classId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    private WorkoutPlanResponse mapToResponse(WorkoutPlan plan) {
        return WorkoutPlanResponse.builder()
                .id(plan.getId())
                .title(plan.getTitle())
                .coachId(plan.getCoachId())
                .memberId(plan.getMemberId())
                .classId(plan.getClassId())
                .description(plan.getDescription())
                .createdAt(plan.getCreatedAt())
                .build();
    }
}
