package com.sportscenter.management.controller;

import com.sportscenter.management.service.RecurringClassService;
import com.sportscenter.management.service.WeeklyScheduleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/v1/classes/recurring")
@PreAuthorize("hasRole('CENTER_MANAGER')")
@RequiredArgsConstructor
public class RecurringClassController {
    private final RecurringClassService service;
    private final WeeklyScheduleService weeklySchedule;

    @PostMapping
    public void requirePreview() {
        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Hãy xem trước Lịch tuần mẫu rồi xác nhận để tạo buổi học.");
    }

    @PostMapping("/preview")
    public WeeklyScheduleService.Preview preview(@Valid @RequestBody WeeklyScheduleService.Request request) {
        return weeklySchedule.preview(request);
    }

    @PostMapping("/confirm")
    @ResponseStatus(HttpStatus.CREATED)
    public WeeklyScheduleService.Confirmation confirm(@Valid @RequestBody WeeklyScheduleService.Request request) {
        return weeklySchedule.confirm(request);
    }

    @GetMapping
    public List<RecurringClassService.PublishedSession> published() {
        return service.published();
    }
}
