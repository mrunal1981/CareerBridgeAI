package com.careerbridge.backend.model;

import lombok.Data;

@Data
public class JobMatchRequest {
    private Long studentId;
    private String skills;
    private String preferredRole;
    private String experienceLevel;
}