package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.service.ClassService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/classes")
@RequiredArgsConstructor
public class ClassController {

    private final ClassService classService;

    @PostMapping
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

    @PutMapping("/{classId}")
    public ClassResponse updateClass(@PathVariable Integer classId, @RequestBody ClassRequest request) {
        return classService.updateClass(classId, request);
    }

    @PostMapping("/{classId}/cancel")
    public ClassResponse cancelClass(@PathVariable Integer classId) {
        return classService.cancelClass(classId);
    }

    @GetMapping("/{classId}/capacity")
    public int getAvailableCapacity(@PathVariable Integer classId) {
        return classService.getAvailableCapacity(classId);
    }
}
