package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RefundRequest(
        @NotBlank @Size(max = 500) String reason,
        // Trung tâm chỉ hoàn tiền mặt tại quầy; request gửi phương thức khác bị từ chối 400.
        @NotBlank @Pattern(regexp = "CASH", message = "Trung tâm chỉ hoàn tiền mặt tại quầy.") String method,
        @NotBlank @Size(max = 120) String reference,
        @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Positive java.math.BigDecimal expectedAmount,
        @AssertTrue(message = "Cần xác nhận đã trả đủ tiền cho thành viên.") boolean returned
) {}
