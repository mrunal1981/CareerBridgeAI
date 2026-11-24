package com.careerbridge.backend.model;

import lombok.Data;

@Data
public class ScholarshipRequest {
    private Long studentId;
    private String educationLevel;
    private String category;
    private String state;
    private String interests;
}