package com.sportscenter.auth;

import com.sportscenter.management.entity.User;
import com.sportscenter.management.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
@RequiredArgsConstructor
public class SecurityUtils {

    private final UserService userService;

    public static String getCurrentUserEmail() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) return null;
        return authentication.getName();
    }

    public Optional<User> getCurrentUser() {
        String email = getCurrentUserEmail();
        if (email == null) return Optional.empty();
        return userService.getUserByEmail(email);
    }

    public Integer getCurrentUserId() {
        return getCurrentUser().map(User::getId).orElse(null);
    }

    public boolean hasRole(String roleName) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return false;
        return auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_" + roleName) || a.getAuthority().contains(roleName));
    }

    public boolean isCenterManager() {
        return hasRole("CENTER_MANAGER");
    }

    public boolean isReceptionist() {
        return hasRole("RECEPTIONIST");
    }

    public boolean isCoach() {
        return hasRole("COACH");
    }

    /**
     * Return true if current user is the owner (ownerId) OR receptionist OR center manager.
     * Use this to authorize member-scoped endpoints.
     */
    public boolean isOwnerOrAuthorized(Integer ownerId) {
        if (ownerId == null) return false;
        Integer current = getCurrentUserId();
        if (current != null && current.equals(ownerId)) return true;
        return isReceptionist() || isCenterManager();
    }
}