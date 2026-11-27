package com.sportscenter.management.controller;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.service.WeeklyScheduleService;
import com.sportscenter.management.service.WeeklyScheduleSyncService;
import com.sportscenter.management.service.WeeklyScheduleTemplateService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/classes/recurring/template")
@PreAuthorize("hasRole('CENTER_MANAGER')")
@RequiredArgsConstructor
public class WeeklyScheduleTemplateController {
    private final WeeklyScheduleTemplateService templates;
    private final SecurityUtils security;

    @GetMapping
    public WeeklyScheduleTemplateService.Template get() {
        return templates.get();
    }

    @PutMapping
    public WeeklyScheduleTemplateService.Template save(@Valid @RequestBody WeeklyScheduleTemplateService.Save input) {
        return templates.save(input, security.getCurrentUserId());
    }

    @PostMapping("/sync-preview")
    public WeeklyScheduleSyncService.SyncPreview syncPreview(@Valid @RequestBody WeeklyScheduleTemplateService.Save input) {
        return templates.previewSync(input);
    }

    @PostMapping("/preview")
    public WeeklyScheduleService.Preview preview(@Valid @RequestBody WeeklyScheduleTemplateService.Window input) {
        return templates.preview(input);
    }

    @PostMapping("/confirm")
    @ResponseStatus(HttpStatus.CREATED)
    public WeeklyScheduleService.Confirmation confirm(@Valid @RequestBody WeeklyScheduleTemplateService.Window input) {
        return templates.confirm(input);
    }
}
