package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Request.ClassCancellationRequest;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.CoachProfile;
import com.sportscenter.management.entity.Room;
import com.sportscenter.management.entity.Sport;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.CoachProfileRepository;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.SportRepository;
import com.sportscenter.management.repository.RoomRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.ClassService;
import com.sportscenter.management.service.FlexibleClassSlot;
import com.sportscenter.management.service.AuditLogService;
import com.sportscenter.management.service.MemberClassNotifications;
import com.sportscenter.management.service.SessionMembershipAccess;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Objects;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.time.ZoneId;
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
    private final CoachProfileRepository coachProfileRepository;
    private final MemberClassNotifications memberNotifications;
    private final SessionMembershipAccess membershipAccess;
    private final AuditLogService auditLogService;
    private final com.sportscenter.management.training.TrainingProgramService trainingPrograms;

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public ClassResponse createClass(ClassRequest request) {
        trainingPrograms.lock();
        if (request == null || request.getScheduleTime() == null || request.getSportId() == null
                || request.getCoachId() == null || request.getRoomId() == null
                || request.getClassName() == null || request.getClassName().isBlank()) {
            throw new IllegalArgumentException("Thông tin lớp học và thời gian học là bắt buộc");
        }
        FlexibleClassSlot.requireScheduledSlot(request.getScheduleTime(), request.getDurationMinutes());
        validateSport(request.getSportId());
        validateCoach(request.getCoachId());

        // Khóa phòng sau HLV để tuần tự hóa các yêu cầu dùng chung tài nguyên.
        var room = roomRepository.findByIdForUpdate(request.getRoomId())
                .orElseThrow(() -> new IllegalArgumentException("Phòng tập không tồn tại"));
        // A lock query can return an entity already cached in this persistence context.
        entityManager.refresh(room, LockModeType.PESSIMISTIC_WRITE);
        validateCapacity(request.getMaxCapacity(), room);
        validateResourceSports(request.getSportId(), request.getCoachId(), room);

        if (!request.getScheduleTime().isAfter(LocalDateTime.now(FlexibleClassSlot.ZONE))) {
            throw new IllegalArgumentException("Thời gian lớp học phải là tương lai");
        }

        int duration = request.getDurationMinutes();
        trainingPrograms.requireResourceFree(request.getScheduleTime(),request.getScheduleTime().plusMinutes(duration),request.getCoachId(),request.getRoomId(),null,null,null);

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
    public ManagedSessions getManagedSessions(String status, Integer sportId, String keyword, int page) {
        return getManagedSessions(status, sportId, keyword, page, null, null, null, null, null);
    }

    @Override
    @Transactional(readOnly = true)
    public ManagedSessions getManagedSessions(String status, Integer sportId, String keyword, int page,
                                              Integer coachId, Integer roomId, LocalDate fromDate,
                                              LocalDate throughDate, FlexibleClassSlot slot) {
        if (!List.of("SCHEDULED", "COMPLETED", "CANCELLED", "all").contains(status)
                || page < 0 || page > 100_000 || keyword.length() > 150
                || (fromDate != null && throughDate != null && fromDate.isAfter(throughDate))) {
            throw new IllegalArgumentException("Bộ lọc danh sách buổi học không hợp lệ.");
        }
        var sessions = classRepository.findForManagement(status, sportId,
                keyword.strip().replace('đ', 'd').replace('Đ', 'D'), coachId, roomId, fromDate, throughDate,
                slot == null ? null : slot.start(), PageRequest.of(page, 8));
        var reasonById = auditLogService.classCancellationReasons(sessions.stream()
                .filter(clazz -> "CANCELLED".equals(clazz.getStatus())).map(Classes::getId).toList());
        var ids = sessions.stream().map(Classes::getId).toList();
        Map<Integer, Long> bookedCounts = ids.isEmpty() ? Map.of() : bookingRepository.countBookedByClasses(ids)
                .stream().collect(Collectors.toMap(ClassBookingRepository.BookedCount::getClassId,
                        ClassBookingRepository.BookedCount::getBookedCount));
        var items = sessions.map(clazz -> new ManagedSession(mapToResponse(clazz), reasonById.get(clazz.getId()),
                bookedCounts.getOrDefault(clazz.getId(), 0L)));
        return new ManagedSessions(items.getContent(), items.getTotalElements(), items.getTotalPages());
    }

    @Override
    // The weekly planner turns validation failures into per-session conflicts.
    @Transactional(readOnly = true, noRollbackFor = IllegalArgumentException.class)
    public void validatePlanningResources(ClassRequest request) {
        validateSport(request.getSportId());
        validateCoachAccount(userRepository.findById(request.getCoachId())
                .orElseThrow(() -> new IllegalArgumentException("Huấn luyện viên không tồn tại")));
        Room room = roomRepository.findById(request.getRoomId())
                .orElseThrow(() -> new IllegalArgumentException("Phòng tập không tồn tại"));
        validateCapacity(request.getMaxCapacity(), room);
        validateResourceSports(request.getSportId(), request.getCoachId(), room);
        normalizeAccessLevel(request.getRequiredAccessLevel());
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

        long currentBookings = getCurrentBookingCount(classId)
                + bookingRepository.countReservedInvitations(classId,
                LocalDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")));
        return Math.max(0, (int) (clazz.getMaxCapacity() - currentBookings));
    }

    @Override
    public ClassResponse updateClass(Integer classId, ClassRequest request) {
        trainingPrograms.lock();
        if (request == null) {
            throw new IllegalArgumentException("Thông tin cập nhật lớp học không được để trống");
        }
        Classes clazz = classRepository.findById(classId)
                .orElseThrow(() -> new IllegalArgumentException("Lớp học không tồn tại"));

        // Lock room before class mutation, matching RoomController's room -> class validation.
        Integer targetCoach=request.getCoachId()!=null?request.getCoachId():clazz.getCoachId();
        Integer targetRoom=request.getRoomId()!=null?request.getRoomId():clazz.getRoomId();
        validateCoach(targetCoach);
        var effectiveRoom=roomRepository.findByIdForUpdate(targetRoom)
                .orElseThrow(()->new IllegalArgumentException("Phòng tập không tồn tại"));
        entityManager.refresh(effectiveRoom,LockModeType.PESSIMISTIC_WRITE);
        clazz=classRepository.findByIdForUpdate(classId)
                .orElseThrow(()->new IllegalArgumentException("Lớp học không tồn tại"));
        entityManager.refresh(clazz,LockModeType.PESSIMISTIC_WRITE);
        if((request.getRoomId()==null && !targetRoom.equals(clazz.getRoomId()))
                || (request.getCoachId()==null && !targetCoach.equals(clazz.getCoachId())))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lớp đã thay đổi tài nguyên; hãy tải lại dữ liệu.");
        Integer targetSport = request.getSportId() == null ? clazz.getSportId() : request.getSportId();
        if (request.getSportId() != null) validateSport(targetSport);
        if (isFlexible(clazz) && (!Objects.equals(targetSport, clazz.getSportId())
                || !Objects.equals(targetCoach, clazz.getCoachId()) || !Objects.equals(targetRoom, clazz.getRoomId()))) {
            validateResourceSports(targetSport, targetCoach, effectiveRoom);
        }
        var before=MemberClassNotifications.Before.of(clazz);
        LocalDateTime start = request.getScheduleTime() != null ? request.getScheduleTime() : clazz.getScheduleTime();
        int oldDuration = clazz.getDurationMinutes() != null ? clazz.getDurationMinutes() : 60;
        int duration = request.getDurationMinutes() != null ? request.getDurationMinutes() : oldDuration;
        if (request.getScheduleTime() != null && !start.isAfter(LocalDateTime.now(FlexibleClassSlot.ZONE))) {
            throw new IllegalArgumentException("Thời gian lớp học phải là tương lai");
        }
        if (duration <= 0) {
            throw new IllegalArgumentException("Thời lượng lớp học phải lớn hơn 0");
        }
        boolean scheduleChanged = !start.equals(clazz.getScheduleTime()) || duration != oldDuration;
        if (scheduleChanged && isFlexible(clazz)) {
            FlexibleClassSlot.requireScheduledSlot(start, duration);
        }
        if ("SCHEDULED".equals(clazz.getStatus()) && scheduleChanged) {
            var bookedMembers = validateMemberSchedules(classId, start, start.plusMinutes(duration));
            if (isFlexible(clazz)) {
                var accessLevel = request.getRequiredAccessLevel() == null
                        ? clazz.getRequiredAccessLevel() : normalizeAccessLevel(request.getRequiredAccessLevel());
                for (int memberId : bookedMembers) {
                    requireMembershipForMove(start.toLocalDate(), targetSport, accessLevel, memberId);
                }
            }
        }

        if (request.getClassName() != null && !request.getClassName().isBlank()) {
            clazz.setClassName(request.getClassName());
        }

        if (request.getScheduleTime() != null) {
            clazz.setScheduleTime(request.getScheduleTime());
        }

        if (request.getDurationMinutes() != null) {
            clazz.setDurationMinutes(duration);
        }

        if (request.getMaxCapacity() != null) {
            if (request.getMaxCapacity() <= 0) {
                throw new IllegalArgumentException("Sức chứa lớp học phải lớn hơn 0");
            }
            if (request.getMaxCapacity() < getCurrentBookingCount(classId)
                    + bookingRepository.countReservedInvitations(classId,
                        LocalDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")))) {
                throw new IllegalArgumentException("Sức chứa không thể nhỏ hơn số chỗ đã đăng ký hoặc đang được mời");
            }
            clazz.setMaxCapacity(request.getMaxCapacity());
        }
        if (request.getSportId() != null) {
            clazz.setSportId(targetSport);
        }
        if (request.getCoachId() != null) {
            clazz.setCoachId(request.getCoachId());
        }
        if (request.getRoomId() != null) {
            clazz.setRoomId(request.getRoomId());
        }
        if (request.getRequiredAccessLevel() != null) {
            clazz.setRequiredAccessLevel(normalizeAccessLevel(request.getRequiredAccessLevel()));
        }

        // Kiểm tra xung đột lịch lần nữa sau khi áp dụng các thay đổi.
        trainingPrograms.validateSessionChange(clazz,start,duration,clazz.getCoachId(),clazz.getRoomId());
        if (clazz.getMaxCapacity() > effectiveRoom.getCapacity()) {
            throw new IllegalArgumentException("Sức chứa lớp học không thể vượt quá sức chứa phòng");
        }

        validateNoScheduleConflict(classId, clazz.getCoachId(), clazz.getRoomId(), start, duration);

        Classes updatedClass = classRepository.save(clazz);
        classRepository.flush();
        trainingPrograms.refreshCourseDates(updatedClass.getCourseId());
        memberNotifications.changed(before,updatedClass);
        return mapToResponse(updatedClass);
    }

    @Override
    public ClassResponse cancelClass(Integer classId, ClassCancellationRequest request, Integer actorId) {
        trainingPrograms.lock();
        Classes clazz = classRepository.findByIdForUpdate(classId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy buổi học."));
        entityManager.refresh(clazz, LockModeType.PESSIMISTIC_WRITE);
        if ("CANCELLED".equals(clazz.getStatus()) && isFlexible(clazz)) return mapToResponse(clazz);

        String blocker = cancellationBlocker(clazz);
        if (blocker != null) throw new ResponseStatusException(HttpStatus.CONFLICT, blocker);

        String reason = request.publicReason();
        auditLogService.recordClassCancellation(actorId, classId, reason, request.note());
        memberNotifications.cancelled(clazz, actorId, reason);
        clazz.setStatus("CANCELLED");
        bookingRepository.cancelConfirmedBookings(classId);
        classRepository.closeActiveWaitlist(classId);
        return mapToResponse(classRepository.save(clazz));
    }

    @Override
    @Transactional(readOnly = true)
    public CancellationDetails cancellationDetails(Integer classId, Integer actorId, boolean manager) {
        Classes clazz = classRepository.findById(classId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy buổi học."));
        if (!manager && (actorId == null || bookingRepository.findByClassIdAndMemberId(classId, actorId).isEmpty())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn chỉ được xem lý do hủy cho buổi đã đăng ký.");
        }
        String reason = "CANCELLED".equals(clazz.getStatus()) ? auditLogService.classCancellationReason(classId) : null;
        return new CancellationDetails(reason, manager ? getCurrentBookingCount(classId) : null,
                manager ? classRepository.countActiveWaitlist(classId) : null,
                manager && cancellationBlocker(clazz) == null);
    }

    @Override
    @Transactional(readOnly = true)
    public long getCurrentBookingCount(Integer classId) {
        return bookingRepository.countByClassIdAndStatus(classId, "BOOKED");
    }

    private boolean isFlexible(Classes clazz) {
        return clazz.getCourseId() == null && clazz.getRegularClassId() == null;
    }

    private String cancellationBlocker(Classes clazz) {
        if (!isFlexible(clazz)) return "Hãy quản lý buổi này từ khóa học hoặc lớp theo lịch cố định.";
        if (classRepository.countAttendance(clazz.getId()) > 0) return "Buổi học đã có điểm danh nên không thể hủy.";
        if (!"SCHEDULED".equals(clazz.getStatus())
                || !clazz.getScheduleTime().isAfter(LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")))) {
            return "Chỉ được hủy buổi đang lên lịch và chưa bắt đầu.";
        }
        return null;
    }

    private List<Integer> validateMemberSchedules(Integer classId, LocalDateTime start, LocalDateTime end) {
        // The class lock stabilizes enrollments. Lock shared members in ID order before
        // mutating the class, so concurrent bookings or moves validate the committed schedule.
        var bookedMembers = bookingRepository.findBookedMemberIds(classId);
        for (Integer memberId : bookedMembers) {
            userRepository.findByIdForUpdate(memberId);
        }
        if (bookingRepository.hasMemberScheduleConflict(classId, start, end)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Không thể đổi lịch lớp vì có học viên đã đăng ký lớp khác trùng giờ.");
        }
        return bookedMembers;
    }

    private void requireMembershipForMove(LocalDate date, Integer sportId, String level, int memberId) {
        try {
            membershipAccess.require(date, sportId, level, memberId, true);
        } catch (IllegalArgumentException | ResponseStatusException invalidMembership) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Không thể đổi lịch: học viên #" + memberId + " không có gói tập phù hợp vào ngày "
                            + date.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")) + ".");
        }
    }

    private void validateNoScheduleConflict(
            Integer excludeClassId, Integer coachId, Integer roomId, LocalDateTime start, int durationMinutes) {
        LocalDateTime end = start.plusMinutes(durationMinutes);

        List<Classes> scheduledClasses = classRepository
                .findPotentialScheduleConflicts(coachId, roomId, end);

        for (Classes other : scheduledClasses) {
            if (excludeClassId != null && excludeClassId.equals(other.getId())) {
                continue;
            }
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

    private void validateSport(Integer sportId) {
        if (!sportRepository.existsById(sportId)) {
            throw new IllegalArgumentException("Bộ môn không tồn tại");
        }
    }

    private void validateResourceSports(Integer sportId, Integer coachId, Room room) {
        var sports = sportRepository.findAll();
        String specialties = coachProfileRepository.findById(coachId)
                .map(CoachProfile::getSpecialties).orElse(null);
        if (!matchesResourceSport(specialties, sportId, sports)) {
            throw new IllegalArgumentException("Chuyên môn của huấn luyện viên không phù hợp với bộ môn của lớp.");
        }
        if (!matchesResourceSport(room.getRoomName(), sportId, sports)) {
            throw new IllegalArgumentException("Sân/phòng không phù hợp với bộ môn của lớp.");
        }
    }

    private static boolean matchesResourceSport(String description, Integer sportId, List<Sport> sports) {
        String words = sportWords(description);
        var identified = sports.stream().filter(sport -> {
            String name = sportWords(sport.getSportName());
            return (!name.isBlank() && words.contains(name))
                    || (name.equals(" cau long ") && words.contains(" badminton "))
                    || (name.equals(" badminton ") && words.contains(" cau long "))
                    || (name.equals(" dance ") && words.contains(" hip hop "));
        }).toList();
        // V26 has no resource-to-sport relation. Only an explicit catalog match proves a mismatch.
        return identified.isEmpty() || identified.stream().anyMatch(sport -> sportId.equals(sport.getId()));
    }

    private static String sportWords(String text) {
        return " " + Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT).replace('đ', 'd')
                .replaceAll("[^a-z0-9]+", " ").strip() + " ";
    }

    private void validateCapacity(Integer capacity, Room room) {
        if (capacity == null || capacity <= 0) {
            throw new IllegalArgumentException("Sức chứa lớp học phải lớn hơn 0");
        }
        if (capacity > room.getCapacity()) {
            throw new IllegalArgumentException("Sức chứa lớp học không thể vượt quá sức chứa phòng");
        }
    }

    private void validateCoach(Integer coachId) {
        validateCoachAccount(userRepository.findByIdForUpdate(coachId)
                .orElseThrow(() -> new IllegalArgumentException("Huấn luyện viên không tồn tại")));
    }

    private void validateCoachAccount(User coach) {
        if (coach.getRole() == null || !"COACH".equals(coach.getRole().getRoleName())) {
            throw new IllegalArgumentException("Tài khoản được chọn không phải huấn luyện viên");
        }
        if (!"ACTIVE".equals(coach.getStatus())) {
            throw new IllegalArgumentException("Huấn luyện viên phải có tài khoản đang hoạt động");
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
                .regularClassId(clazz.getRegularClassId())
                .courseId(clazz.getCourseId())
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
