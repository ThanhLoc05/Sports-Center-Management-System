package com.sportscenter.auth;

import com.sportscenter.management.controller.NotificationController;
import com.sportscenter.management.dto.Response.NotificationSendResponse;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.NotificationDeliveryService;
import com.sportscenter.management.service.GeneralNotificationHistory;
import jakarta.servlet.DispatcherType;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.mock.web.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.io.IOException;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SseAsyncSecurityTest {
    AnnotationConfigWebApplicationContext context;
    FilterChainProxy chain;

    @Configuration
    @EnableWebMvc
    @Import({SecurityConfig.class,com.sportscenter.management.controller.ApiExceptionHandler.class})
    static class Config {
        @Bean UserRepository users() { return mock(UserRepository.class); }
        @Bean JwtService jwtService() {
            byte[] key = new byte[32]; new SecureRandom().nextBytes(key);
            return new JwtService(Base64.getEncoder().encodeToString(key), 60000);
        }
        @Bean SecurityUtils securityUtils() { return mock(SecurityUtils.class); }
        @Bean NotificationDeliveryService notifications() { return mock(NotificationDeliveryService.class); }
        @Bean GeneralNotificationHistory history() { return mock(GeneralNotificationHistory.class); }
        @Bean NotificationController controller(NotificationDeliveryService service, SecurityUtils utils,GeneralNotificationHistory history) {
            return new NotificationController(service, utils, history);
        }
    }

    @BeforeEach void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(Config.class); context.refresh();
        chain = context.getBean(FilterChainProxy.class);
        var users = context.getBean(UserRepository.class);
        for (String role : List.of("MEMBER", "COACH", "CENTER_MANAGER", "RECEPTIONIST")) {
            when(users.findByEmail(role + "@test.invalid")).thenReturn(Optional.of(User.builder()
                    .id(role.equals("MEMBER") ? 15 : 14).email(role + "@test.invalid")
                    .passwordHash("unused-test-value").status("ACTIVE")
                    .role(Role.builder().roleName(role).build()).build()));
        }
    }
    @AfterEach void cleanup() { SecurityContextHolder.clearContext(); context.close(); }

    String token(String role) {
        return context.getBean(JwtService.class).generateToken(
                context.getBean(UserDetailsService.class).loadUserByUsername(role + "@test.invalid"));
    }
    MockHttpServletRequest request(String token) {
        var request = new MockHttpServletRequest("GET", "/api/v1/notifications/stream");
        request.setServletPath("/api/v1/notifications/stream");
        if (token != null) request.addHeader("Authorization", "Bearer " + token);
        return request;
    }

    @Test void restoresAuthenticationOnCommittedAsyncRedispatchWithoutSession() throws Exception {
        var request = request(token("MEMBER")); var response = new MockHttpServletResponse();
        var principal = new AtomicReference<String>();
        chain.doFilter(request, response, (req,res) -> {
            principal.set(SecurityContextHolder.getContext().getAuthentication().getName());
            res.getWriter().write(":connected\n\n"); res.flushBuffer();
        });
        assertEquals("MEMBER@test.invalid", principal.get());
        assertTrue(response.isCommitted());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        request.setDispatcherType(DispatcherType.ASYNC);
        principal.set(null);
        assertDoesNotThrow(() -> chain.doFilter(request, response,
                (req,res) -> principal.set(SecurityContextHolder.getContext().getAuthentication().getName())));
        assertEquals("MEMBER@test.invalid", principal.get());
        assertNull(request.getSession(false));
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test void missingAndInvalidJwtStillRejectedIncludingNewAsyncRequests() throws Exception {
        for (var type : List.of(DispatcherType.REQUEST, DispatcherType.ASYNC)) {
            for (String token : new String[]{null,"invalid-test-token"}) {
                var request = request(token); request.setDispatcherType(type);
                var response = new MockHttpServletResponse();
                chain.doFilter(request, response, (req,res) -> fail("Unauthenticated endpoint reached"));
                assertEquals(401,response.getStatus()); assertNull(request.getSession(false));
            }
        }
    }

    @Test void filterAndChainShareTheSameRequestOnlyRepository() {
        var repository = context.getBean(SecurityContextRepository.class);
        assertInstanceOf(RequestAttributeSecurityContextRepository.class, repository);
        assertSame(repository, ReflectionTestUtils.getField(context.getBean(JwtAuthenticationFilter.class), "securityContextRepository"));
        var holder = chain.getFilters("/api/v1/notifications/stream").stream()
                .filter(SecurityContextHolderFilter.class::isInstance).findFirst().orElseThrow();
        assertSame(repository, ReflectionTestUtils.getField(holder,"securityContextRepository"));
    }

    @Test void transportFailureOnCommittedAsyncIsNotReplacedByAuthorizationFailure() throws Exception {
        var request = request(token("MEMBER")); var response = new MockHttpServletResponse();
        chain.doFilter(request,response,(req,res) -> res.flushBuffer());
        request.setDispatcherType(DispatcherType.ASYNC);
        var error = assertThrows(IOException.class, () -> chain.doFilter(request,response,
                (req,res) -> { throw new IOException("Test transport failure"); }));
        assertEquals("Test transport failure",error.getMessage());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        assertNull(request.getSession(false));
    }

    @Test void contextsDoNotLeakBetweenAccountsOrRequests() throws Exception {
        for (String role : List.of("MEMBER","COACH")) {
            var request = request(token(role)); var response = new MockHttpServletResponse();
            chain.doFilter(request,response,(req,res) -> assertEquals(role+"@test.invalid",SecurityContextHolder.getContext().getAuthentication().getName()));
            assertNull(SecurityContextHolder.getContext().getAuthentication());
            var anonymous = new MockHttpServletResponse();
            chain.doFilter(request(null),anonymous,(req,res) -> fail("Context leaked"));
            assertEquals(401,anonymous.getStatus());
        }
    }

    @Test void actualNotificationControllerRetainsPostRoleRestrictions() throws Exception {
        var service = context.getBean(NotificationDeliveryService.class);
        when(service.send(any())).thenReturn(NotificationSendResponse.builder()
                .acceptedRecipients(1).onlineRecipientsAtSend(0).workoutPlanIds(List.of()).build());
        var mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(chain).build();
        for (String role : List.of("COACH","CENTER_MANAGER","MEMBER","RECEPTIONIST")) {
            mvc.perform(post("/api/v1/notifications").header("Authorization","Bearer "+token(role))
                    .contentType("application/json")
                    .content("{\"recipientIds\":[15],\"title\":\"TEST\",\"content\":\"TEST\",\"kind\":\"GENERAL\"}"))
                    .andExpect(status().is(role.equals("COACH")||role.equals("CENTER_MANAGER")?202:403));
        }
        verify(service,times(2)).send(any());
    }

    @Test void historyAndReadRequireJwtAndDelegateOwnershipToService() throws Exception {
        var history=context.getBean(GeneralNotificationHistory.class);
        when(history.list(0,20)).thenReturn(new com.sportscenter.management.dto.Response.NotificationHistoryPage(List.of(),0,20,false));
        when(history.read(99)).thenThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND));
        var mvc=MockMvcBuilders.webAppContextSetup(context).addFilters(chain).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/notifications")).andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/v1/notifications/99/read")).andExpect(status().isUnauthorized());
        verifyNoInteractions(history);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/notifications").header("Authorization","Bearer "+token("MEMBER"))).andExpect(status().isOk());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/v1/notifications/99/read").header("Authorization","Bearer "+token("MEMBER"))).andExpect(status().isNotFound());
    }
}
