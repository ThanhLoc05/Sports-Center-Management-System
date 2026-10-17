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
        // Validate sport exists
        if (!sportRepository.existsById(request.getSportId())) {
            throw new IllegalArgumentException("Bộ môn không tồn tại");
        }

        // Validate coach exists
        if (!userRepository.existsById(request.getCoachId())) {
            throw new IllegalArgumentException("Huấn luyện viên không tồn tại");
        }

        // Validate room exists
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

        // Validate schedule is in future
        if (request.getScheduleTime().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Thời gian lớp học phải là tương lai");
        }

        Classes clazz = Classes.builder()
                .className(request.getClassName())
                .sportId(request.getSportId())
                .coachId(request.getCoachId())
                .roomId(request.getRoomId())
                .maxCapacity(request.getMaxCapacity())
                .scheduleTime(request.getScheduleTime())
                .durationMinutes(request.getDurationMinutes() != null ? request.getDurationMinutes() : 60)
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
        List<Classes> classes = classRepository.findByStatus("SCHEDULED");

        return classes.stream()
                .filter(clazz -> {
                    long currentBookings = bookingRepository.countByClassIdAndStatus(clazz.getId(), "BOOKED");
                    return currentBookings < clazz.getMaxCapacity() &&
                            clazz.getScheduleTime().isAfter(LocalDateTime.now());
                })
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ClassResponse> getClassesBySport(Integer sportId) {
        return classRepository.findBySportId(sportId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public int getAvailableCapacity(Integer classId) {
        Classes clazz = classRepository.findById(classId)
                .orElseThrow(() -> new IllegalArgumentException("Lớp học không tồn tại"));

        long currentBookings = bookingRepository.countByClassIdAndStatus(classId, "BOOKED");
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
            if (request.getMaxCapacity() < bookingRepository.countByClassIdAndStatus(classId, "BOOKED")) {
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
            if (!userRepository.existsById(request.getCoachId())) {
                throw new IllegalArgumentException("Huấn luyện viên không tồn tại");
            }
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

        Classes updatedClass = classRepository.save(clazz);
        return mapToResponse(updatedClass);
    }

    @Override
    public ClassResponse cancelClass(Integer classId) {
        Classes clazz = classRepository.findById(classId)
                .orElseThrow(() -> new IllegalArgumentException("Lớp học không tồn tại"));

        clazz.setStatus("CANCELLED");
        Classes updatedClass = classRepository.save(clazz);

        // Cancel all bookings for this class
        bookingRepository.updateBookingStatusByClass(classId, "CANCELLED");

        return mapToResponse(updatedClass);
    }

    @Override
    @Transactional(readOnly = true)
    public long getCurrentBookingCount(Integer classId) {
        return bookingRepository.countByClassIdAndStatus(classId, "BOOKED");
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
                .status(clazz.getStatus())
                .build();
    }
}
