package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.*;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.annotation.JsonDeserialize;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeedbackRequest {

    private Integer fromUserId;

    private Integer toUserId;

    private Integer classId;

    @Min(value = 1, message = "Đánh giá tối thiểu 1 sao")
    @Max(value = 5, message = "Đánh giá tối đa 5 sao")
    @JsonDeserialize(using = RatingDeserializer.class)
    private Integer rating;

    @NotBlank(message = "Nội dung nhận xét/đánh giá không được để trống")
    private String comment;

    private String type; // MEMBER_TO_COACH, COACH_TO_MEMBER, CLASS_FEEDBACK

    public static class RatingDeserializer extends ValueDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser parser, DeserializationContext context) {
            // Không để Jackson cắt phần thập phân trước khi kiểm tra giới hạn điểm.
            if (parser.hasToken(JsonToken.VALUE_NUMBER_INT) || parser.hasToken(JsonToken.VALUE_NUMBER_FLOAT)) {
                try {
                    return parser.getDecimalValue().intValueExact();
                } catch (ArithmeticException ignored) {
                    return context.reportInputMismatch(Integer.class, "Rating phải là số nguyên từ 1 đến 5");
                }
            }
            return context.reportInputMismatch(Integer.class, "Rating phải là số nguyên từ 1 đến 5");
        }
    }
}
