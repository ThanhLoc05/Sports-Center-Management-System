package com.sportscenter.workout;

import com.sportscenter.user.UserService;
import com.sportscenter.workout.dto.WorkoutRequests;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class WorkoutController {
    private final WorkoutService service;
    private final UserService users;

    public WorkoutController(WorkoutService service, UserService users) {
        this.service = service;
        this.users = users;
    }

    @PostMapping("/workouts/plans")
    @PreAuthorize("hasRole('COACH')")
    public Map<String, Object> createWorkoutPlan(@AuthenticationPrincipal UserDetails user,
                                                 @Valid @RequestBody WorkoutRequests.WorkoutPlanRequest request) {
        return service.createWorkoutPlan(users.memberId(user.getUsername()), request.title(),
                request.memberId(), request.classId(), request.description());
    }

    @GetMapping("/workouts/plans/mine")
    @PreAuthorize("hasRole('MEMBER')")
    public List<Map<String, Object>> memberWorkoutPlans(@AuthenticationPrincipal UserDetails user) {
        return service.memberWorkoutPlans(user.getUsername());
    }

    @PostMapping("/workouts/logs")
    @PreAuthorize("hasRole('COACH')")
    public Map<String, Object> createWorkoutLog(@AuthenticationPrincipal UserDetails user,
                                                @Valid @RequestBody WorkoutRequests.WorkoutLogRequest request) {
        return service.createWorkoutLog(users.memberId(user.getUsername()), request.memberId(),
                request.scheduleId(), request.feedback(), request.exercises().stream()
                        .map(exercise -> new WorkoutService.ExerciseInput(exercise.name(), exercise.sets(),
                                exercise.reps(), exercise.weightKg()))
                        .collect(Collectors.toList()));
    }

    @GetMapping("/workouts/logs/mine")
    @PreAuthorize("hasRole('MEMBER')")
    public List<Map<String, Object>> memberWorkoutLogs(@AuthenticationPrincipal UserDetails user) {
        return service.memberWorkoutLogs(user.getUsername());
    }
}
