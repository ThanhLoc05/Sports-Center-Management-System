package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.service.RecurringClassService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/classes/recurring")
@PreAuthorize("hasRole('CENTER_MANAGER')")
@RequiredArgsConstructor
public class RecurringClassController {
    private final RecurringClassService service;

    public record Series(@NotNull @Valid ClassRequest session, @NotNull LocalDate through,
                         @NotNull Set<DayOfWeek> weekdays) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public List<ClassResponse> publish(@Valid @RequestBody Series request) {
        return service.publish(request.session(), request.through(), request.weekdays());
    }

    @GetMapping
    public List<RecurringClassService.PublishedSession> published() {
        return service.published();
    }
}
