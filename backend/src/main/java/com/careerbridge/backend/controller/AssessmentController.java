package com.careerbridge.backend.controller;

import com.careerbridge.backend.model.CareerAssessment;
import com.careerbridge.backend.repository.CareerAssessmentRepository;
import com.careerbridge.backend.security.CurrentUser;
import com.careerbridge.backend.service.AgentGateway;
import com.careerbridge.backend.service.RunService;
import com.careerbridge.backend.service.StudentContextService;
import com.careerbridge.backend.service.StudentContextService.Part;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/assessment")
public class AssessmentController {

    private static final List<String> STAGES =
            List.of("BEFORE_10TH", "AFTER_10TH", "AFTER_12TH", "UNDERGRAD");

    public record StartRequest(String stage) {}
    public record AnswerRequest(String questionId, List<String> selected, String other, Boolean skip) {}

    private final CareerAssessmentRepository repository;
    private final AgentGateway agent;
    private final RunService runs;
    private final StudentContextService context;

    public AssessmentController(CareerAssessmentRepository repository, AgentGateway agent,
                                RunService runs, StudentContextService context) {
        this.repository = repository;
        this.agent = agent;
        this.runs = runs;
        this.context = context;
    }

    // ---------- start a new assessment ----------
    @PostMapping("/start")
    public Map<String, Object> start(@RequestBody StartRequest request,
                                     @RequestHeader(value = "X-Run-Id", required = false) String runId) {
        Long studentId = CurrentUser.id();
        if (request == null || request.stage() == null || !STAGES.contains(request.stage())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "stage must be one of " + STAGES);
        }

        return runs.track(runId, studentId, "Career Assessment", () -> {
            Map<String, Object> body = new HashMap<>();
            body.put("stage", request.stage());
            Map<String, Object> result = agent.post("/assessment/start", body);

            CareerAssessment assessment = new CareerAssessment();
            assessment.setStudentId(studentId);
            assessment.setStage(request.stage());
            applyState(assessment, result);
            return view(repository.save(assessment));
        });
    }

    // ---------- save one answer (or a skip) and get the next question ----------
    @PostMapping("/{id}/answer")
    public Map<String, Object> answer(@PathVariable("id") Long id, @RequestBody AnswerRequest request,
                                      @RequestHeader(value = "X-Run-Id", required = false) String runId) {
        Long studentId = CurrentUser.id();
        CareerAssessment assessment = owned(id, studentId);

        if ("COMPLETED".equals(assessment.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This assessment is already completed. Start a new one to change your answers.");
        }
        if (request == null || request.questionId() == null || request.questionId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "questionId is required");
        }
        List<String> selected = request.selected() == null ? List.of() : request.selected();
        if (selected.size() > 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "too many options selected");
        }

        return runs.track(runId, studentId, "Career Assessment", () -> {
            Map<String, Object> body = new HashMap<>();
            body.put("state", assessment.getStateJson());
            body.put("question_id", request.questionId());
            body.put("selected", selected);
            body.put("other", request.other());
            body.put("skip", Boolean.TRUE.equals(request.skip()));
            Map<String, Object> result = agent.post("/assessment/answer", body);

            applyState(assessment, result);
            return view(repository.save(assessment));
        });
    }

    // ---------- build the career report (only once; calling again returns the saved one) ----------
    @PostMapping("/{id}/report")
    public Map<String, Object> report(@PathVariable("id") Long id,
                                      @RequestHeader(value = "X-Run-Id", required = false) String runId) {
        Long studentId = CurrentUser.id();
        CareerAssessment assessment = owned(id, studentId);

        if ("COMPLETED".equals(assessment.getStatus()) && assessment.getReportJson() != null) {
            return view(assessment);            // no second AI run
        }
        if (!"READY".equals(assessment.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Please finish the questions before generating the report.");
        }

        return runs.track(runId, studentId, "Career Report", () -> {
            Map<String, Object> body = new HashMap<>();
            body.put("state", assessment.getStateJson());
            String ctx = context.build(studentId, Part.PROFILE, Part.RESUME);
            if (!ctx.isEmpty()) body.put("context", ctx);
            Map<String, Object> result = agent.post("/assessment/report", body);

            Object report = result.get("report_json");
            if (report == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AI agent returned an invalid response");
            }
            assessment.setReportJson(String.valueOf(report));
            assessment.setStatus("COMPLETED");
            assessment.setUpdatedAt(LocalDateTime.now());
            return view(repository.save(assessment));
        });
    }

    // ---------- read one assessment ----------
    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable("id") Long id) {
        return view(owned(id, CurrentUser.id()));
    }

    // ---------- list my assessments (short summaries only) ----------
    @GetMapping
    public List<Map<String, Object>> mine() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CareerAssessment a : repository.findByStudentIdOrderByUpdatedAtDesc(CurrentUser.id())) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", a.getId());
            row.put("stage", a.getStage());
            row.put("status", a.getStatus());
            row.put("createdAt", String.valueOf(a.getCreatedAt()));
            row.put("updatedAt", String.valueOf(a.getUpdatedAt()));
            out.add(row);
        }
        return out;
    }

    // ---------- helpers ----------
    private CareerAssessment owned(Long id, Long studentId) {
        return repository.findByIdAndStudentId(id, studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Assessment not found"));
    }

    private void applyState(CareerAssessment assessment, Map<String, Object> result) {
        Object state = result.get("state_json");
        if (state == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AI agent returned an invalid response");
        }
        assessment.setStateJson(String.valueOf(state));
        assessment.setStatus("ready".equals(result.get("status")) ? "READY" : "IN_PROGRESS");
        assessment.setUpdatedAt(LocalDateTime.now());
    }

    private Map<String, Object> view(CareerAssessment a) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", a.getId());
        out.put("stage", a.getStage());
        out.put("status", a.getStatus());
        out.put("stateJson", a.getStateJson());
        out.put("reportJson", a.getReportJson());
        out.put("createdAt", String.valueOf(a.getCreatedAt()));
        out.put("updatedAt", String.valueOf(a.getUpdatedAt()));
        return out;
    }
}