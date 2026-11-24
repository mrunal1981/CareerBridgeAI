package com.careerbridge.backend.controller;

import com.careerbridge.backend.repository.CounselingSessionRepository;
import com.careerbridge.backend.repository.JobMatchRepository;
import com.careerbridge.backend.repository.ResumeRepository;
import com.careerbridge.backend.repository.ScholarshipSearchRepository;
import com.careerbridge.backend.repository.StudentRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    private final StudentRepository students;
    private final ResumeRepository resumes;
    private final CounselingSessionRepository sessions;
    private final ScholarshipSearchRepository searches;
    private final JobMatchRepository jobMatches;

    public StatsController(StudentRepository students, ResumeRepository resumes,
                           CounselingSessionRepository sessions,
                           ScholarshipSearchRepository searches, JobMatchRepository jobMatches) {
        this.students = students;
        this.resumes = resumes;
        this.sessions = sessions;
        this.searches = searches;
        this.jobMatches = jobMatches;
    }

    @GetMapping("/public")
    public Map<String, Object> publicStats() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("students", students.count());
        out.put("resumes", resumes.count());
        out.put("counselingSessions", sessions.count());
        out.put("scholarshipSearches", searches.count());
        out.put("jobMatches", jobMatches.count());
        return out;
    }
}