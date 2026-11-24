package com.careerbridge.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

// One adaptive career assessment. The question/answer state and the finished report are kept
// as JSON text that the Python AI service creates and the frontend reads.
@Entity
@Table(name = "career_assessments")
public class CareerAssessment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long studentId;
    private String stage;
    private String status = "IN_PROGRESS";   // IN_PROGRESS -> READY (all questions answered) -> COMPLETED (report made)

    @Column(columnDefinition = "LONGTEXT")
    private String stateJson;

    @Column(columnDefinition = "LONGTEXT")
    private String reportJson;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getStudentId() { return studentId; }
    public void setStudentId(Long studentId) { this.studentId = studentId; }

    public String getStage() { return stage; }
    public void setStage(String stage) { this.stage = stage; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getStateJson() { return stateJson; }
    public void setStateJson(String stateJson) { this.stateJson = stateJson; }

    public String getReportJson() { return reportJson; }
    public void setReportJson(String reportJson) { this.reportJson = reportJson; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}