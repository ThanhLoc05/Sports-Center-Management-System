package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberProfileRequest {

    @Size(min = 2, max = 100)
    private String fullName;

    @Email
    @Size(max = 255)
    private String email;

    @Pattern(regexp = "[+0-9 ()-]{9,20}", message = "Số điện thoại không hợp lệ")
    private String phone;

    private LocalDate dob;

    private String gender;

    private String address;

    private String fitnessGoals;
}