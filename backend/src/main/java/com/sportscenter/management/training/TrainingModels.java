package com.sportscenter.management.training;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import com.sportscenter.management.dto.Response.InvoiceResponse;
import com.sportscenter.management.payment.BankAccountData;

public final class TrainingModels {
    private TrainingModels() {}

    public record SlotInput(@NotNull @Min(1) @Max(7) Integer dayOfWeek,
            @NotNull LocalTime startTime, @NotNull LocalTime endTime,
            @NotNull @Positive Integer coachId, @NotNull @Positive Integer roomId) {}

    public record ProgramInput(@NotBlank @Size(max=150) String name,
            @NotNull @Positive Integer sportId, @Size(max=2000) String description,
            @NotBlank @Size(max=100) String trainingLevel,
            @NotNull @Positive Integer maxCapacity,
            @NotNull @Pattern(regexp="STANDARD|VIP") String requiredAccessLevel,
            @NotEmpty @Size(max=7) List<@Valid SlotInput> slots,
            @Min(1) @Max(520) Integer totalSessions, LocalDate startDate,
            @DecimalMin("1") BigDecimal price, Boolean discountEligible) {}

    public record Availability(@Min(1) @Max(7) Integer dayOfWeek, LocalDate date,
            LocalTime fromTime, LocalTime toTime) {}

    public record SearchInput(@Positive Integer sportId, @Positive Integer coachId,
            List<@Valid Availability> availability, @Positive Integer memberId) {}

    public record Slot(int id, int dayOfWeek, LocalTime startTime, LocalTime endTime,
            int coachId, String coachName, int roomId, String roomName) {}

    public record Program(int id, String kind, String name, int sportId, String sportName,
            String description, String trainingLevel, int maxCapacity, String requiredAccessLevel,
            String status, List<Slot> slots, Integer totalSessions, LocalDate startDate, LocalDate endDate,
            BigDecimal price, boolean discountEligible, int discountPercent, BigDecimal payableAmount,
            int remainingCapacity, boolean eligible, String eligibilityReason,
            boolean registered, LocalDate registrationUntil) {}

    public record Registration(int id, int regularClassId, String className, int memberId,
            int subscriptionId, LocalDate validFrom, LocalDate validUntil, String status) {}

    public record CourseOrderInput(@NotNull @Positive Integer courseId, @Positive Integer memberId,
            @NotNull @Pattern(regexp="CASH|BANK_TRANSFER") String paymentMethod) {}

    public record CancelCoursesInput(@NotEmpty List<@NotNull @Positive Integer> courseIds,
            @NotNull @Positive Integer expectedSessions) {}

    public record ConfirmInput(@NotNull @Min(0) Integer version) {}

    public record CourseOrder(int id, int courseId, String courseName, int memberId, String memberName,
            int subscriptionId, String status, String paymentMethod, BigDecimal listPrice,
            int discountPercent, BigDecimal amount, LocalDateTime createdAt, LocalDateTime expiresAt,
            LocalDateTime confirmedAt, int version, InvoiceResponse invoice,
            String paymentReference, BankAccountData bankAccount) {}

    public record Occurrence(LocalDateTime start, LocalDateTime end, SlotInput slot) {}
}
