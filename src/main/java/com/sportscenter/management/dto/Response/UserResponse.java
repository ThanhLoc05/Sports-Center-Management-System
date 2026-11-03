package com.sportscenter.management.dto.Response;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserResponse {

    private Integer id;

    private String email;

    private String fullName;

    private String phone;

    private String roleName;

    private String status;
}