package com.careerbridge.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.regex.Pattern;

@Service
public class RunService {

    public record Snapshot(String status, String message) {}

    private static final Pattern ID = Pattern.compile("[A-Za-z0-9-]{8,64}");
    private static final long KEEP_MS = 10 * 60 * 1000L;

    private static final class Run {
        final Long owner;
        final long created = System.currentTimeMillis();
        volatile String status = "queued";
        volatile String message = "Waiting to start...";
        Run(Long owner) { this.owner = owner; }
    }

    private final Map<String, Run> runs = new ConcurrentHashMap<>();

    // Wraps one agent call. With no (or an invalid) run id the call just runs, exactly as before.
    public <T> T track(String runId, Long owner, String label, Supplier<T> work) {
        if (runId == null || !ID.matcher(runId).matches()) {
            return work.get();
        }
        prune();
        Run run = runs.computeIfAbsent(runId, k -> new Run(owner));
        if (!run.owner.equals(owner)) {
            return work.get();
        }
        run.status = "running";
        run.message = label + " is working...";
        try {
            T result = work.get();
            run.status = "done";
            run.message = "Finished";
            return result;
        } catch (RuntimeException e) {
            run.status = "failed";
            run.message = e instanceof ResponseStatusException r && r.getReason() != null
                    ? r.getReason() : "Something went wrong";
            throw e;
        }
    }

    // Creates a "queued" placeholder so the browser can start watching before the agent request arrives.
    public Snapshot snapshot(String runId, Long owner) {
        if (runId == null || !ID.matcher(runId).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid run id");
        }
        prune();
        Run run = runs.computeIfAbsent(runId, k -> new Run(owner));
        if (!run.owner.equals(owner)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Run not found");
        }
        return new Snapshot(run.status, run.message);
    }

    private void prune() {
        long cutoff = System.currentTimeMillis() - KEEP_MS;
        runs.values().removeIf(r -> r.created < cutoff);
    }
}