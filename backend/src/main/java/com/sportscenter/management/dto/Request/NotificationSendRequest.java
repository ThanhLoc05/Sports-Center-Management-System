package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationSendRequest {

    @NotEmpty(message = "Phải chọn ít nhất một học viên nhận thông báo")
    @Size(max = 100, message = "Mỗi lần chỉ gửi tối đa 100 học viên")
    private List<Integer> recipientIds;

    @NotBlank(message = "Tiêu đề không được để trống")
    @Size(max = 150, message = "Tiêu đề tối đa 150 ký tự")
    private String title;

    @NotBlank(message = "Nội dung không được để trống")
    @Size(max = 4000, message = "Nội dung tối đa 4000 ký tự")
    private String content;

    @Size(max = 500, message = "Đường dẫn tối đa 500 ký tự")
    private String link;

    @Size(max = 30, message = "Loại thông báo tối đa 30 ký tự")
    private String kind;

    private Integer coachId;
}
