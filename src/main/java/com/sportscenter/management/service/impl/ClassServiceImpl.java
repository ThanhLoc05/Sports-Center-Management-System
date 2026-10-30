package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.SportRepository;
import com.sportscenter.management.repository.RoomRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.ClassService;
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
public class ClassServiceImpl implements ClassService {

    private final ClassRepository classRepository;
    private final ClassBookingRepository bookingRepository;
    private final SportRepository sportRepository;
    private final RoomRepository roomRepository;
    private final UserRepository userRepository;

    @Override
    public ClassResponse createClass(ClassRequest request) {
        if (request == null || request.getScheduleTime() == null || request.getSportId() == null
                || request.getCoachId() == null || request.getRoomId() == null
                || request.getClassName() == null || request.getClassName().isBlank()) {
            throw new IllegalArgumentException("Thông tin lớp học và thời gian học là bắt buộc");
        }
        // Kiểm tra bộ môn đã được khai báo trong danh mục.
        if (!sportRepository.existsById(request.getSportId())) {
            throw new IllegalArgumentException("Bộ môn không tồn tại");
        }

        validateCoach(request.getCoachId());

        // Kiểm tra phòng tồn tại và lớp không vượt quá sức chứa phòng.
        var room = roomRepository.findById(request.getRoomId())
                .orElseThrow(() -> new IllegalArgumentException("Phòng tập không tồn tại"));
        if (request.getMaxCapacity() == null || request.getMaxCapacity() <= 0) {
            throw new IllegalArgumentException("Sức chứa lớp học phải lớn hơn 0");
        }
        if (request.getMaxCapacity() > room.getCapacity()) {
            throw new IllegalArgumentException("Sức chứa lớp học không thể vượt quá sức chứa phòng");
        }
        if (request.getDurationMinutes() != null && request.getDurationMinutes() <= 0) {
            throw new IllegalArgumentException("Thời lượng lớp học phải lớn hơn 0");
        }

        // Không cho tạo lớp có thời gian bắt đầu trong quá khứ.
        if (request.getScheduleTime().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Thời gian lớp học phải là tương lai");
        }

        int duration = request.getDurationMinutes() != null ? request.getDurationMinutes() : 60;

        // Không xếp trùng thời gian của cùng huấn luyện viên hoặc cùng phòng.
        validateNoScheduleConflict(null, request.getCoachId(), request.getRoomId(), request.getScheduleTime(), duration);

        Classes clazz = Classes.builder()
                .className(request.getClassName())
                .sportId(request.getSportId())
                .coachId(request.getCoachId())
                .roomId(request.getRoomId())
                .maxCapacity(request.getMaxCapacity())
                .scheduleTime(request.getScheduleTime())
                .durationMinutes(duration)
                .requiredAccessLevel(normalizeAccessLevel(request.getRequiredAccessLevel()))
                .status("SCHEDULED")
                .build();

        Classes savedClass = classRepository.save(clazz);
        return mapToResponse(savedClass);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ClassResponse> getClassById(Integer classId) {
        return classRepository.findById(classId)
                .map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ClassResponse> getAllClasses(Integer sportId, Integer coachId) {
        List<Classes> classes;
        if (sportId != null && coachId != null) {
            classes = classRepository.findBySportIdAndCoachId(sportId, coachId);
        } else if (sportId != null) {
            classes = classRepository.findBySportId(sportId);
        } else if (coachId != null) {
            classes = classRepository.findByCoachId(coachId);
        } else {
            classes = classRepository.findAll();
        }
        return classes.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ClassResponse> getAvailableClasses() {
        return classRepository.findFutureScheduledClasses().stream()
                .filter(c -> getCurrentBookingCount(c.getId()) < c.getMaxCapacity())
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ClassResponse> getClassesBySport(Integer sportId) {
        if (!sportRepository.existsById(sportId)) {
            throw new IllegalArgumentException("Bộ môn không tồn tại");
        }
        return classRepository.findBySportId(sportId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public int getAvailableCapacity(Integer classId) {
        Classes clazz = classRepository.findById(classId)
                .orElseThrow(() -> new IllegalArgumentException("Lớp học không tồn tại"));

        long currentBookings = getCurrentBookingCount(classId);
        return Math.max(0, (int) (clazz.getMaxCapacity() - currentBookings));
    }

    @Override
    public ClassResponse updateClass(Integer classId, ClassRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Thông tin cập nhật lớp học không được để trống");
        }
        Classes clazz = classRepository.findById(classId)
                .orElseThrow(() -> new IllegalArgumentException("Lớp học không tồn tại"));

        if (request.getClassName() != null && !request.getClassName().isBlank()) {
            clazz.setClassName(request.getClassName());
        }

        if (request.getScheduleTime() != null && !request.getScheduleTime().isAfter(LocalDateTime.now())) {
            throw new IllegalArgumentException("Thời gian lớp học phải là tương lai");
        }
        if (request.getScheduleTime() != null) {
            clazz.setScheduleTime(request.getScheduleTime());
        }

        if (request.getDurationMinutes() != null) {
            if (request.getDurationMinutes() <= 0) {
                throw new IllegalArgumentException("Thời lượng lớp học phải lớn hơn 0");
            }
            clazz.setDurationMinutes(request.getDurationMinutes());
        }

        if (request.getMaxCapacity() != null) {
            if (request.getMaxCapacity() <= 0) {
                throw new IllegalArgumentException("Sức chứa lớp học phải lớn hơn 0");
            }
            if (request.getMaxCapacity() < getCurrentBookingCount(classId)) {
                throw new IllegalArgumentException("Sức chứa không thể nhỏ hơn số học viên đã đăng ký");
            }
            clazz.setMaxCapacity(request.getMaxCapacity());
        }
        if (request.getSportId() != null) {
            if (!sportRepository.existsById(request.getSportId())) {
                throw new IllegalArgumentException("Bộ môn không tồn tại");
            }
            clazz.setSportId(request.getSportId());
        }
        if (request.getCoachId() != null) {
            validateCoach(request.getCoachId());
            clazz.setCoachId(request.getCoachId());
        }
        if (request.getRoomId() != null) {
            var room = roomRepository.findById(request.getRoomId())
                    .orElseThrow(() -> new IllegalArgumentException("Phòng tập không tồn tại"));
            int requestedCapacity = request.getMaxCapacity() != null
                    ? request.getMaxCapacity() : clazz.getMaxCapacity();
            if (requestedCapacity > room.getCapacity()) {
                throw new IllegalArgumentException("Sức chứa lớp học không thể vượt quá sức chứa phòng");
            }
            clazz.setRoomId(request.getRoomId());
        }
        if (request.getRequiredAccessLevel() != null) {
            clazz.setRequiredAccessLevel(normalizeAccessLevel(request.getRequiredAccessLevel()));
        }

        // Kiểm tra xung đột lịch lần nữa sau khi áp dụng các thay đổi.
        LocalDateTime effectiveStart = clazz.getScheduleTime();
        int effectiveDuration = clazz.getDurationMinutes() != null ? clazz.getDurationMinutes() : 60;
        validateNoScheduleConflict(classId, clazz.getCoachId(), clazz.getRoomId(), effectiveStart, effectiveDuration);

        Classes updatedClass = classRepository.save(clazz);
        return mapToResponse(updatedClass);
    }

    @Override
    public ClassResponse cancelClass(Integer classId) {
        Classes clazz = classRepository.findById(classId)
                .orElseThrow(() -> new IllegalArgumentException("Lớp học không tồn tại"));

        clazz.setStatus("CANCELLED");
        Classes updatedClass = classRepository.save(clazz);

        // Lớp bị hủy thì các lượt đăng ký của lớp cũng không còn hiệu lực.
        bookingRepository.updateBookingStatusByClass(classId, "CANCELLED");

        return mapToResponse(updatedClass);
    }

    @Override
    @Transactional(readOnly = true)
    public long getCurrentBookingCount(Integer classId) {
        return bookingRepository.countByClassIdAndStatus(classId, "BOOKED");
    }

    private void validateNoScheduleConflict(
            Integer excludeClassId, Integer coachId, Integer roomId, LocalDateTime start, int durationMinutes) {
        LocalDateTime end = start.plusMinutes(durationMinutes);

        List<Classes> scheduledClasses = classRepository.findAll().stream()
                .filter(c -> "SCHEDULED".equals(c.getStatus()))
                .filter(c -> excludeClassId == null || !c.getId().equals(excludeClassId))
                .toList();

        for (Classes other : scheduledClasses) {
            LocalDateTime otherStart = other.getScheduleTime();
            int otherDuration = other.getDurationMinutes() != null ? other.getDurationMinutes() : 60;
            LocalDateTime otherEnd = otherStart.plusMinutes(otherDuration);

            // Hai khoảng giờ bị trùng khi giờ bắt đầu của mỗi lớp nằm trước giờ kết thúc lớp còn lại.
            if (start.isBefore(otherEnd) && otherStart.isBefore(end)) {
                if (other.getCoachId().equals(coachId)) {
                    throw new IllegalArgumentException(String.format(
                            "Huấn luyện viên đã có lịch dạy lớp '%s' trong khung giờ %s - %s",
                            other.getClassName(), otherStart.toLocalTime(), otherEnd.toLocalTime()));
                }
                if (other.getRoomId().equals(roomId)) {
                    throw new IllegalArgumentException(String.format(
                            "Phòng tập đã được xếp cho lớp '%s' trong khung giờ %s - %s",
                            other.getClassName(), otherStart.toLocalTime(), otherEnd.toLocalTime()));
                }
            }
        }
    }

    private void validateCoach(Integer coachId) {
        var coach = userRepository.findById(coachId)
                .orElseThrow(() -> new IllegalArgumentException("Huấn luyện viên không tồn tại"));
        if (coach.getRole() == null || !"COACH".equals(coach.getRole().getRoleName())) {
            throw new IllegalArgumentException("Tài khoản được chọn không phải huấn luyện viên");
        }
    }

    private ClassResponse mapToResponse(Classes clazz) {
        return ClassResponse.builder()
                .id(clazz.getId())
                .className(clazz.getClassName())
                .sportId(clazz.getSportId())
                .coachId(clazz.getCoachId())
                .roomId(clazz.getRoomId())
                .maxCapacity(clazz.getMaxCapacity())
                .scheduleTime(clazz.getScheduleTime())
                .durationMinutes(clazz.getDurationMinutes())
                .requiredAccessLevel(clazz.getRequiredAccessLevel())
                .status(clazz.getStatus())
                .build();
    }

    private String normalizeAccessLevel(String accessLevel) {
        String normalized = accessLevel == null || accessLevel.isBlank()
                ? "STANDARD" : accessLevel.trim().toUpperCase();
        if (!"STANDARD".equals(normalized) && !"VIP".equals(normalized)) {
            throw new IllegalArgumentException("Quyền truy cập lớp chỉ được là STANDARD hoặc VIP");
        }
        return normalized;
    }
}
