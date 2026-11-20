package com.sportscenter.management.controller;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.WorkoutLogRequest;
import com.sportscenter.management.dto.Response.WorkoutLogResponse;
import com.sportscenter.management.service.WorkoutLogService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import java.util.stream.Stream;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Kiểm tra HTTP và validation lồng nhau; không khởi động database. */
class WorkoutLogValidationTest {
    private final WorkoutLogService logs = mock(WorkoutLogService.class);
    private final SecurityUtils security = mock(SecurityUtils.class);
    private LocalValidatorFactoryBean validator;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        when(security.isCoach()).thenReturn(true);
        when(security.getCurrentUserId()).thenReturn(3);
        when(logs.createLog(any(WorkoutLogRequest.class)))
                .thenReturn(WorkoutLogResponse.builder().id(91).build());
        validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new WorkoutLogController(logs, security))
                .setControllerAdvice(new ApiExceptionHandler())
                .setMessageConverters(new JacksonJsonHttpMessageConverter())
                .setValidator(validator).build();
    }

    @AfterEach
    void closeValidator() {
        validator.close();
    }

    static Stream<Arguments> invalidDetails() {
        return Stream.of(
                Arguments.of("", "ít nhất một bài tập"),
                Arguments.of("null", "ít nhất một bài tập"),
                Arguments.of("[]", "ít nhất một bài tập"),
                Arguments.of("[null]", "Thông tin bài tập"),
                Arguments.of("[{\"exerciseName\":\"   \"}]", "Tên bài tập"),
                Arguments.of("[{\"sets\":3}]", "Tên bài tập"),
                Arguments.of("[{\"exerciseName\":\"Row\",\"sets\":0}]", "Số hiệp"),
                Arguments.of("[{\"exerciseName\":\"Row\",\"sets\":-1}]", "Số hiệp"),
                Arguments.of("[{\"exerciseName\":\"Row\",\"reps\":0}]", "Số lần"),
                Arguments.of("[{\"exerciseName\":\"Row\",\"reps\":-1}]", "Số lần"),
                Arguments.of("[{\"exerciseName\":\"Row\",\"weightKg\":-0.1}]", "Mức tạ"),
                Arguments.of("[{\"exerciseName\":\"Bơi 50 m\",\"metricValue\":42.5}]", "giá trị và đơn vị"),
                Arguments.of("[{\"exerciseName\":\"Bơi 50 m\",\"metricUnit\":\"seconds\"}]", "giá trị và đơn vị"),
                Arguments.of("[{\"exerciseName\":\"Bơi 50 m\",\"metricValue\":42.5,\"metricUnit\":\"invalid\"}]", "Đơn vị"),
                Arguments.of("[{\"exerciseName\":\"Bơi 50 m\",\"metricValue\":-1,\"metricUnit\":\"seconds\"}]", "không được âm"),
                Arguments.of("[{\"exerciseName\":\"Bơi 50 m\",\"metricValue\":42.1234,\"metricUnit\":\"seconds\"}]", "3 chữ số sau"),
                Arguments.of("[{\"exerciseName\":\"Ném rổ\",\"metricValue\":21,\"metricUnit\":\"hitsPer20\"}]", "không được vượt quá 20"),
                Arguments.of("[{\"exerciseName\":\"Giao cầu\",\"metricValue\":2.5,\"metricUnit\":\"repetitions\"}]", "số nguyên"),
                Arguments.of("[{\"exerciseName\":\"Bơi 50 m\",\"metricValue\":42.5,\"metricUnit\":\"seconds\",\"sets\":3}]", "giá trị và đơn vị"),
                Arguments.of("[{\"exerciseName\":\"Row\"},{\"exerciseName\":\"Squat\",\"sets\":0}]", "Số hiệp"));
    }

    @ParameterizedTest
    @MethodSource("invalidDetails")
    void invalidLogReturns400WithUsefulMessageBeforeCallingService(String details, String message) throws Exception {
        mvc.perform(post("/api/v1/workout-logs").contentType(MediaType.APPLICATION_JSON)
                        .content(body(details)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString(message)));
        verifyNoInteractions(logs);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "[{\"exerciseName\":\"Plank\"}]",
            "[{\"exerciseName\":\"Row\",\"sets\":null,\"reps\":null,\"weightKg\":null}]",
            "[{\"exerciseName\":\"Squat\",\"sets\":3,\"reps\":10,\"weightKg\":0}]",
            "[{\"exerciseName\":\"Row\",\"sets\":3,\"reps\":10,\"weightKg\":12.5}]",
            "[{\"exerciseName\":\"Bơi 50 m\",\"metricValue\":42.5,\"metricUnit\":\"seconds\"}]",
            "[{\"exerciseName\":\"Ném rổ\",\"metricValue\":0,\"metricUnit\":\"hitsPer20\"}]"
    })
    void validLogKeepsOptionalMetricsAndAuthenticatedCoach(String details) throws Exception {
        mvc.perform(post("/api/v1/workout-logs").contentType(MediaType.APPLICATION_JSON)
                        .content(body(details)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(91));
        verify(logs).createLog(argThat(request -> request.getCoachId() == 3
                && request.getMemberId() == 10 && request.getDetails().size() == 1));
    }

    private static String body(String details) {
        return "{\"memberId\":10,\"coachId\":999"
                + (details.isEmpty() ? "" : ",\"details\":" + details) + "}";
    }
}
