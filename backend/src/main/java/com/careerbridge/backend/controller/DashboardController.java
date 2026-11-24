package com.careerbridge.backend.controller;

import com.careerbridge.backend.repository.CounselingSessionRepository;
import com.careerbridge.backend.repository.JobMatchRepository;
import com.careerbridge.backend.repository.ResumeRepository;
import com.careerbridge.backend.repository.ScholarshipSearchRepository;
import com.careerbridge.backend.security.CurrentUser;
import com.careerbridge.backend.service.StudentContextService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final ResumeRepository resumeRepository;
    private final CounselingSessionRepository counselingSessionRepository;
    private final ScholarshipSearchRepository scholarshipSearchRepository;
    private final JobMatchRepository jobMatchRepository;
    private final StudentContextService context;

    public DashboardController(ResumeRepository resumeRepository,
                               CounselingSessionRepository counselingSessionRepository,
                               ScholarshipSearchRepository scholarshipSearchRepository,
                               JobMatchRepository jobMatchRepository,
                               StudentContextService context) {
        this.resumeRepository = resumeRepository;
        this.counselingSessionRepository = counselingSessionRepository;
        this.scholarshipSearchRepository = scholarshipSearchRepository;
        this.jobMatchRepository = jobMatchRepository;
        this.context = context;
    }

    @GetMapping("/student/{studentId}")
    public Map<String, Object> getDashboard(@PathVariable("studentId") Long studentId) {
        CurrentUser.requireSelf(studentId);
        Map<String, Object> dashboard = new LinkedHashMap<>();
        dashboard.put("studentId", studentId);
        dashboard.put("resumes", resumeRepository.findByStudentId(studentId));
        dashboard.put("counselingSessions", counselingSessionRepository.findByStudentId(studentId));
        dashboard.put("scholarshipSearches", scholarshipSearchRepository.findByStudentId(studentId));
        dashboard.put("jobMatches", jobMatchRepository.findByStudentId(studentId));
        return dashboard;
    }

    @GetMapping("/student/{studentId}/context")
    public Map<String, Object> getContext(@PathVariable("studentId") Long studentId) {
        CurrentUser.requireSelf(studentId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", context.describe(studentId));
        return out;
    }
}