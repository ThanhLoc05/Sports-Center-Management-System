package com.sportscenter.management.dto.Response;

import lombok.Builder;
import lombok.Getter;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;

@Getter
@Builder
public class MembershipOrderResponse {
    private Integer id;
    private Integer memberId;
    private String kind;
    private Integer sourceSubscriptionId;
    private Integer sourcePackageId;
    private String status;
    @JsonProperty("package")
    private MembershipOfferResponse packageInfo;
    private InvoiceResponse invoice;
    private String paymentReference;
    private LocalDateTime createdAt;
    private LocalDateTime confirmedAt;
    private MemberSubscriptionResponse subscription;
    private Integer version;
}
