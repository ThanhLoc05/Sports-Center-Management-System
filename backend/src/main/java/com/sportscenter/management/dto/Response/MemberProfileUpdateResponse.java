package com.sportscenter.management.dto.Response;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberProfileUpdateResponse {

    private MemberProfileResponse profile;

    private UserResponse user;

    private String token;
}
