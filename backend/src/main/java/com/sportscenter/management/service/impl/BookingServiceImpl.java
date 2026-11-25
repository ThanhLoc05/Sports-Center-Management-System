package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Response.BookingResponse;
import com.sportscenter.management.dto.Response.ClassStudentResponse;
import com.sportscenter.management.entity.ClassBooking;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.MemberProfile;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.MemberProfileRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.BookingService;
import com.sportscenter.management.service.MemberClassNotifications;
import com.sportscenter.management.service.FlexibleBookingPolicy;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional
public class BookingServiceImpl implements BookingService {

    private final ClassRepository classRepository;
    private final ClassBookingRepository bookingRepository;
    private final UserRepository userRepository;
    private final MemberProfileRepository profileRepository;
    private final MemberSubscriptionRepository subscriptionRepository;
    private final MembershipPackageRepository packageRepository;
    private final com.sportscenter.management.service.MemberReminderService reminders;

    private final MemberClassNotifications classNotifications;
    private final EntityManager entityManager;
    private final FlexibleBookingPolicy policy;
    private final com.sportscenter.management.training.TrainingAccessService trainingAccess;

    @Value("${app.booking.maximum-held:5}")
    private int maximumHeld = 5;

    @Value("${app.booking.advance-days:7}")
    private int advanceDays = 7;

