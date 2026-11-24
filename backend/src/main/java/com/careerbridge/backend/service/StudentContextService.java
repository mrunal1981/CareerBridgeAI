package com.careerbridge.backend.service;

import com.careerbridge.backend.model.CounselingSession;
import com.careerbridge.backend.model.JobMatch;
import com.careerbridge.backend.model.Resume;
import com.careerbridge.backend.model.ScholarshipSearch;
import com.careerbridge.backend.model.Student;
import com.careerbridge.backend.repository.CounselingSessionRepository;
import com.careerbridge.backend.repository.JobMatchRepository;
import com.careerbridge.backend.repository.ResumeRepository;
import com.careerbridge.backend.repository.ScholarshipSearchRepository;
import com.careerbridge.backend.repository.StudentRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
public class StudentContextService {

    public enum Part {
        PROFILE("Profile"), RESUME("Latest resume"), COUNSELING("Latest career guidance"),
        SCHOLARSHIP("Latest scholarship search"), JOBS("Latest job matches");

        public final String label;
        Part(String label) { this.label = label; }
    }

    public record Item(String key, String label, String text) {}

    private static final int MAX_CHARS = 1500;

    private final StudentRepository students;
    private final ResumeRepository resumes;
    private final CounselingSessionRepository sessions;
    private final ScholarshipSearchRepository searches;
    private final JobMatchRepository jobMatches;

    public StudentContextService(StudentRepository students, ResumeRepository resumes,
                                 CounselingSessionRepository sessions,
                                 ScholarshipSearchRepository searches, JobMatchRepository jobMatches) {
        this.students = students;
        this.resumes = resumes;
        this.sessions = sessions;
        this.searches = searches;
        this.jobMatches = jobMatches;
    }

    // Text sent to an agent: only the requested parts, only if data exists, capped in size. "" if nothing.
    public String build(Long studentId, Part... wanted) {
        Map<Part, String> all = sections(studentId);
        StringBuilder sb = new StringBuilder();
        for (Part p : wanted) {
            String text = all.get(p);
            if (text != null) sb.append(p.label).append(": ").append(text).append('\n');
        }
        String out = sb.toString().trim();
        return out.length() > MAX_CHARS ? out.substring(0, MAX_CHARS) : out;
    }

    // Everything we know, for the "What your agents know about you" card.
    public List<Item> describe(Long studentId) {
        List<Item> items = new ArrayList<>();
        sections(studentId).forEach((p, text) -> items.add(new Item(p.name().toLowerCase(), p.label, text)));
        return items;
    }

    private Map<Part, String> sections(Long id) {
        Map<Part, String> out = new EnumMap<>(Part.class);

        students.findById(id).ifPresent(s -> {
            String profile = profileText(s);
            if (!profile.isEmpty()) out.put(Part.PROFILE, profile);
        });

        resumes.findByStudentId(id).stream().max(Comparator.comparing(Resume::getId)).ifPresent(r -> {
            StringBuilder sb = new StringBuilder();
            if (r.getAtsScore() != null) sb.append("ATS score ").append(r.getAtsScore()).append("/100. ");
            if (!r.getMissingSections().isEmpty())
                sb.append("Missing sections: ").append(String.join(", ", r.getMissingSections())).append(". ");
            if (!r.getSuggestions().isEmpty())
                sb.append("Suggestions: ").append(String.join("; ", first(r.getSuggestions(), 3))).append(".");
            if (sb.length() > 0) out.put(Part.RESUME, sb.toString().trim());
        });

        sessions.findByStudentId(id).stream().max(Comparator.comparing(CounselingSession::getId)).ifPresent(c -> {
            String rec = c.getRecommendation() == null ? "" : c.getRecommendation().replaceAll("\\s+", " ").trim();
            if (rec.length() > 300) rec = rec.substring(0, 300) + "...";
            out.put(Part.COUNSELING, "Stage " + c.getStage() + (rec.isEmpty() ? "." : ". " + rec));
        });

        searches.findByStudentId(id).stream().max(Comparator.comparing(ScholarshipSearch::getId)).ifPresent(sc ->
                out.put(Part.SCHOLARSHIP, "Searched for " + sc.getEducationLevel() + " level"
                        + (sc.getScholarships().isEmpty() ? "." : ", got " + sc.getScholarships().size() + " suggestions.")));

        jobMatches.findByStudentId(id).stream().max(Comparator.comparing(JobMatch::getId)).ifPresent(j -> {
            List<String> roles = new ArrayList<>();
            for (String m : first(j.getMatches(), 3)) {
                int cut = m.indexOf(" - ");
                roles.add(cut > 0 ? m.substring(0, cut) : m);
            }
            if (!roles.isEmpty()) out.put(Part.JOBS, String.join("; ", roles) + ".");
        });

        return out;
    }

    private static String profileText(Student s) {
        List<String> bits = new ArrayList<>();
        if (notBlank(s.getStream())) bits.add("stream " + s.getStream());
        if (s.getMarks() != null) bits.add("marks " + s.getMarks() + "%");
        if (notBlank(s.getIncomeCategory())) bits.add("category " + s.getIncomeCategory());
        if (notBlank(s.getState())) bits.add("state " + s.getState());
        if (notBlank(s.getCity())) bits.add("city " + s.getCity());
        return bits.isEmpty() ? "" : String.join(", ", bits) + ".";
    }

    private static boolean notBlank(String v) { return v != null && !v.isBlank(); }

    private static <T> List<T> first(List<T> list, int n) {
        return list.size() <= n ? list : list.subList(0, n);
    }
}