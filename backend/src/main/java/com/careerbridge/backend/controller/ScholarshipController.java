package com.careerbridge.backend.controller;

import com.careerbridge.backend.model.ScholarshipRequest;
import com.careerbridge.backend.model.ScholarshipSearch;
import com.careerbridge.backend.repository.ScholarshipSearchRepository;
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
@RequestMapping("/api/scholarship")
public class ScholarshipController {

    private final ScholarshipSearchRepository scholarshipSearchRepository;
    private final AgentGateway agent;
    private final RunService runs;
    private final StudentContextService context;

    public ScholarshipController(ScholarshipSearchRepository scholarshipSearchRepository,
                                 AgentGateway agent, RunService runs, StudentContextService context) {
        this.scholarshipSearchRepository = scholarshipSearchRepository;
        this.agent = agent;
        this.runs = runs;
        this.context = context;
    }

    @PostMapping("/find")
    public ScholarshipSearch find(@RequestBody ScholarshipRequest request,
                                  @RequestHeader(value = "X-Run-Id", required = false) String runId) {
        Long studentId = CurrentUser.id();

        if (request.getEducationLevel() == null || request.getEducationLevel().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "educationLevel must not be empty");
        }

        return runs.track(runId, studentId, "Scholarship Finder", () -> {
            Map<String, Object> body = new HashMap<>();
            body.put("education_level", request.getEducationLevel());
            body.put("category", orEmpty(request.getCategory()));
            body.put("state", orEmpty(request.getState()));
            body.put("interests", orEmpty(request.getInterests()));
            String ctx = context.build(studentId, Part.PROFILE, Part.COUNSELING);
            if (!ctx.isEmpty()) body.put("context", ctx);

            Map<String, Object> result = agent.post("/find-scholarships", body);
            if (result.get("scholarships") == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "AI agent returned an invalid response");
            }

            ScholarshipSearch search = new ScholarshipSearch();
            search.setStudentId(studentId);
            search.setEducationLevel(request.getEducationLevel());
            search.setCategory(request.getCategory());
            search.setState(request.getState());
            search.setInterests(request.getInterests());
            search.setScholarships(AgentGateway.strings(result.get("scholarships")));
            return scholarshipSearchRepository.save(search);
        });
    }

    @GetMapping("/student/{studentId}")
    public List<ScholarshipSearch> getSearchesByStudent(@PathVariable("studentId") Long studentId) {
        CurrentUser.requireSelf(studentId);
        return scholarshipSearchRepository.findByStudentId(studentId);
    }

    private String orEmpty(String value) {
        return value == null ? "" : value;
    }
}