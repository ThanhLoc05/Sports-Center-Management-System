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
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    @Override
    public BookingResponse bookClass(Integer classId, Integer memberId) {
        if (classId == null || memberId == null) {
            throw new IllegalArgumentException("Lớp học và thành viên là bắt buộc");
        }

        Classes clazz = classRepository.findByIdForUpdate(classId)
                .orElseThrow(() -> new IllegalArgumentException("Lớp học không tồn tại"));
        if (!"SCHEDULED".equals(clazz.getStatus())
                || !clazz.getScheduleTime().isAfter(LocalDateTime.now())) {
            throw new IllegalArgumentException("Lớp học không mở đăng ký");
        }

        userRepository.findById(memberId)
                .filter(user -> "ACTIVE".equals(user.getStatus()))
                .orElseThrow(() -> new IllegalArgumentException("Thành viên không tồn tại hoặc không hoạt động"));

        // RÀNG BUỘC 1: Học viên BẮT BUỘC phải có gói tập ACTIVE và còn hạn
        var activeSubscription = subscriptionRepository.findActiveMembership(memberId);
        if (activeSubscription.isEmpty()) {
            throw new IllegalArgumentException("Học viên chưa có gói tập hợp lệ hoặc gói tập đã hết hạn. Vui lòng thanh toán gói tập trước khi đặt lịch.");
        }
        var memberPackage = packageRepository.findById(activeSubscription.get().getPackageId())
                .orElseThrow(() -> new IllegalStateException("Gói của hội viên không tồn tại"));
        String packageLevel = normalizeAccessLevel(memberPackage.getAccessLevel());
        String requiredLevel = normalizeAccessLevel(clazz.getRequiredAccessLevel());
        if ("VIP".equals(requiredLevel) && !"VIP".equals(packageLevel)) {
            throw new IllegalArgumentException("Lớp này chỉ dành cho hội viên gói VIP");
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

        for (ClassBooking b : activeBookings) {
            if (b.getClassId().equals(classId)) continue;
            Optional<Classes> otherOpt = classRepository.findById(b.getClassId());
            if (otherOpt.isPresent()) {
                Classes other = otherOpt.get();
                if ("SCHEDULED".equals(other.getStatus())) {
                    LocalDateTime otherStart = other.getScheduleTime();
                    int otherDuration = other.getDurationMinutes() != null ? other.getDurationMinutes() : 60;
                    LocalDateTime otherEnd = otherStart.plusMinutes(otherDuration);

                    // Lịch bị trùng khi hai khoảng thời gian giao nhau.
                    if (newStart.isBefore(otherEnd) && otherStart.isBefore(newEnd)) {
                        throw new IllegalArgumentException(String.format(
                                "Học viên bị trùng lịch với lớp '%s' (%s - %s)",
                                other.getClassName(), otherStart.toLocalTime(), otherEnd.toLocalTime()));
                    }
                }
            }
        }

        // Kiểm tra sức chứa tối đa của lớp học
        long bookedCount = bookingRepository.countByClassIdAndStatus(classId, "BOOKED");
        if (bookedCount >= clazz.getMaxCapacity()) {
            throw new IllegalArgumentException("Lớp học đã đủ số lượng tối đa");
        }

        ClassBooking booking = existing.orElseGet(ClassBooking::new);
        booking.setClassId(classId);
        booking.setMemberId(memberId);
        booking.setBookedAt(LocalDateTime.now());
        booking.setStatus("BOOKED");
        return toResponse(bookingRepository.save(booking));
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
        ClassBooking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new IllegalArgumentException("Lượt đặt chỗ không tồn tại"));

        if (!"BOOKED".equals(booking.getStatus())) {
            throw new IllegalArgumentException("Chỉ có thể hủy lượt đặt chỗ đang có hiệu lực");
        }

        booking.setStatus("CANCELLED");
        return toResponse(bookingRepository.save(booking));
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
