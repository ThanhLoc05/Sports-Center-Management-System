package com.sportscenter.management.dto.Request;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SportRequest {

    private String sportName;

    private String description;
}