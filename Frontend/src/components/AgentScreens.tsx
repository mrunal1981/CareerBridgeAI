import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, Award, BriefcaseBusiness, Check, Compass, FileSearch,
  GraduationCap, Search, Sparkles, UploadCloud, X,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  api, newRunId, watchRun,
  type ContextItem, type CounselingSession, type DashboardData, type JobMatch,
  type ResumeResult, type ScholarshipSearch, type Stage,
} from "@/lib/api";
import { cacheResult } from "@/lib/results";
import {
  COUNSEL_FLOWS, serializeAnswers, stepReady, visibleQuestions,
  type Answers, type CounselQuestion,
} from "@/lib/counselFlows";

/* ------------------------------------------------------------------ */
/* Small shared helpers                                                */
/* ------------------------------------------------------------------ */

export type AgentCard = {
  id: string; title: string; desc: string; icon: any; color: string; bg: string;
};

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card p-5 shadow-soft backdrop-blur-md sm:p-6 ${className}`}>{children}</div>;
}

export function PageTitle({ eyebrow, title, desc, icon: Icon }: { eyebrow: string; title: string; desc: string; icon: any }) {
  return (
    <div className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-primary">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-muted-foreground">{desc}</p>
      </div>
      <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary"><Icon /></div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">{message}</div>;
}

function Spinner() {
  return <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />;
}

// Shown under the form while the AI works. The results page opens by itself when it is done.
function AnalysisProgress({ label, status }: { label: string; status: string }) {
  return (
    <div className="mt-5 rounded-xl border border-primary/20 bg-secondary p-5" role="status" aria-live="polite">
      <p className="text-sm font-semibold">{status || label}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
        <motion.div className="h-full w-1/3 rounded-full bg-gradient-brand" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">This can take up to a minute. Please keep this page open, your results will open automatically.</p>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">{label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-12 rounded-xl border border-input bg-background px-4 font-normal outline-none transition-shadow focus:ring-2 focus:ring-ring" />
    </label>
  );
}

function SelectField({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-xl border border-input bg-background px-4 font-normal outline-none focus:ring-2 focus:ring-ring">
        {values.map((v) => <option key={v}>{v}</option>)}
      </select>
    </label>
  );
}

// Runs one AI request and keeps loading / error / result / live status for the screen.
// fn receives a run id; pass it to the api call so the backend can report live status.
function useTask<T>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState("");
  const busy = useRef(false); // blocks a second request even on a very fast double-click
  const run = async (fn: (runId: string) => Promise<T>): Promise<T | null> => {
    if (busy.current) return null;
    busy.current = true;
    const runId = newRunId();
    setLoading(true); setError(""); setData(null); setStatus("");
    const stop = watchRun(runId, (s) => setStatus(s.status === "queued" || s.status === "running" ? s.message : ""));
    try { const out = await fn(runId); setData(out); return out; }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); return null; }
    finally { stop(); setStatus(""); setLoading(false); busy.current = false; }
  };
  return { loading, error, data, status, run };
}

// Shows AI text appearing live, a few letters at a time.
function Typewriter({ text }: { text: string }) {
  const clean = text.replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const t = setInterval(() => setN((x) => (x >= clean.length ? x : x + 4)), 12);
    return () => clearInterval(t);
  }, [clean]);
  return <p className="whitespace-pre-wrap leading-7">{clean.slice(0, n)}</p>;
}

const last = <T,>(a: T[] | undefined): T | undefined => (a && a.length ? a[a.length - 1] : undefined);
const SPLIT = /\s[-–—]\s/;

/* ------------------------------------------------------------------ */
/* Overview (greeting + live numbers)                                  */
/* ------------------------------------------------------------------ */

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Overview({ setAgent, agents }: { setAgent: (a: any) => void; agents: AgentCard[] }) {
  const { student } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState<DashboardData | null>(null);
  const [ctx, setCtx] = useState<ContextItem[]>([]);

  // Clock: greeting and date update by themselves.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Numbers: loaded now and refreshed every 10 seconds from the backend.
  useEffect(() => {
    if (!student) return;
    let alive = true;
    const load = () => {
     api.dashboard(student.id).then((d) => { if (alive) setData(d); }).catch(() => {});
     api.context(student.id).then((c) => { if (alive) setCtx(c.items); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [student?.id]);

  const firstName = student?.name.trim().split(" ")[0] ?? "there";
  const resume = last(data?.resumes);
  const scholarship = last(data?.scholarshipSearches);
  const jobs = last(data?.jobMatches);
  const stats = [
    { l: "Resume score", v: resume?.atsScore != null ? `${resume.atsScore}/100` : "Not yet", i: FileSearch },
    { l: "Counseling sessions", v: String(data?.counselingSessions.length ?? 0), i: Compass },
    { l: "Scholarships", v: scholarship ? `${scholarship.scholarships.length} found` : "Not yet", i: Award },
    { l: "Job matches", v: jobs ? `${jobs.matches.length} roles` : "Not yet", i: BriefcaseBusiness },
  ];

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-brand p-7 text-primary-foreground shadow-glow sm:p-9">
        <div className="relative z-10 max-w-2xl">
          <p className="text-sm font-bold uppercase opacity-80">
            {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} · {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{greeting(now)}, {firstName}.</h1>
          <p className="mt-3 opacity-85">One thoughtful step today can change where you are a year from now.</p>
        </div>
        <Sparkles className="absolute -bottom-4 right-6 size-32 opacity-10" />
      </div>
      <h2 className="mt-9 text-xl font-bold">Your progress at a glance</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((x) => (
          <Panel key={x.l}><x.i className="text-primary" /><p className="mt-5 text-sm text-muted-foreground">{x.l}</p><p className="mt-1 font-display text-2xl font-extrabold">{x.v}</p></Panel>
        ))}
      </div>
                 <h2 className="mt-9 text-xl font-bold">What your agents know about you</h2>
           <Panel className="mt-4">
             {ctx.length === 0 ? (
               <p className="text-sm text-muted-foreground">Save your profile or run an agent, and what the other agents can reuse will appear here.</p>
             ) : (
               <div className="space-y-3">
                 {ctx.map((c) => (
                   <div key={c.key} className="rounded-xl border border-border bg-background/55 p-4">
                     <p className="text-xs font-bold uppercase text-primary">{c.label}</p>
                     <p className="mt-1 text-sm">{c.text}</p>
                   </div>
                 ))}
               </div>
             )}
           </Panel>
      <h2 className="mt-9 text-xl font-bold">Continue exploring</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {agents.map((a) => (
          <motion.button whileHover={{ y: -4 }} key={a.id} onClick={() => setAgent(a.id)} className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-soft">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${a.bg} ${a.color}`}><a.icon /></span>
            <span className="min-w-0 flex-1"><strong className="block truncate">{a.title}</strong><span className="text-sm text-muted-foreground">{a.desc}</span></span>
            <ArrowRight className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </motion.button>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Agent 01: Resume Evaluator                                          */
