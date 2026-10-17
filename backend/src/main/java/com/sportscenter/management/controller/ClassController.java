package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.service.ClassService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/classes")
@RequiredArgsConstructor
public class ClassController {

    private final ClassService classService;
    // 🔒 CHỈ MANAGER MỚI ĐƯỢC TẠO LỚP
    @PostMapping
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    public ResponseEntity<ClassResponse> createClass(@RequestBody ClassRequest request) {
        return ResponseEntity.status(201).body(classService.createClass(request));
    }

    @GetMapping
    public List<ClassResponse> getClasses(
            @RequestParam(required = false) Integer sportId,
            @RequestParam(required = false) Integer coachId) {
        return classService.getAllClasses(sportId, coachId);
    }

    @GetMapping("/available")
    public List<ClassResponse> getAvailableClasses() {
        return classService.getAvailableClasses();
    }

    @GetMapping("/{classId}")
    public ResponseEntity<ClassResponse> getClass(@PathVariable Integer classId) {
        return classService.getClassById(classId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
    // 🔒 CHỈ MANAGER MỚI ĐƯỢC SỬA LỚP
    @PutMapping("/{classId}")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    public ClassResponse updateClass(@PathVariable Integer classId, @RequestBody ClassRequest request) {
        return classService.updateClass(classId, request);
    }
    // 🔒 CHỈ MANAGER MỚI ĐƯỢC HỦY LỚP
    @PostMapping("/{classId}/cancel")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    public ClassResponse cancelClass(@PathVariable Integer classId) {
        return classService.cancelClass(classId);
    }

    @GetMapping("/{classId}/capacity")
    public int getAvailableCapacity(@PathVariable Integer classId) {
        return classService.getAvailableCapacity(classId);
    }
}
