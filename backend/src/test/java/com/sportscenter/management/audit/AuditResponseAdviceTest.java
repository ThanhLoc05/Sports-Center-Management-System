package com.sportscenter.management.audit;

import com.sportscenter.management.dto.Response.*;
import com.sportscenter.management.service.AuditLogService;
import org.junit.jupiter.api.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuditResponseAdviceTest {
    private final AuditLogService service = mock(AuditLogService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new Mutations())
            .setControllerAdvice(new AuditResponseAdvice())
            .addInterceptors(new AuditLogInterceptor(service)).build();

    @BeforeEach void login() {
        SecurityContextHolder.getContext().setAuthentication(
                new TestingAuthenticationToken("manager@example.test", "unused", "ROLE_CENTER_MANAGER"));
    }
    @AfterEach void logout() { SecurityContextHolder.clearContext(); }

    @RestController static class Mutations {
        @PostMapping("/api/v1/rooms") ResponseEntity<RoomResponse> room() {
            return ResponseEntity.status(201).body(RoomResponse.builder().id(81).roomName("test").capacity(3).build());
        }
        @PostMapping("/api/v1/classes/{id}/book") BookingResponse book() {
            return BookingResponse.builder().id(91).classId(12).memberId(4).build();
        }
        @PostMapping("/api/v1/users/login") LoginResponse login() { return null; }
        @PostMapping("/api/v1/classes/{id}/book/unknown") ResponseEntity<Void> unknownBooking() {
            return ResponseEntity.status(201).build();
        }
        @PostMapping("/api/v1/memberships/subscribe") MemberSubscriptionResponse subscribe() {
            return MemberSubscriptionResponse.builder().id(21).build();
        }
        @PostMapping("/api/v1/rooms/fail") ResponseEntity<RoomResponse> fail() {
            return ResponseEntity.badRequest().body(RoomResponse.builder().id(99).build());
        }
        @PutMapping("/api/v1/rooms/{id}") ResponseEntity<Void> update() { return ResponseEntity.noContent().build(); }
    }
    @Test void capturesGeneratedIdAfterRealMvcSerializationWithoutQueryOrBody() throws Exception {
        mvc.perform(post("/api/v1/rooms").queryParam("token", "sensitive-test-marker")
                .contentType("application/json").content("{\"password\":\"sensitive-test-marker\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(81));
        verify(service).record("manager@example.test", "CREATE", "ROOM", 81,
                "127.0.0.1", "POST /api/v1/rooms");
        verifyNoMoreInteractions(service);
    }
    @Test void bookingUsesBookingIdNotParentClassId() throws Exception {
        mvc.perform(post("/api/v1/classes/12/book")).andExpect(status().isOk());
        verify(service).record("manager@example.test", "CREATE", "BOOKING", 91,
                "127.0.0.1", "POST /api/v1/classes/12/book");
    }
    @Test void failedResponseAndLoginAreNotAudited() throws Exception {
        mvc.perform(post("/api/v1/rooms/fail")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/users/login")).andExpect(status().isOk());
        verifyNoInteractions(service);
    }
    @Test void bodylessUpdateKeepsPathId() throws Exception {
        mvc.perform(put("/api/v1/rooms/81")).andExpect(status().isNoContent());
        verify(service).record("manager@example.test", "UPDATE", "ROOM", 81,
                "127.0.0.1", "PUT /api/v1/rooms/81");
    }
    @Test void unknownCreateResponseDoesNotInventParentId() throws Exception {
        mvc.perform(post("/api/v1/classes/12/book/unknown")).andExpect(status().isCreated());
        verify(service).record("manager@example.test", "CREATE", "BOOKING", null,
                "127.0.0.1", "POST /api/v1/classes/12/book/unknown");
    }
    @Test void subscriptionIsNotMisidentifiedAsAnOrder() throws Exception {
        mvc.perform(post("/api/v1/memberships/subscribe")).andExpect(status().isOk());
        verify(service).record("manager@example.test", "CREATE", "MEMBERSHIP", 21,
                "127.0.0.1", "POST /api/v1/memberships/subscribe");
    }
}
