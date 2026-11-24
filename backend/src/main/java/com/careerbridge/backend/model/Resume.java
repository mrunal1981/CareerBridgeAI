package com.careerbridge.backend.model;

import jakarta.persistence.*;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Entity
@Data
public class Resume {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long studentId;

    @Column(columnDefinition = "TEXT")
    private String resumeText;

    private Integer atsScore;

    @ElementCollection(fetch = FetchType.EAGER)
    @OrderColumn
    @Column(length = 1000)
    private List<String> missingSections = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @OrderColumn
    @Column(length = 1000)
    private List<String> suggestions = new ArrayList<>();

    // Extra AI analysis (summary, strengths, skills...) stored as JSON text. Old rows keep it empty.
    @Column(columnDefinition = "TEXT")
    private String analysisJson;
}