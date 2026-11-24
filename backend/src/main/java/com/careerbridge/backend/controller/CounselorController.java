package com.careerbridge.backend.controller;

import com.careerbridge.backend.model.CounselingRequest;
import com.careerbridge.backend.model.CounselingSession;
import com.careerbridge.backend.model.QuizQuestion;
import com.careerbridge.backend.repository.CounselingSessionRepository;
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
@RequestMapping("/api/counselor")
public class CounselorController {

    private static final List<String> VALID_STAGES =
            List.of("BEFORE_10TH", "AFTER_10TH", "AFTER_12TH", "EXAM_PREP");

    private final CounselingSessionRepository counselingSessionRepository;
    private final AgentGateway agent;
    private final RunService runs;
    private final StudentContextService context;

    public CounselorController(CounselingSessionRepository counselingSessionRepository,
                               AgentGateway agent, RunService runs, StudentContextService context) {
        this.counselingSessionRepository = counselingSessionRepository;
        this.agent = agent;
        this.runs = runs;
        this.context = context;
    }

    @PostMapping("/guide")
    public CounselingSession guide(@RequestBody CounselingRequest request,
                                   @RequestHeader(value = "X-Run-Id", required = false) String runId) {
        Long studentId = CurrentUser.id();

        if (request.getStage() == null || !VALID_STAGES.contains(request.getStage())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "stage must be one of " + VALID_STAGES);
        }
        if (request.getAnswers() == null || request.getAnswers().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "answers must not be empty");
        }

        return runs.track(runId, studentId, "Career Counselor", () -> {
            Map<String, Object> body = new HashMap<>();
            body.put("stage", request.getStage());
            body.put("answers", request.getAnswers());
            String ctx = context.build(studentId, Part.PROFILE, Part.RESUME);
            if (!ctx.isEmpty()) body.put("context", ctx);

            Map<String, Object> result = agent.post("/counsel", body);
            if (result.get("recommendation") == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "AI agent returned an invalid response");
            }

            CounselingSession session = new CounselingSession();
            session.setStudentId(studentId);
            session.setStage(request.getStage());
            session.setAnswers(request.getAnswers());
            session.setRecommendation(String.valueOf(result.get("recommendation")));
            return counselingSessionRepository.save(session);
        });
    }

    @GetMapping("/quiz/before-10th")
    public List<QuizQuestion> getBefore10thQuiz() {
        return List.of(
                new QuizQuestion(1, "Which subject do you enjoy the most?",
                        List.of("Maths", "Science", "Social Studies", "Languages", "Art / Drawing")),
                new QuizQuestion(2, "What do you like doing in your free time?",
                        List.of("Solving puzzles", "Building or fixing things", "Reading or writing", "Drawing or designing", "Helping others")),
                new QuizQuestion(3, "Which of these sounds most exciting?",
                        List.of("Making an app or game", "Doing science experiments", "Running a business", "Teaching or counselling", "Creating art or videos")),
                new QuizQuestion(4, "How do you prefer to work?",
                        List.of("Alone, focused", "In a team", "Leading a group", "Outdoors, hands-on")),
                new QuizQuestion(5, "What matters most to you in a future career?",
                        List.of("High salary", "Job security", "Creativity", "Helping society", "Freedom to be my own boss"))
        );
    }

    @GetMapping("/student/{studentId}")
    public List<CounselingSession> getSessionsByStudent(@PathVariable("studentId") Long studentId) {
        CurrentUser.requireSelf(studentId);
        return counselingSessionRepository.findByStudentId(studentId);
    }
}