    @Override
    public List<BookingResponse> bookClasses(List<Integer> classIds, Integer memberId) {
        if (classIds == null || classIds.isEmpty() || classIds.size() > maximumHeld
                || classIds.stream().anyMatch(id -> id == null || id <= 0)
                || classIds.stream().distinct().count() != classIds.size()) {
            throw new IllegalArgumentException("Chọn các buổi khác nhau và không vượt quá giới hạn giữ chỗ.");
        }
        trainingAccess.lock();
        // Use the same class-before-member lock order as single booking and rescheduling.
        for (Integer id : classIds.stream().sorted().toList()) {
            Classes session = classRepository.findByIdForUpdate(id).orElseThrow(() ->
                    new ResponseStatusException(HttpStatus.CONFLICT, "Buổi #" + id + " không còn tồn tại."));
            if (session.getRegularClassId() != null || session.getCourseId() != null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Buổi #" + id + " thuộc lớp cố định hoặc khóa học. Vui lòng đăng ký theo chương trình.");
            }
        }
        return classIds.stream().map(id -> {
            try {
                return bookClass(id, memberId);
            } catch (IllegalArgumentException failure) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Buổi #" + id + ": " + failure.getMessage(), failure);
            } catch (ResponseStatusException failure) {
                throw new ResponseStatusException(failure.getStatusCode(),
                        "Buổi #" + id + ": " + failure.getReason(), failure);
            }
        }).toList();
    }

    @Override
    public BookingResponse acceptWaitlist(Integer classId, Integer memberId) {
        trainingAccess.lock();
        return bookClass(classId, memberId, true);
    }

    @Override
    public BookingResponse bookClass(Integer classId, Integer memberId) {
        trainingAccess.lock();
        return bookClass(classId, memberId, false);
    }

    private BookingResponse bookClass(Integer classId, Integer memberId, boolean invitationRequired) {
        if (classId == null || memberId == null) {
            throw new IllegalArgumentException("Lớp học và thành viên là bắt buộc");
        }

        // Booking and rescheduling both lock the target class before its members.
        Classes clazz = classRepository.findByIdForUpdate(classId)
                .orElseThrow(() -> new IllegalArgumentException("Lớp học không tồn tại"));
        boolean flexible = clazz.getRegularClassId() == null && clazz.getCourseId() == null;
        if (!flexible && invitationRequired) throw new ResponseStatusException(HttpStatus.CONFLICT, "Danh sách chờ chỉ dành cho buổi đặt lẻ.");
        LocalDateTime now = policy.now();
        if (!"SCHEDULED".equals(clazz.getStatus())
                || !clazz.getScheduleTime().isAfter(now)) {
            throw new IllegalArgumentException("Lớp học không mở đăng ký");
        }
        if (flexible && clazz.getScheduleTime().isAfter(now.plusDays(advanceDays))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Chỉ được đăng ký trước tối đa " + advanceDays + " ngày.");
        }

        userRepository.findByIdForUpdate(memberId)
                .filter(user -> "ACTIVE".equals(user.getStatus()) && user.getRole() != null
                        && "MEMBER".equals(user.getRole().getRoleName()))
                .orElseThrow(() -> new IllegalArgumentException("Thành viên không tồn tại hoặc không hoạt động"));

        // RÀNG BUỘC 1: Học viên BẮT BUỘC phải có gói tập ACTIVE và còn hạn
        var classDate = clazz.getScheduleTime().toLocalDate();
        var activeSubscription = subscriptionRepository
                .findFirstByMemberIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateDescIdDesc(
                        memberId, "ACTIVE", classDate, classDate);
        if (activeSubscription.isEmpty()) {
            throw new IllegalArgumentException("Học viên chưa có gói tập hợp lệ hoặc gói tập đã hết hạn. Vui lòng thanh toán gói tập trước khi đặt lịch.");
        }
        var subscription = activeSubscription.get();
        if (!flexible) trainingAccess.validateSessionBooking(clazz, memberId);
        var memberPackage = packageRepository.findById(subscription.getPackageId())
                .orElseThrow(() -> new IllegalStateException("Gói của hội viên không tồn tại"));
        String packageLevel = normalizeAccessLevel(subscription.getEntitlementLevel() == null
                ? memberPackage.getAccessLevel() : subscription.getEntitlementLevel());
        String requiredLevel = normalizeAccessLevel(clazz.getRequiredAccessLevel());
        if ("VIP".equals(requiredLevel) && !"VIP".equals(packageLevel)) {
            throw new IllegalArgumentException("Lớp này chỉ dành cho hội viên gói VIP");
        }
        if (flexible && "STANDARD".equals(packageLevel) && !clazz.getSportId().equals(subscription.getSelectedSportId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, subscription.getSelectedSportId() == null
                    ? "Chọn bộ môn cho kỳ STANDARD trước khi đăng ký buổi mới."
                    : "Buổi này không thuộc bộ môn của kỳ STANDARD.");
        }

        // RÀNG BUỘC 2: Kiểm tra xem học viên đã đăng ký chính lớp này chưa
        Optional<ClassBooking> existing = bookingRepository.findByClassIdAndMemberId(classId, memberId);
        if (existing.isPresent() && "BOOKED".equals(existing.get().getStatus())) {
            throw new IllegalArgumentException("Thành viên đã đăng ký lớp học này");
        }

        // RÀNG BUỘC 3: Kiểm tra trùng giờ học giữa các lớp mà học viên đã đăng ký
        LocalDateTime newStart = clazz.getScheduleTime();
        int newDuration = clazz.getDurationMinutes() != null ? clazz.getDurationMinutes() : 60;
        LocalDateTime newEnd = newStart.plusMinutes(newDuration);

        List<ClassBooking> activeBookings = bookingRepository.findByMemberId(memberId).stream()
                .filter(b -> "BOOKED".equals(b.getStatus()))
                .toList();

        int held = 0;
        for (ClassBooking b : activeBookings) {
            if (b.getClassId().equals(classId)) continue;
            Optional<Classes> otherOpt = classRepository.findById(b.getClassId());
            if (otherOpt.isPresent()) {
                Classes other = otherOpt.get();
                if ("SCHEDULED".equals(other.getStatus())) {
                    LocalDateTime otherStart = other.getScheduleTime();
                    int otherDuration = other.getDurationMinutes() != null ? other.getDurationMinutes() : 60;
                    LocalDateTime otherEnd = otherStart.plusMinutes(otherDuration);
                    if (otherEnd.isAfter(now) && other.getRegularClassId() == null && other.getCourseId() == null) held++;

                    // Lịch bị trùng khi hai khoảng thời gian giao nhau.
                    if (newStart.isBefore(otherEnd) && otherStart.isBefore(newEnd)) {
                        throw new IllegalArgumentException(String.format(
                                "Học viên bị trùng lịch với lớp '%s' (%s - %s)",
                                other.getClassName(), otherStart.toLocalTime(), otherEnd.toLocalTime()));
                    }
                }
            }
        }
        trainingAccess.requireNoMemberConflict(memberId, newStart, newEnd, clazz.getRegularClassId(), clazz.getCourseId(), classId);
        int holdLimit = flexible ? policy.holdingLimit(memberId, maximumHeld) : Integer.MAX_VALUE;
        if (held >= holdLimit) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Đã đạt giới hạn " + holdLimit + " buổi đang giữ chỗ.");
        }

        // Kiểm tra sức chứa tối đa của lớp học
        if (flexible) policy.advance(clazz);
        if (invitationRequired) policy.requireInvitation(classId, memberId);
        if (policy.available(clazz, memberId) <= 0) {
            throw new IllegalArgumentException("Lớp học đã đủ số lượng tối đa");
        }

        ClassBooking booking = existing.orElseGet(ClassBooking::new);
        booking.setClassId(classId);
        booking.setMemberId(memberId);
        LocalDateTime bookedAt = now;
        // Match SQL Server DATETIME2 precision so the event identity survives a reload.
        bookedAt = bookedAt.withNano(bookedAt.getNano() / 100 * 100);
        if (booking.getBookedAt() != null && !bookedAt.isAfter(booking.getBookedAt())) {
            bookedAt = booking.getBookedAt().plusNanos(100);
        }
        booking.setBookedAt(bookedAt);
        booking.setStatus("BOOKED");
        var saved=bookingRepository.saveAndFlush(booking);
        if (flexible) policy.acceptIfInvited(classId, memberId);
        reminders.remindClass(classId);
        classNotifications.bookingConfirmed(saved, clazz);
        return toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<BookingResponse> getBookingById(Integer bookingId) {
        return bookingRepository.findById(bookingId).map(this::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public List<BookingResponse> getClassBookings(Integer classId) {
        if (!classRepository.existsById(classId)) {
            throw new IllegalArgumentException("Lớp học không tồn tại");
        }
        return bookingRepository.findByClassId(classId).stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ClassStudentResponse> getClassStudents(Integer classId) {
        if (!classRepository.existsById(classId)) {
            throw new IllegalArgumentException("Lớp học không tồn tại");
        }

        List<ClassBooking> bookings = bookingRepository.findByClassId(classId).stream()
                .filter(b -> "BOOKED".equals(b.getStatus()))
                .toList();

        return bookings.stream().map(b -> {
            Optional<User> userOpt = userRepository.findById(b.getMemberId());
            Optional<MemberProfile> profileOpt = profileRepository.findById(b.getMemberId());

            return ClassStudentResponse.builder()
                    .memberId(b.getMemberId())
                    .fullName(userOpt.map(User::getFullName).orElse("Không xác định"))
                    .email(userOpt.map(User::getEmail).orElse(""))
                    .phone(userOpt.map(User::getPhone).orElse(""))
                    .gender(profileOpt.map(MemberProfile::getGender).orElse(null))
                    .fitnessGoals(profileOpt.map(MemberProfile::getFitnessGoals).orElse(null))
                    .bookedAt(b.getBookedAt())
                    .bookingStatus(b.getStatus())
                    .build();
        }).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<BookingResponse> getMemberBookings(Integer memberId) {
        if (!userRepository.existsById(memberId)) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }
        return bookingRepository.findByMemberId(memberId).stream().map(this::toResponse).toList();
    }

    @Override
    public BookingResponse cancelBooking(Integer bookingId) {
        trainingAccess.lock();
        ClassBooking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new IllegalArgumentException("Lượt đặt chỗ không tồn tại"));

        // Serialize with booking, rescheduling and Manager cancellation on the same class.
        Classes clazz = classRepository.findByIdForUpdate(booking.getClassId())
                .orElseThrow(() -> new IllegalArgumentException("Lớp học không tồn tại"));
        if (clazz.getRegularClassId() != null || clazz.getCourseId() != null) {
            throw new IllegalArgumentException("Hãy hủy đăng ký lịch lớp hoặc xử lý đơn khóa học.");
        }
        // Match booking's lock order before touching the reservation row.
        userRepository.findByIdForUpdate(booking.getMemberId()).orElseThrow();
        // The controller's ownership check may have already loaded the booking in this request.
        entityManager.refresh(booking);
        if (!"BOOKED".equals(booking.getStatus())) {
            throw new IllegalArgumentException("Chỉ có thể hủy lượt đặt chỗ đang có hiệu lực");
        }
        if (!"SCHEDULED".equals(clazz.getStatus()) || !clazz.getScheduleTime().isAfter(policy.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Chỉ được hủy trước khi buổi bắt đầu.");
        }

        booking.setStatus("CANCELLED");
        var saved = bookingRepository.saveAndFlush(booking);
        policy.recordCancellation(clazz, booking.getMemberId());
        policy.advance(clazz);
        classNotifications.bookingCancelled(saved, clazz);
        return toResponse(saved);
    }

    private BookingResponse toResponse(ClassBooking booking) {
        return BookingResponse.builder()
                .id(booking.getId())
                .classId(booking.getClassId())
                .memberId(booking.getMemberId())
                .bookedAt(booking.getBookedAt())
                .status(booking.getStatus())
                .build();
    }

    private String normalizeAccessLevel(String accessLevel) {
        if (accessLevel == null || accessLevel.isBlank()) return "STANDARD";
        String normalized = accessLevel.trim().toUpperCase();
        if (!"STANDARD".equals(normalized) && !"VIP".equals(normalized)) {
            throw new IllegalStateException("Cấp độ quyền truy cập không hợp lệ trong database");
        }
        return normalized;
    }
}
