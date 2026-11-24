package com.careerbridge.backend.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Data
public class ScholarshipSearch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long studentId;
    private String educationLevel;
    private String category;
    private String state;

    @Column(columnDefinition = "TEXT")
    private String interests;

    @ElementCollection(fetch = FetchType.EAGER)
    @OrderColumn
    @Column(columnDefinition = "TEXT")
    private List<String> scholarships = new ArrayList<>();

    private LocalDateTime createdAt = LocalDateTime.now();
}