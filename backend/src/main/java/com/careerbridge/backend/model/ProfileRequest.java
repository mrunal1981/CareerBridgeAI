package com.careerbridge.backend.model;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ProfileRequest {
    @Size(max = 50)
    private String stream;

    @DecimalMin("0.0")
    @DecimalMax("100.0")
    private Double marks;

    @Size(max = 50)
    private String incomeCategory;

    @Size(max = 60)
    private String state;

    @Size(max = 60)
    private String city;
}