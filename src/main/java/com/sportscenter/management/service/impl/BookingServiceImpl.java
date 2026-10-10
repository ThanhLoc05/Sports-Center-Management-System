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

        Optional<ClassBooking> existing = bookingRepository.findByClassIdAndMemberId(classId, memberId);
        if (existing.isPresent() && "BOOKED".equals(existing.get().getStatus())) {
            throw new IllegalArgumentException("Thành viên đã đăng ký lớp học này");
        }

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
        List<ClassBooking> bookings = bookingRepository.findByClassId(classId);
        return bookings.stream().map(b -> {
            User user = userRepository.findById(b.getMemberId()).orElse(null);
            MemberProfile profile = profileRepository.findById(b.getMemberId()).orElse(null);
            return ClassStudentResponse.builder()
                    .memberId(b.getMemberId())
                    .fullName(user != null ? user.getFullName() : null)
                    .email(user != null ? user.getEmail() : null)
                    .phone(user != null ? user.getPhone() : null)
                    .gender(profile != null ? profile.getGender() : null)
                    .fitnessGoals(profile != null ? profile.getFitnessGoals() : null)
                    .bookingStatus(b.getStatus())
                    .bookedAt(b.getBookedAt())
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
                .orElseThrow(() -> new IllegalArgumentException("Đăng ký lớp học không tồn tại"));
        if (!"BOOKED".equals(booking.getStatus())) {
            throw new IllegalArgumentException("Đăng ký lớp học không còn hiệu lực");
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
}
