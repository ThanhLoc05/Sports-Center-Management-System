package com.sportscenter.management.dto.Response;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SportResponse {

    private Integer id;

    private String sportName;

    private String description;
}