package com.careerbridge.backend.controller;

import com.careerbridge.backend.model.JobMatch;
import com.careerbridge.backend.model.JobMatchRequest;
import com.careerbridge.backend.repository.JobMatchRepository;
import com.careerbridge.backend.security.CurrentUser;
import com.careerbridge.backend.service.AgentGateway;
import com.careerbridge.backend.service.RunService;
import com.careerbridge.backend.service.StudentContextService;
import com.careerbridge.backend.service.StudentContextService.Part;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobMatchRepository jobMatchRepository;
    private final AgentGateway agent;
    private final RunService runs;
    private final StudentContextService context;

    public JobController(JobMatchRepository jobMatchRepository,
                         AgentGateway agent, RunService runs, StudentContextService context) {
        this.jobMatchRepository = jobMatchRepository;
        this.agent = agent;
        this.runs = runs;
        this.context = context;
    }

    @PostMapping("/match")
    public JobMatch match(@RequestBody JobMatchRequest request,
                          @RequestHeader(value = "X-Run-Id", required = false) String runId) {
        Long studentId = CurrentUser.id();

        if (request.getSkills() == null || request.getSkills().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "skills must not be empty");
        }

        return runs.track(runId, studentId, "Job Matcher", () -> {
            Map<String, Object> body = new HashMap<>();
            body.put("skills", request.getSkills());
            body.put("preferred_role", orEmpty(request.getPreferredRole()));
            body.put("experience_level", orEmpty(request.getExperienceLevel()));
            String ctx = context.build(studentId, Part.PROFILE, Part.RESUME);
            if (!ctx.isEmpty()) body.put("context", ctx);

            Map<String, Object> result = agent.post("/match-jobs", body);
            if (result.get("matches") == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "AI agent returned an invalid response");
            }

            JobMatch jobMatch = new JobMatch();
            jobMatch.setStudentId(studentId);
            jobMatch.setSkills(request.getSkills());
            jobMatch.setPreferredRole(request.getPreferredRole());
            jobMatch.setExperienceLevel(request.getExperienceLevel());
            jobMatch.setMatches(AgentGateway.strings(result.get("matches")));
            return jobMatchRepository.save(jobMatch);
        });
    }

    @GetMapping("/student/{studentId}")
    public List<JobMatch> getMatchesByStudent(@PathVariable("studentId") Long studentId) {
        CurrentUser.requireSelf(studentId);
        return jobMatchRepository.findByStudentId(studentId);
    }

    private String orEmpty(String value) {
        return value == null ? "" : value;
    }
}