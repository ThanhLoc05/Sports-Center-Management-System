package com.sportscenter.management.training;

import com.sportscenter.management.dto.Response.ClassResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.sportscenter.management.training.TrainingModels.*;

@RestController @RequestMapping("/api/v1") @RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class TrainingController {
    private final TrainingProgramService programs;
    private final TrainingAccessService access;
    private final CourseOrderService orders;
    private final CourseFeature courseFeature;

    @GetMapping("/features")
    public Map<String, Boolean> features() {
        return Map.of("courseEnabled", courseFeature.isEnabled());
    }

    @GetMapping("/training-access")
    public Map<String,Object> access(@RequestParam(required=false) Integer memberId) {
        Integer member=access.selectedMember(memberId);
        var result=new LinkedHashMap<String,Object>();
        var current=member==null?Optional.<TrainingAccessService.Access>empty():access.findAccess(member);
        result.put("hasActiveMembership",current.isPresent());
        current.ifPresent(value->{
            result.put("memberId",member);result.put("subscriptionId",value.subscriptionId());
            result.put("accessLevel",value.level());result.put("startDate",value.startDate());result.put("endDate",value.endDate());
            result.put("sportLimit",value.sportLimit());result.put("maxConcurrentClasses",value.maxClasses());
            result.put("courseDiscountPercent",value.discountPercent());result.put("selectedSportIds",access.selectedSports(value));
            result.put("activeClassCount",access.activeClassCount(value,null));
        });
        return result;
    }

    @PostMapping("/regular-classes/search")
    public List<Program> regularSearch(@Valid @RequestBody SearchInput request) { return programs.search("REGULAR",request); }
    @GetMapping("/regular-classes")
    public List<Program> regularList() { return programs.search("REGULAR",null); }
    @GetMapping("/regular-classes/{id}")
    public Program regularDetail(@PathVariable int id,@RequestParam(required=false) Integer memberId) { return programs.detail("REGULAR",id,memberId); }
    @GetMapping("/regular-classes/{id}/sessions")
    public List<ClassResponse> regularSessions(@PathVariable int id) { programs.detail("REGULAR",id,null); return programs.sessions("REGULAR",id); }
    @PostMapping("/regular-classes") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('CENTER_MANAGER')")
    public Program createRegular(@Valid @RequestBody ProgramInput request) { return programs.save("REGULAR",null,request); }
    @PutMapping("/regular-classes/{id}") @PreAuthorize("hasRole('CENTER_MANAGER')")
    public Program updateRegular(@PathVariable int id,@Valid @RequestBody ProgramInput request) { return programs.save("REGULAR",id,request); }
    @PatchMapping("/regular-classes/{id}/status") @PreAuthorize("hasRole('CENTER_MANAGER')")
    public Program regularStatus(@PathVariable int id,@RequestParam String status) { return programs.setStatus("REGULAR",id,status); }
    @PostMapping("/regular-classes/{id}/register")
    public Registration register(@PathVariable int id,@RequestParam(required=false) Integer memberId) { return programs.register(id,memberId); }
    @GetMapping("/class-registrations")
    public List<Registration> registrations(@RequestParam(required=false) Integer memberId) { return programs.registrations(memberId); }
    @DeleteMapping("/class-registrations/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable int id) { programs.cancelRegistration(id); }

    @PostMapping("/courses/search")
    public List<Program> courseSearch(@Valid @RequestBody SearchInput request) { courseFeature.requireEnabled(); return programs.search("COURSE",request); }
    @GetMapping("/courses")
    public List<Program> courseList() { courseFeature.requireEnabled(); return programs.search("COURSE",null); }
    @GetMapping("/courses/{id}")
    public Program courseDetail(@PathVariable int id,@RequestParam(required=false) Integer memberId) { courseFeature.requireEnabled(); return programs.detail("COURSE",id,memberId); }
    @GetMapping("/courses/{id}/sessions")
    public List<ClassResponse> courseSessions(@PathVariable int id) { courseFeature.requireEnabled(); programs.detail("COURSE",id,null); return programs.sessions("COURSE",id); }
    @PostMapping("/courses/preview") @PreAuthorize("hasRole('CENTER_MANAGER')")
    public List<Occurrence> preview(@Valid @RequestBody ProgramInput request) { courseFeature.requireEnabled(); return TrainingPolicy.courseOccurrences(request.slots(),request.startDate(),request.totalSessions()); }
    @PostMapping("/courses") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('CENTER_MANAGER')")
    public Program createCourse(@Valid @RequestBody ProgramInput request) { return programs.save("COURSE",null,request); }
    @PutMapping("/courses/{id}") @PreAuthorize("hasRole('CENTER_MANAGER')")
    public Program updateCourse(@PathVariable int id,@Valid @RequestBody ProgramInput request) { return programs.save("COURSE",id,request); }
    @PostMapping("/courses/{id}/cancel") @PreAuthorize("hasRole('CENTER_MANAGER')")
    public Program cancelCourse(@PathVariable int id) { return programs.setStatus("COURSE",id,"CANCELLED"); }

    @PostMapping("/courses/cancel") @PreAuthorize("hasRole('CENTER_MANAGER')")
    public List<Program> cancelPausedCourses(@Valid @RequestBody CancelCoursesInput request) {
        return programs.cancelPausedCourses(request);
    }

    @PostMapping("/course-orders") @ResponseStatus(HttpStatus.CREATED)
    public CourseOrder createOrder(@Valid @RequestBody CourseOrderInput request,@RequestHeader(value="Idempotency-Key",required=false) String key) { return orders.create(request,key); }
    @GetMapping("/course-orders")
    public List<CourseOrder> orders(@RequestParam(required=false) Integer memberId) { return orders.list(memberId); }
    @GetMapping("/course-orders/{id}")
    public CourseOrder order(@PathVariable int id) { return orders.detail(id); }
    @PostMapping("/course-orders/{id}/confirm-payment") @PreAuthorize("hasAnyRole('CENTER_MANAGER','RECEPTIONIST')")
    public CourseOrder confirm(@PathVariable int id,@Valid @RequestBody ConfirmInput request) { return orders.confirmCash(id,request.version()); }
    @PostMapping("/course-orders/{id}/cancel")
    public CourseOrder cancelOrder(@PathVariable int id) { return orders.cancel(id); }
    @PostMapping("/course-orders/{id}/reconcile")
    public CourseOrder reconcile(@PathVariable int id) { return orders.reconcile(id); }
}
