package com.sportscenter.management.controller;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.entity.Feedback;
import com.sportscenter.management.repository.FeedbackRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.impl.FeedbackServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class FeedbackRatingValidationTest {
    private final FeedbackRepository feedbacks = mock(FeedbackRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final SecurityUtils security = mock(SecurityUtils.class);
    private LocalValidatorFactoryBean validator;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        when(security.getCurrentUserId()).thenReturn(10);
        when(security.hasRole("MEMBER")).thenReturn(true);
        when(users.existsById(anyInt())).thenReturn(true);
        when(feedbacks.save(any(Feedback.class))).thenAnswer(invocation -> {
            Feedback value = invocation.getArgument(0);
            value.setId(91);
            return value;
        });
        validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        // Dùng converter Jackson 3 như Spring MVC thật, không dùng mapper Jackson 2 của JWT.
        mvc = MockMvcBuilders.standaloneSetup(new FeedbackController(
                        new FeedbackServiceImpl(feedbacks, users, security), security))
                .setControllerAdvice(new ApiExceptionHandler())
                .setMessageConverters(new JacksonJsonHttpMessageConverter())
                .setValidator(validator).build();
    }

    @AfterEach
    void closeValidator() {
        validator.close();
    }

    @ParameterizedTest
    @ValueSource(strings = {"1.5", "2.7", "0", "6", "\"3\"", "true", "{}", "[]", "2147483648"})
    void invalidRatingReturns400WithoutSaving(String rating) throws Exception {
        mvc.perform(post("/api/v1/feedbacks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toUserId\":3,\"rating\":" + rating + ",\"comment\":\"Đánh giá thử\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(feedbacks);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4, 5})
    void validIntegerKeepsSenderAndTypeAndSaves(int rating) throws Exception {
        mvc.perform(post("/api/v1/feedbacks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fromUserId\":999,\"type\":\"COACH_TO_MEMBER\",\"toUserId\":3,\"rating\":"
                                + rating + ",\"comment\":\"Nhận xét Unicode — tốt\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.rating").value(rating))
                .andExpect(jsonPath("$.fromUserId").value(10))
                .andExpect(jsonPath("$.type").value("MEMBER_TO_COACH"))
                .andExpect(jsonPath("$.comment").value("Nhận xét Unicode — tốt"));
        verify(feedbacks, times(1)).save(any(Feedback.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", ""})
    void nullOrOmittedRatingRemainsOptional(String rating) throws Exception {
        String field = rating.isEmpty() ? "" : "\"rating\":" + rating + ",";
        mvc.perform(post("/api/v1/feedbacks").contentType(MediaType.APPLICATION_JSON)
                        .content("{" + field + "\"toUserId\":3,\"comment\":\"Không chấm điểm\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.rating").isEmpty());
        verify(feedbacks).save(argThat(value -> value.getRating() == null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"2.0", "2e0"})
    void exactWholeNumberIsNotTruncatedOrRounded(String rating) throws Exception {
        mvc.perform(post("/api/v1/feedbacks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toUserId\":3,\"rating\":" + rating + ",\"comment\":\"Số nguyên chính xác\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.rating").value(2));
    }

    @Test
    void blankCommentDoesNotSave() throws Exception {
        mvc.perform(post("/api/v1/feedbacks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toUserId\":3,\"rating\":5,\"comment\":\"   \"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(feedbacks);
    }

    @Test
    void classFeedbackStillUsesTheExistingType() throws Exception {
        mvc.perform(post("/api/v1/feedbacks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"classId\":8,\"rating\":4,\"comment\":\"Đánh giá lớp\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.type").value("CLASS_FEEDBACK"));
    }

    @Test
    void coachFeedbackStillUsesTheExistingType() throws Exception {
        when(security.hasRole("MEMBER")).thenReturn(false);
        when(security.isCoach()).thenReturn(true);
        mvc.perform(post("/api/v1/feedbacks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toUserId\":11,\"rating\":null,\"comment\":\"Nhận xét học viên\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.type").value("COACH_TO_MEMBER"));
    }

    @Test
    void staffStillCannotCreateFeedback() throws Exception {
        when(security.hasRole("MEMBER")).thenReturn(false);
        mvc.perform(post("/api/v1/feedbacks").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toUserId\":3,\"rating\":4,\"comment\":\"Không được gửi\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(feedbacks);
    }
}
