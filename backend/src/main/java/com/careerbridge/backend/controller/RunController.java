package com.careerbridge.backend.controller;

import com.careerbridge.backend.security.CurrentUser;
import com.careerbridge.backend.service.RunService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/runs")
public class RunController {

    private static final long MAX_STREAM_MS = 150_000L;   // longer than the agent read timeout (90s)
    private static final long POLL_MS = 300L;

    private final RunService runs;

    public RunController(RunService runs) {
        this.runs = runs;
    }

    @GetMapping("/{runId}")
    public Map<String, Object> get(@PathVariable("runId") String runId) {
        RunService.Snapshot s = runs.snapshot(runId, CurrentUser.id());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", s.status());
        out.put("message", s.message());
        return out;
    }

    @GetMapping("/{runId}/events")
    public void events(@PathVariable("runId") String runId, HttpServletResponse response)
            throws IOException, InterruptedException {
        Long owner = CurrentUser.id();
        runs.snapshot(runId, owner);   // validates the id and the owner before streaming

        response.setStatus(200);
        response.setContentType("text/event-stream");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");
        PrintWriter out = response.getWriter();

        String lastSent = null;
        long end = System.currentTimeMillis() + MAX_STREAM_MS;
        while (System.currentTimeMillis() < end) {
            RunService.Snapshot s = runs.snapshot(runId, owner);
            String key = s.status() + "|" + s.message();
            if (!key.equals(lastSent)) {
                out.write("event: status\ndata: {\"status\":\"" + s.status()
                        + "\",\"message\":\"" + escape(s.message()) + "\"}\n\n");
                out.flush();
                if (out.checkError()) return;   // the browser went away
                lastSent = key;
            }
            if (s.status().equals("done") || s.status().equals("failed")) return;
            Thread.sleep(POLL_MS);
        }
    }

    private static String escape(String v) {
        return v.replace("\\", "\\\\").replace("\"", "\\\"").replaceAll("[\\r\\n\\t]", " ");
    }
}