/* ------------------------------------------------------------------ */

export function ScoreRing({ score }: { score: number }) {
  return (
    <div className="relative size-40">
      <svg className="size-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" strokeWidth="9" className="text-muted" />
        <motion.circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" className="text-primary" strokeDasharray="320" initial={{ strokeDashoffset: 320 }} animate={{ strokeDashoffset: 320 * (1 - score / 100) }} transition={{ duration: 1.2, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center"><div><strong className="font-display text-4xl">{score}</strong><span className="text-muted-foreground">/100</span><p className="text-xs font-bold text-primary">ATS SCORE</p></div></div>
    </div>
  );
}

export function ResumeAgent() {
  const { student } = useAuth();
  const navigate = useNavigate();
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState("");
  const { loading, error, status, run } = useTask<ResumeResult>();

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) { setLocalError("Please choose a PDF file."); return; }
    if (f.size > 10 * 1024 * 1024) { setLocalError("The file is larger than 10MB."); return; }
    setLocalError(""); setFile(f);
  };

  const analyze = async () => {
    if (!student || loading) return; // loading guard: no second AI request while one is running
    setLocalError("");
    let out: ResumeResult | null = null;
    if (file) out = await run((id) => api.resumeUpload(student.id, file, id));
    else if (text.trim().length >= 50) out = await run((id) => api.resumeEvaluate(student.id, text, id));
    else { setLocalError("Upload a PDF, or paste your resume text (at least a few lines)."); return; }
    if (out) {
      cacheResult("resume", out);
      navigate({ to: "/results/$kind/$id", params: { kind: "resume", id: String(out.id) } });
    }
  };

  return (
    <>
      <PageTitle eyebrow="Agent 01" title="Resume Evaluator" desc="Get practical feedback before your resume reaches a recruiter." icon={FileSearch} />
      <Panel>
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          className={`flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition-all ${drag ? "border-primary bg-secondary scale-[1.01]" : "border-border bg-muted/35 hover:border-primary/60"}`}>
          <input type="file" accept=".pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <UploadCloud className="size-10 text-primary" />
          <h3 className="mt-4 text-lg font-bold">{file ? file.name : "Drop your resume here"}</h3>
          <p className="mt-2 text-sm text-muted-foreground">PDF only · maximum 10MB</p>
        </label>
        <p className="my-4 text-center text-sm font-semibold text-muted-foreground">or paste your resume text</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste your resume text here..."
          className="w-full rounded-xl border border-input bg-background p-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <Button variant="hero" size="lg" className="mt-5 w-full" onClick={analyze} disabled={loading}>
          {loading ? <><Spinner />{status || "AI is reading your resume..."}</> : <><Sparkles />Analyze Resume</>}
        </Button>
        {loading && <AnalysisProgress label="AI is reading your resume..." status={status} />}
        <ErrorBox message={localError || error} />
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Agent 02: Career & Exam Counselor                                   */
/* ------------------------------------------------------------------ */

const STAGES: { id: Stage; title: string; desc: string }[] = [
  { id: "BEFORE_10TH", title: "Before 10th", desc: "A quick quiz to find your direction" },
  { id: "AFTER_10TH", title: "After 10th", desc: "Science, Commerce, Arts or Diploma?" },
  { id: "AFTER_12TH", title: "After 12th", desc: "Courses and entrance exams" },
  { id: "EXAM_PREP", title: "Exam preparation", desc: "A smart plan for your exam" },
];

// Draws one question (chips for choices, an input for text / numbers).
function QuestionBlock({ q, value, onChange }: { q: CounselQuestion; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const chip = (on: boolean) => `rounded-full border px-4 py-2 text-sm font-semibold transition-all ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`;
  const picked = Array.isArray(value) ? value : [];
  const toggle = (o: string) => {
    if (picked.includes(o)) { onChange(picked.filter((x) => x !== o)); return; }
    const max = q.max ?? Infinity;
    onChange([...(picked.length >= max ? picked.slice(picked.length - max + 1) : picked), o]);
  };
  return (
    <div>
      <p className="font-semibold">{q.label}{q.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">optional</span>}</p>
      {q.type === "single" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(q.options ?? []).map((o) => <button key={o} onClick={() => onChange(o)} className={chip(value === o)}>{o}</button>)}
        </div>
      )}
      {q.type === "multi" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(q.options ?? []).map((o) => <button key={o} onClick={() => toggle(o)} className={chip(picked.includes(o))}>{o}</button>)}
        </div>
      )}
      {(q.type === "text" || q.type === "number") && (
        <input value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder={q.placeholder}
          inputMode={q.type === "number" ? "numeric" : "text"}
          className="mt-3 h-12 w-full rounded-xl border border-input bg-background px-4 outline-none transition-shadow focus:ring-2 focus:ring-ring" />
      )}
    </div>
  );
}

