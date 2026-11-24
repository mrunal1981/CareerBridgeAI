// All communication with the Spring Boot backend lives in this one file.
// Every screen calls functions from here instead of using fetch() directly.
import type { AssessmentSession, AssessmentStage, AssessmentSummary } from "@/lib/assessment";
const BASE_URL: string =
  (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8080";

// ---------- Types (they mirror the Java classes in backend/model) ----------

export type Student = {
  id: number;
  name: string;
  email: string;
  stream: string | null;
  marks: number | null;
  incomeCategory: string | null;
  state: string | null;
  city: string | null;
};

export type ResumeResult = {
  id: number;
  studentId: number | null;
  resumeText: string;
  atsScore: number;
  missingSections: string[];
  suggestions: string[];
  analysisJson?: string | null; // extra analysis (summary, strengths, skills...) as JSON text
};

// What is inside analysisJson (every field is optional; older resumes have none of it).
export type ResumeAnalysis = {
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  skillsFound?: string[];
  skillsToAdd?: string[];
  suitableRoles?: string[];
};

export type Stage = "BEFORE_10TH" | "AFTER_10TH" | "AFTER_12TH" | "EXAM_PREP";

export type QuizQuestion = { id: number; question: string; options: string[] };

export type CounselingSession = {
  id: number;
  studentId: number | null;
  stage: Stage;
  answers: string;
  recommendation: string;
  createdAt: string;
};

export type ScholarshipSearch = {
  id: number;
  studentId: number | null;
  educationLevel: string;
  category: string | null;
  state: string | null;
  interests: string | null;
  scholarships: string[];
  createdAt: string;
};

export type JobMatch = {
  id: number;
  studentId: number | null;
  skills: string;
  preferredRole: string | null;
  experienceLevel: string | null;
  matches: string[];
  createdAt: string;
};

// Student JSON returned by signup/login: the same student fields plus a JWT.
export type StudentWithToken = Student & { token: string };

export type ProfileInput = {
  stream?: string | null;
  marks?: number | null;
  incomeCategory?: string | null;
  state?: string | null;
  city?: string | null;
};

export type PublicStats = {
  students: number;
  resumes: number;
  counselingSessions: number;
  scholarshipSearches: number;
  jobMatches: number;
};

export type ContextItem = { key: string; label: string; text: string };

export type RunState = "queued" | "running" | "done" | "failed";
export type RunStatus = { status: RunState; message: string };

export type DashboardData = {
  studentId: number;
  resumes: ResumeResult[];
  counselingSessions: CounselingSession[];
  scholarshipSearches: ScholarshipSearch[];
  jobMatches: JobMatch[];
};

// ---------- Token handling ----------

const TOKEN_KEY = "careerbridge.token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage can be blocked - login still works for this session */ }
}

// auth.tsx registers a function here so any 401 logs the student out.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function newRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- Low-level helpers ----------

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
    });
  } catch {
    throw new ApiError(
      "Cannot reach the server. Check that the Spring Boot backend is running on port 8080.",
      0,
    );
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      // GlobalExceptionHandler on the backend sends { status, error, message }
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* body was not JSON - keep the default message */
    }
    const isAuthCall = path.startsWith("/api/students/login") || path.startsWith("/api/students/signup");
    if (res.status === 401 && !isAuthCall) unauthorizedHandler?.();
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

function send<T>(method: "POST" | "PUT", path: string, body: unknown, runId?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (runId) headers["X-Run-Id"] = runId;
  return request<T>(path, { method, headers, body: JSON.stringify(body) });
}
const post = <T,>(path: string, body: unknown, runId?: string) => send<T>("POST", path, body, runId);

// ---------- Live agent status (Server-Sent Events, with polling fallback) ----------

// Starts listening to /api/runs/{runId}. Returns a function that stops listening.
export function watchRun(runId: string, onUpdate: (s: RunStatus) => void): () => void {
  const ctrl = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    stopped = true;
    ctrl.abort();
    if (timer) clearInterval(timer);
  };

  const poll = () => {
    if (stopped || timer) return;
    timer = setInterval(async () => {
      try {
        const s = await request<RunStatus>(`/api/runs/${runId}`);
        if (!stopped) onUpdate(s);
        if (s.status === "done" || s.status === "failed") stop();
      } catch { /* keep trying until the caller stops us */ }
    }, 1000);
  };

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/runs/${runId}/events`, {
        headers: { ...authHeaders(), Accept: "text/event-stream" },
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error("stream unavailable");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut = buffer.indexOf("\n\n");
        while (cut >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const line = block.split("\n").find((l) => l.startsWith("data:"));
          if (line) {
            try { onUpdate(JSON.parse(line.slice(5).trim()) as RunStatus); } catch { /* ignore bad frame */ }
          }
          cut = buffer.indexOf("\n\n");
        }
      }
    } catch {
      if (!stopped) poll(); // stream failed -> fall back to polling
    }
  })();

  return stop;
}

// ---------- Endpoints ----------

export const api = {
  // Students
  signup: (b: { name: string; email: string; password: string }) =>
    post<StudentWithToken>("/api/students/signup", b),
  login: (email: string, password: string) =>
    post<StudentWithToken>("/api/students/login", { email, password }),
  updateProfile: (studentId: number, p: ProfileInput) =>
    send<Student>("PUT", `/api/students/${studentId}/profile`, p),

  // Resume Evaluator
  resumeEvaluate: (studentId: number, resumeText: string, runId?: string) =>
    post<ResumeResult>("/api/resume/evaluate", { studentId, resumeText }, runId),
  resumeUpload: (studentId: number, file: File, runId?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("studentId", String(studentId));
    // No Content-Type header here: the browser adds the multipart boundary itself.
    return request<ResumeResult>("/api/resume/upload", {
      method: "POST",
      body: form,
      headers: runId ? { "X-Run-Id": runId } : {},
    });
  },

  // Career & Exam Counselor
  quiz: () => request<QuizQuestion[]>("/api/counselor/quiz/before-10th"),
  counsel: (b: { studentId: number; stage: Stage; answers: string }, runId?: string) =>
    post<CounselingSession>("/api/counselor/guide", b, runId),

  // Scholarship Finder
  findScholarships: (
    b: { studentId: number; educationLevel: string; category: string; state: string; interests: string },
    runId?: string,
  ) => post<ScholarshipSearch>("/api/scholarship/find", b, runId),

  // Job Matcher
  matchJobs: (
    b: { studentId: number; skills: string; preferredRole: string; experienceLevel: string },
    runId?: string,
  ) => post<JobMatch>("/api/jobs/match", b, runId),

  // Overview numbers
  dashboard: (studentId: number) => request<DashboardData>(`/api/dashboard/student/${studentId}`),
  context: (studentId: number) =>
    request<{ items: ContextItem[] }>(`/api/dashboard/student/${studentId}/context`),

  // Landing page numbers (public, aggregate counts only)
  publicStats: () => request<PublicStats>("/api/stats/public"),
};


// ---------- Adaptive Career Assessment ----------

export const assessmentApi = {
  list: () => request<AssessmentSummary[]>("/api/assessment"),
  get: (id: number) => request<AssessmentSession>(`/api/assessment/${id}`),
  start: (stage: AssessmentStage, runId?: string) =>
    post<AssessmentSession>("/api/assessment/start", { stage }, runId),
  answer: (id: number, b: { questionId: string; selected: string[]; other: string; skip: boolean }, runId?: string) =>
    post<AssessmentSession>(`/api/assessment/${id}/answer`, b, runId),
  report: (id: number, runId?: string) => post<AssessmentSession>(`/api/assessment/${id}/report`, {}, runId),
};