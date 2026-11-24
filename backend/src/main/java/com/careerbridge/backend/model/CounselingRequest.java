package com.careerbridge.backend.model;

public class CounselingRequest {
    private Long studentId;
    private String stage;
    private String answers;

    public Long getStudentId() { return studentId; }
    public void setStudentId(Long studentId) { this.studentId = studentId; }

    public String getStage() { return stage; }
    public void setStage(String stage) { this.stage = stage; }

    public String getAnswers() { return answers; }
    public void setAnswers(String answers) { this.answers = answers; }
}