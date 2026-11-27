package com.sportscenter.management.training;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class CourseFeature {
    private final boolean enabled;

    public CourseFeature(@Value("${app.course.enabled:false}") boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void requireEnabled() {
        if (!isEnabled()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tính năng khóa học chuyên sâu đang tạm ngừng.");
        }
    }
}
