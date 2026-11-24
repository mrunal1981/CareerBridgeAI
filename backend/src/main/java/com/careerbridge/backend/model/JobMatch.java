package com.careerbridge.backend.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Data
public class JobMatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long studentId;

    @Column(columnDefinition = "TEXT")
    private String skills;

    private String preferredRole;
    private String experienceLevel;

    @ElementCollection(fetch = FetchType.EAGER)
    @OrderColumn
    @Column(columnDefinition = "TEXT")
    private List<String> matches = new ArrayList<>();

    private LocalDateTime createdAt = LocalDateTime.now();
}