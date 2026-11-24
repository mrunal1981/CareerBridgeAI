package com.careerbridge.backend.controller;

import com.careerbridge.backend.model.Resume;
import com.careerbridge.backend.repository.ResumeRepository;
import com.careerbridge.backend.security.CurrentUser;
import com.careerbridge.backend.service.AgentGateway;
import com.careerbridge.backend.service.RunService;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/resume")
public class ResumeController {

    private static final int MAX_TEXT = 20000;   // the agent only reads the first 12000 characters anyway

    private final ResumeRepository resumeRepository;
    private final AgentGateway agent;
    private final RunService runs;

    public ResumeController(ResumeRepository resumeRepository, AgentGateway agent, RunService runs) {
        this.resumeRepository = resumeRepository;
        this.agent = agent;
        this.runs = runs;
    }

    @PostMapping("/evaluate")
    public Resume evaluate(@RequestBody Resume resume,
                           @RequestHeader(value = "X-Run-Id", required = false) String runId) {
        Long studentId = CurrentUser.id();
        if (resume.getResumeText() == null || resume.getResumeText().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "resumeText must not be empty");
        }
        resume.setId(null);               // never overwrite an existing row
        resume.setStudentId(studentId);   // always the logged-in student
        return runs.track(runId, studentId, "Resume Evaluator", () -> evaluateAndSave(resume));
    }

    // Accepts a PDF, reads its text with PDFBox, then reuses the same AI evaluation.
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Resume upload(@RequestParam("file") MultipartFile file,
                         @RequestParam(value = "studentId", required = false) Long ignoredStudentId,
                         @RequestHeader(value = "X-Run-Id", required = false) String runId) {
        Long studentId = CurrentUser.id();
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please choose a PDF file");
        }
        String name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase().endsWith(".pdf")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only PDF files are supported");
        }
        String text;
        try (PDDocument document = Loader.loadPDF(file.getBytes())) {
            text = new PDFTextStripper().getText(document);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read this PDF file");
        }
        if (text == null || text.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No readable text found in this PDF (scanned image PDFs are not supported)");
        }
        Resume resume = new Resume();
        resume.setStudentId(studentId);
        resume.setResumeText(text);
        return runs.track(runId, studentId, "Resume Evaluator", () -> evaluateAndSave(resume));
    }

    @GetMapping("/student/{studentId}")
    public List<Resume> getResumesByStudent(@PathVariable("studentId") Long studentId) {
        CurrentUser.requireSelf(studentId);
        return resumeRepository.findByStudentId(studentId);
    }

    private Resume evaluateAndSave(Resume resume) {
        String text = resume.getResumeText();
        if (text.length() > MAX_TEXT) text = text.substring(0, MAX_TEXT);
        resume.setResumeText(text);

        Map<String, Object> body = new HashMap<>();
        body.put("resume_text", text);
        Map<String, Object> result = agent.post("/evaluate-resume", body);

        if (!(result.get("ats_score") instanceof Number score)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AI agent returned an invalid response");
        }
        resume.setAtsScore(score.intValue());
        resume.setMissingSections(AgentGateway.strings(result.get("missing_sections")));
        resume.setSuggestions(AgentGateway.strings(result.get("suggestions")));
        Object extra = result.get("analysis_json");
        resume.setAnalysisJson(extra == null ? null : String.valueOf(extra));
        return resumeRepository.save(resume);
    }
}