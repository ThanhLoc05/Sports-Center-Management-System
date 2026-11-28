package com.sportscenter.management.controller;

import com.sportscenter.auth.*;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.*;
import com.sportscenter.management.dto.Response.UserResponse;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AccountActionControllerTest {
    @Configuration @EnableWebMvc
    @Import({SecurityConfig.class, ApiExceptionHandler.class})
    static class Config {
        @Bean UserRepository users() { return mock(UserRepository.class); }
        @Bean JwtService jwt() { return new JwtService(Base64.getEncoder().encodeToString(new byte[32]), 60000); }
        @Bean AccountActionService actions() { return mock(AccountActionService.class); }
        @Bean PasswordResetOtpService resetOtps() {
            var service = mock(PasswordResetOtpService.class);
            when(service.requestCode(anyString())).thenAnswer(call -> java.time.Instant.now().plusSeconds(60));
            return service;
        }
        @Bean AccountActionController actionsController(AccountActionService actions, PasswordResetOtpService otps) { return new AccountActionController(actions, otps); }
        @Bean UserService service() { return mock(UserService.class); }
        @Bean SecurityUtils security() { var utils=mock(SecurityUtils.class); when(utils.getCurrentUserId()).thenReturn(1); return utils; }
        @Bean UserController usersController(UserService service, JwtService jwt, SecurityUtils utils, UserRepository users) {
            return new UserController(service,jwt,utils,mock(BookingService.class),mock(ClassService.class),mock(CoachProfileService.class),users);
        }
    }
    AnnotationConfigWebApplicationContext context; MockMvc mvc;
    @BeforeEach void setup() {
        context=new AnnotationConfigWebApplicationContext(); context.setServletContext(new MockServletContext());
        context.register(Config.class); context.refresh();
        mvc=MockMvcBuilders.webAppContextSetup(context).addFilters(context.getBean(FilterChainProxy.class)).build();
    }
    @AfterEach void close() { context.close(); }
    @Test void publicActionsAreReachableWithoutJwtAndValidated() throws Exception {
        mvc.perform(post("/api/v1/users/verify-email").contentType("application/json").content("{\"token\":\"test-marker\"}"))
                .andExpect(status().isOk());
        verify(context.getBean(AccountActionService.class)).verifyEmail("test-marker");
        mvc.perform(post("/api/v1/users/verify-email").contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());
        for(String path:List.of("forgot-password","resend-verification"))
            mvc.perform(post("/api/v1/users/"+path).contentType("application/json").content("{\"email\":\"missing@example.test\"}"))
                .andExpect(status().is(path.equals("forgot-password") ? 202 : 200));
        mvc.perform(post("/api/v1/users/reset-password").contentType("application/json")
                .content("{\"token\":\"test-marker\",\"newPassword\":\"new-password\"}"))
                .andExpect(status().isOk());
    }
    @Test void resetOtpEndpointsArePublicValidateSixDigitsAndReportExhaustion() throws Exception {
        var otps = context.getBean(PasswordResetOtpService.class);
        mvc.perform(post("/api/v1/users/forgot-password/resend-code").contentType("application/json")
                .content("{\"email\":\"member@example.com\"}"))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.expiresAtEpochMs").isNumber());
        String body = "{\"email\":\"member@example.com\",\"code\":\"123456\"}";
        when(otps.verify("member@example.com", "123456"))
                .thenReturn(new PasswordResetOtpService.Verification(null, 4));
        mvc.perform(post("/api/v1/users/forgot-password/verify-code").contentType("application/json").content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.attemptsRemaining").value(4));
        when(otps.verify("member@example.com", "123456"))
                .thenReturn(new PasswordResetOtpService.Verification(null, 0));
        mvc.perform(post("/api/v1/users/forgot-password/verify-code").contentType("application/json").content(body))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.attemptsRemaining").value(0));
        when(otps.verify("member@example.com", "123456"))
                .thenReturn(new PasswordResetOtpService.Verification(new AccountActionService.PasswordResetGrant("test-grant", 123456L), 1));
        mvc.perform(post("/api/v1/users/forgot-password/verify-code").contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.token").value("test-grant"));
        clearInvocations(otps);
        for (String code : List.of("12345", "12ab56", "1234567")) {
            mvc.perform(post("/api/v1/users/forgot-password/verify-code").contentType("application/json")
                    .content("{\"email\":\"member@example.com\",\"code\":\"" + code + "\"}"))
                    .andExpect(status().isBadRequest());
        }
        verify(otps, never()).verify(anyString(), anyString());
    }
    @Test void mailErrorResponseDoesNotExposeUpstreamDetail() throws Exception {
        doThrow(new org.springframework.mail.MailSendException("private-upstream-marker"))
                .when(context.getBean(AccountActionService.class)).verifyEmail("test-marker");
        mvc.perform(post("/api/v1/users/verify-email").contentType("application/json").content("{\"token\":\"test-marker\"}"))
                .andExpect(status().isServiceUnavailable()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("private-upstream-marker"))));
    }
    @Test void internalProvisioningRequiresJwtAndManagerRoleForStaff() throws Exception {
        mvc.perform(post("/api/v1/users/staff").contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        var users=context.getBean(UserRepository.class);
        for(String role:List.of("MEMBER","CENTER_MANAGER")) {
            var account=com.sportscenter.management.entity.User.builder().id(1).email(role+"@example.test")
                    .status("ACTIVE").passwordHash("test-only").role(com.sportscenter.management.entity.Role.builder().roleName(role).build()).build();
            when(users.findByEmail(account.getEmail())).thenReturn(Optional.of(account));
            String jwt=context.getBean(JwtService.class).generateToken(context.getBean(org.springframework.security.core.userdetails.UserDetailsService.class).loadUserByUsername(account.getEmail()));
            when(context.getBean(UserService.class).createStaff(any(),eq(1))).thenReturn(UserResponse.builder().id(5).roleName("COACH").build());
            mvc.perform(post("/api/v1/users/staff").header("Authorization","Bearer "+jwt).contentType("application/json")
                    .content("{\"email\":\"coach@example.test\",\"password\":\"test-password\",\"fullName\":\"Coach Test\",\"phone\":\"0900000010\",\"roleName\":\"COACH\"}"))
                    .andExpect(status().is(role.equals("MEMBER")?403:201));
        }
    }
}
