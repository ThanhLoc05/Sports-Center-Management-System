package com.sportscenter.management.service;

import com.sportscenter.management.dto.Response.BookingResponse;

import java.util.List;
import java.util.Optional;

public interface BookingService {

    BookingResponse bookClass(Integer classId, Integer memberId);

    Optional<BookingResponse> getBookingById(Integer bookingId);

    List<BookingResponse> getClassBookings(Integer classId);

    List<BookingResponse> getMemberBookings(Integer memberId);

    BookingResponse cancelBooking(Integer bookingId);
}