export function CareerAgent() {
  const { student, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0 = choose stage, 1..n = question steps of that stage
  const [stage, setStage] = useState<Stage | "">("");
  const [answers, setAnswers] = useState<Answers>({});
  const [profileMsg, setProfileMsg] = useState("");
  const { loading, error, status, run } = useTask<CounselingSession>();

  const flow = stage ? COUNSEL_FLOWS[stage] : [];
  const current = step > 0 ? flow[step - 1] : undefined;
  const dots = Math.max(flow.length, 3) + 1;
  const isLast = stage !== "" && step > 0 && step === flow.length;

  // Stream and marks saved in the profile are filled in automatically.
  const fromProfile = (): Answers => {
    const a: Answers = {};
    if (student?.stream && ["Science", "Commerce", "Arts"].includes(student.stream)) a["stream"] = student.stream;
    if (student?.marks != null) a["marks"] = String(student.marks);
    return a;
  };
  useEffect(() => { setAnswers((a) => ({ ...fromProfile(), ...a })); }, [student?.id]);

  const chooseStage = (s: Stage) => { if (s !== stage) { setStage(s); setAnswers(fromProfile()); setProfileMsg(""); } };
  const setAnswer = (id: string, v: string | string[]) => setAnswers((a) => ({ ...a, [id]: v }));

  const saveProfile = async () => {
    const raw = String(answers["marks"] ?? "").trim();
    const m = raw === "" ? null : Number(raw);
    if (m !== null && (Number.isNaN(m) || m < 0 || m > 100)) { setProfileMsg("Marks must be between 0 and 100."); return; }
    const st = answers["stream"];
    try {
      await updateProfile({ marks: m, ...(stage === "AFTER_12TH" && typeof st === "string" ? { stream: st } : {}) });
      setProfileMsg("Saved to your profile.");
    } catch (e) { setProfileMsg(e instanceof Error ? e.message : "Could not save."); }
  };

  const submit = async () => {
    if (!student || !stage || loading) return;
    const out = await run((id) => api.counsel({ studentId: student.id, stage, answers: serializeAnswers(flow, answers) }, id));
    if (out) {
      cacheResult("career", out);
      navigate({ to: "/results/$kind/$id", params: { kind: "career", id: String(out.id) } });
    }
  };

  const questions = current ? visibleQuestions(current, answers) : [];
  const hasProfileField = questions.some((q) => q.profile);

  return (
    <>
      <PageTitle eyebrow="Agent 02" title="Career & Exam Counselor" desc="Build a direction around what you enjoy and where you perform best." icon={Compass} />
      <Panel>
        <div className="mb-8 flex items-center">
          {Array.from({ length: dots }, (_, i) => i + 1).map((n) => (
            <div key={n} className={`flex items-center ${n < dots ? "flex-1" : ""}`}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${step + 1 >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{step + 1 > n ? <Check /> : n}</span>
              {n < dots && <span className={`h-1 flex-1 ${step + 1 > n ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {step === 0 && (
              <div>
                <h3 className="text-xl font-bold">Where are you right now?</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {STAGES.map((s) => (
                    <button key={s.id} onClick={() => chooseStage(s.id)} className={`rounded-2xl border p-5 text-left transition-all hover:-translate-y-1 ${stage === s.id ? "border-primary bg-secondary shadow-glow" : "border-border bg-background/50"}`}>
                      <strong className="block">{s.title}</strong><span className="mt-1 block text-sm text-muted-foreground">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {current && (
              <div>
                <h3 className="text-xl font-bold">{current.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{current.hint}</p>
                <div className="mt-6 space-y-6">
                  {questions.map((q) => <QuestionBlock key={q.id} q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />)}
                </div>
                {hasProfileField && (
                  <div className="mt-6 flex items-center gap-3">
                    <Button variant="outline" onClick={saveProfile}>Save to profile</Button>
                    {profileMsg && <span className="text-sm text-muted-foreground">{profileMsg}</span>}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" disabled={step === 0 || loading} onClick={() => setStep(step - 1)}>Back</Button>
          {!isLast
            ? <Button variant="hero" onClick={() => setStep(step + 1)} disabled={(step === 0 && !stage) || (current !== undefined && !stepReady(current, answers))}>Continue <ArrowRight /></Button>
            : <Button variant="warm" onClick={submit} disabled={loading || (current !== undefined && !stepReady(current, answers))}>{loading ? <><Spinner />{status || "AI is thinking..."}</> : <>Get Guidance <Sparkles /></>}</Button>}
        </div>
        {loading && <AnalysisProgress label="Your counselor is preparing a personal report..." status={status} />}
        <ErrorBox message={error} />
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Agent 03: Scholarship Finder                                        */
/* ------------------------------------------------------------------ */

const STATES = ["Maharashtra", "Karnataka", "Delhi", "Tamil Nadu", "Telangana", "Andhra Pradesh", "Kerala", "Gujarat", "Rajasthan", "Madhya Pradesh", "Uttar Pradesh", "Bihar", "West Bengal", "Odisha", "Punjab", "Haryana", "Other"];

export function ScholarshipAgent() {
  const { student, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [education, setEducation] = useState("Undergraduate");
  const [state, setState] = useState("Maharashtra");
  const [category, setCategory] = useState("General");
  const [marks, setMarks] = useState("");
  const [interests, setInterests] = useState("");
  const { loading, error, status, run } = useTask<ScholarshipSearch>();
  const [profileMsg, setProfileMsg] = useState("");

  useEffect(() => {
    if (!student) return;
    if (student.state && STATES.includes(student.state)) setState(student.state);
    if (student.incomeCategory && ["General", "OBC", "SC", "ST", "EWS"].includes(student.incomeCategory)) setCategory(student.incomeCategory);
    if (student.marks != null) setMarks(String(student.marks));
  }, [student?.id]);

  const saveProfile = async () => {
    const m = marks.trim() === "" ? null : Number(marks);
    if (m !== null && (Number.isNaN(m) || m < 0 || m > 100)) { setProfileMsg("Marks must be between 0 and 100."); return; }
    try {
      await updateProfile({ marks: m, state, incomeCategory: category });
      setProfileMsg("Saved to your profile.");
    } catch (e) { setProfileMsg(e instanceof Error ? e.message : "Could not save."); }
  };

  const find = async () => {
    if (!student || loading) return;
    const extra = [marks.trim() && `Marks: ${marks.trim()}%`, interests.trim()].filter(Boolean).join(". ");
    const out = await run((id) => api.findScholarships({ studentId: student.id, educationLevel: education, category, state, interests: extra }, id));
    if (out) {
      cacheResult("scholarship", out);
      navigate({ to: "/results/$kind/$id", params: { kind: "scholarship", id: String(out.id) } });
    }
  };

  return (
    <>
      <PageTitle eyebrow="Agent 03" title="Scholarship & Resource Finder" desc="Find financial support and high-quality learning without the noise." icon={GraduationCap} />
      <Panel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SelectField label="Education" values={["Class 12", "Diploma", "Undergraduate", "Postgraduate"]} value={education} onChange={setEducation} />
          <SelectField label="State" values={STATES} value={state} onChange={setState} />
          <SelectField label="Category" values={["General", "OBC", "SC", "ST", "EWS"]} value={category} onChange={setCategory} />
          <Field label="Marks (%)" placeholder="e.g. 82" value={marks} onChange={setMarks} />
          <Field label="Field / interests" placeholder="e.g. engineering, girls" value={interests} onChange={setInterests} />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="hero" size="lg" onClick={find} disabled={loading}>
            {loading ? <><Spinner />{status || "AI is searching..."}</> : <><Search />Find Scholarships</>}
          </Button>
          <Button variant="outline" size="lg" onClick={saveProfile} disabled={loading}>Save to profile</Button>
          {profileMsg && <span className="text-sm text-muted-foreground">{profileMsg}</span>}
        </div>
        {loading && <AnalysisProgress label="AI is searching..." status={status} />}
        <ErrorBox message={error} />
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Agent 04: Job Matcher                                               */
/* ------------------------------------------------------------------ */

const SKILL_IDEAS = ["Python", "Java", "SQL", "React", "Excel", "Communication", "Data Analysis", "Figma"];

export function JobsAgent() {
  const { student } = useAuth();
  const navigate = useNavigate();
  const [skills, setSkills] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState("Fresher");
  const { loading, error, status, run } = useTask<JobMatch>();

  const addSkill = (s: string) => {
    const v = s.trim();
    if (v && !skills.some((x) => x.toLowerCase() === v.toLowerCase())) setSkills((x) => [...x, v]);
    setTyped("");
  };

  const find = async () => {
    if (!student || loading) return;
    const all = typed.trim() ? [...skills, typed.trim()] : skills;
    if (all.length === 0) return;
    const out = await run((id) => api.matchJobs({ studentId: student.id, skills: all.join(", "), preferredRole: role, experienceLevel: level }, id));
    if (out) {
      cacheResult("jobs", out);
      navigate({ to: "/results/$kind/$id", params: { kind: "jobs", id: String(out.id) } });
    }
  };

  return (
    <>
      <PageTitle eyebrow="Agent 04" title="Job Matcher" desc="See where your current skills can take you, and what to learn next." icon={BriefcaseBusiness} />
      <Panel>
        <p className="text-sm font-bold">Your skills</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {skills.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-secondary px-4 py-2 text-sm font-semibold text-primary">
              {s}<button aria-label={`Remove ${s}`} onClick={() => setSkills((x) => x.filter((y) => y !== s))}><X className="size-3.5" /></button>
            </span>
          ))}
        </div>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(typed); } }}
          placeholder="Type a skill and press Enter" className="mt-3 h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring" />
        <div className="mt-3 flex flex-wrap gap-2">
          {SKILL_IDEAS.filter((s) => !skills.includes(s)).map((s) => (
            <button key={s} onClick={() => addSkill(s)} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary">+ {s}</button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Preferred role (optional)" placeholder="e.g. Data Analyst" value={role} onChange={setRole} />
          <SelectField label="Experience level" values={["Fresher", "Intern", "0-1 years", "1-3 years"]} value={level} onChange={setLevel} />
        </div>
        <Button variant="warm" size="lg" className="mt-6" onClick={find} disabled={loading || (skills.length === 0 && !typed.trim())}>
          {loading ? <><Spinner />{status || "AI is matching..."}</> : <><Search />Find Matching Jobs</>}
        </Button>
        {loading && <AnalysisProgress label="AI is matching..." status={status} />}
        <ErrorBox message={error} />
      </Panel>
    </>
  );
}