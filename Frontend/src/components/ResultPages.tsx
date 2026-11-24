import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, Award, BriefcaseBusiness, Check, Compass, FileSearch,
  GraduationCap, Lightbulb, Moon, Sparkles, Sun, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, ScoreRing } from "@/components/AgentScreens";
import { isResultKind, useSavedResult, type ResultKind } from "@/lib/results";
import type { CounselingSession, JobMatch, ResumeAnalysis, ResumeResult, ScholarshipSearch } from "@/lib/api";

const THEME_KEY = "careerbridge.theme";

const META = {
  resume: { back: "Resume Evaluator", eyebrow: "Agent 01 · Resume Evaluator", title: "Your resume analysis", icon: FileSearch },
  career: { back: "Career & Exam Counselor", eyebrow: "Agent 02 · Career & Exam Counselor", title: "Your career report", icon: Compass },
  scholarship: { back: "Scholarship Finder", eyebrow: "Agent 03 · Scholarship Finder", title: "Scholarships for you", icon: GraduationCap },
  jobs: { back: "Job Matcher", eyebrow: "Agent 04 · Job Matcher", title: "Your job matches", icon: BriefcaseBusiness },
} as const;

/* ---------------- Page shell: header, back button, theme ---------------- */

function Shell({ kind, subtitle, children }: { kind: ResultKind; subtitle?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const m = META[kind];

  useEffect(() => {
    try { setDark(localStorage.getItem(THEME_KEY) === "dark"); } catch { /* ignore */ }
  }, []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    try { localStorage.setItem(THEME_KEY, next ? "dark" : "light"); } catch { /* ignore */ }
  };
  const backToAgent = () => navigate({ to: "/", search: { agent: kind } });

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-8">
            <button onClick={() => navigate({ to: "/" })} className="flex min-w-0 items-center gap-2.5" aria-label="CareerBridge home">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-brand text-primary-foreground shadow-glow"><Sparkles size={18} /></span>
              <span className="truncate font-display text-xl font-extrabold">Career<span className="text-primary">Bridge</span></span>
            </button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={backToAgent}><ArrowLeft /><span className="hidden sm:inline">Back to {m.back}</span><span className="sm:hidden">Back</span></Button>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme" className="rounded-full">{dark ? <Sun /> : <Moon />}</Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-primary">{m.eyebrow}</p>
                <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{m.title}</h1>
                {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary"><m.icon /></div>
            </div>
            {children}
            <div className="mt-10 flex flex-wrap gap-3">
              <Button variant="hero" onClick={backToAgent}><ArrowLeft />Back to {m.back}</Button>
              <Button variant="outline" onClick={() => navigate({ to: "/", search: { agent: "overview" } })}>Go to dashboard</Button>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function Notice({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <Panel className="text-center">
      <TriangleAlert className="mx-auto text-accent" />
      <h2 className="mt-3 text-xl font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{text}</p>
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </Panel>
  );
}

function LoadingBlocks() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your results">
      {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-muted/50" />)}
    </div>
  );
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : `Generated on ${d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
};

/* ---------------- Entry point used by the route ---------------- */

export function ResultsPage({ kind, id }: { kind: string; id: number }) {
  if (!isResultKind(kind)) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <Notice title="Unknown result type" text="This link does not point to a CareerBridge result.">
          <a href="/" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Go home</a>
        </Notice>
      </div>
    );
  }
  return <Loaded kind={kind} id={id} />;
}

function Loaded({ kind, id }: { kind: ResultKind; id: number }) {
  const navigate = useNavigate();
  const state = useSavedResult(kind, id);
  const m = META[kind];

  let body: ReactNode;
  let subtitle: string | undefined;

  if (state.status === "loading") body = <LoadingBlocks />;
  else if (state.status === "login") {
    body = <Notice title="Please log in" text="Log in to see your saved results."><Button variant="hero" onClick={() => navigate({ to: "/" })}>Go to login</Button></Notice>;
  } else if (state.status === "missing") {
    body = <Notice title="Result not found" text="This result does not exist, or it belongs to another account. Run the agent again to create a new one."><Button variant="hero" onClick={() => navigate({ to: "/", search: { agent: kind } })}>Open {m.back}</Button></Notice>;
  } else if (state.status === "error") {
    body = <Notice title="Could not load this result" text={state.message}><Button variant="outline" onClick={() => window.location.reload()}>Try again</Button></Notice>;
  } else {
    // "ready": TypeScript cannot narrow state.data by kind here, so each view casts its own type.
    const d = state.data;
    if (kind === "resume") body = <ResumeView r={d as ResumeResult} />;
    else if (kind === "career") { body = <CareerView s={d as CounselingSession} />; subtitle = fmtDate((d as CounselingSession).createdAt); }
    else if (kind === "scholarship") { body = <ScholarshipView s={d as ScholarshipSearch} />; subtitle = fmtDate((d as ScholarshipSearch).createdAt); }
    else { body = <JobsView j={d as JobMatch} />; subtitle = fmtDate((d as JobMatch).createdAt); }
  }
  return <Shell kind={kind} {...(subtitle ? { subtitle } : {})}>{body}</Shell>;
}

/* ---------------- Small building blocks ---------------- */

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

function Section({ title, icon: Icon, children }: { title: string; icon?: any; children: ReactNode }) {
  return (
    <Panel>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-5 text-primary" />}
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </Panel>
  );
}

function Bullets({ items, tone }: { items: string[]; tone: "good" | "warn" }) {
  return (
    <ul className="space-y-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-3 text-sm">
          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${tone === "good" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
            {tone === "good" ? <Check className="size-3.5" /> : <TriangleAlert className="size-3" />}
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Chips({ items, tone = "primary" }: { items: string[]; tone?: "primary" | "muted" }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((s) => (
        <span key={s} className={`rounded-full px-3 py-1 text-xs font-bold ${tone === "primary" ? "bg-secondary text-primary" : "border border-border bg-background text-muted-foreground"}`}>{s}</span>
      ))}
    </div>
  );
}

/* ---------------- Resume ---------------- */

function parseAnalysis(json?: string | null): ResumeAnalysis | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    return {
      summary: typeof o["summary"] === "string" ? o["summary"] : "",
      strengths: strList(o["strengths"]),
      weaknesses: strList(o["weaknesses"]),
      skillsFound: strList(o["skillsFound"]),
      skillsToAdd: strList(o["skillsToAdd"]),
      suitableRoles: strList(o["suitableRoles"]),
    };
  } catch { return null; }
}

function ResumeView({ r }: { r: ResumeResult }) {
  const a = parseAnalysis(r.analysisJson);
  const score = r.atsScore ?? 0;
  const verdict = score >= 80 ? "Strong resume" : score >= 60 ? "Solid foundation" : "Needs work";
  const suggestions = strList(r.suggestions);
  const missing = strList(r.missingSections);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Panel className="grid place-items-center text-center">
          <ScoreRing score={score} />
          <h3 className="mt-3 text-lg font-bold">{verdict}</h3>
        </Panel>
        <Section title="Summary" icon={FileSearch}>
          {a?.summary ? <p className="leading-7">{a.summary}</p> : (
            <p className="text-sm text-muted-foreground">
              Your ATS score is {score}/100. {missing.length > 0 ? `${missing.length} standard section${missing.length > 1 ? "s are" : " is"} missing.` : "All standard sections are present."} A detailed summary, strengths and skills analysis are included for resumes analysed after this update.
            </p>
          )}
        </Section>
      </div>

      {a && (a.strengths?.length || a.weaknesses?.length) ? (
        <div className="grid gap-5 md:grid-cols-2">
          {a.strengths?.length ? <Section title="Strengths" icon={Check}><Bullets items={a.strengths} tone="good" /></Section> : null}
          {a.weaknesses?.length ? <Section title="Weaknesses" icon={TriangleAlert}><Bullets items={a.weaknesses} tone="warn" /></Section> : null}
        </div>
      ) : null}

      {suggestions.length > 0 && (
        <Section title="Improvement suggestions" icon={Lightbulb}>
          <div className="space-y-3">
            {suggestions.map((t, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-background/55 p-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold text-primary">{i + 1}</span>
                <p className="text-sm">{t}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {missing.length > 0 && (
        <Section title="Missing sections" icon={TriangleAlert}>
          <div className="flex flex-wrap gap-2">
            {missing.map((m) => <span key={m} className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">{m}</span>)}
          </div>
        </Section>
      )}

      {a && (a.skillsFound?.length || a.skillsToAdd?.length) ? (
        <Section title="Skills analysis" icon={Sparkles}>
          <div className="grid gap-5 md:grid-cols-2">
            {a.skillsFound?.length ? <div><p className="mb-2 text-sm font-semibold">Skills found in your resume</p><Chips items={a.skillsFound} /></div> : null}
            {a.skillsToAdd?.length ? <div><p className="mb-2 text-sm font-semibold">Skills worth adding</p><Chips items={a.skillsToAdd} tone="muted" /></div> : null}
          </div>
        </Section>
      ) : null}

      {a?.suitableRoles?.length ? (
        <Section title="Roles that suit your resume" icon={BriefcaseBusiness}>
          <Chips items={a.suitableRoles} />
        </Section>
      ) : null}
    </div>
  );
}

/* ---------------- Career counselor ---------------- */

const STAGE_LABEL: Record<string, string> = {
  BEFORE_10TH: "Before 10th", AFTER_10TH: "After 10th", AFTER_12TH: "After 12th", EXAM_PREP: "Exam preparation",
};

// The AI writes "## Heading" sections; each one becomes a card.
function parseSections(text: string): { title: string; lines: string[] }[] {
  const clean = text.replace(/\*\*/g, "");
  const out: { title: string; lines: string[] }[] = [];
  for (const raw of clean.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h = /^#{1,3}\s*(.+)$/.exec(line);
    if (h && h[1]) out.push({ title: h[1].trim(), lines: [] });
    else if (out.length > 0) out[out.length - 1]?.lines.push(line);
    else out.push({ title: "", lines: [line] });
  }
  return out;
}

function CareerView({ s }: { s: CounselingSession }) {
  const sections = parseSections(s.recommendation ?? "");
  const answers = (s.answers ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">{STAGE_LABEL[s.stage] ?? s.stage}</span>
      </div>

      {sections.length === 0 && <Notice title="No report text" text="The counselor did not return any text. Please run it again." />}
      {sections.map((sec, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
          <Panel>
            {sec.title && <h2 className="text-lg font-bold">{sec.title}</h2>}
            <div className={`${sec.title ? "mt-3" : ""} space-y-2 text-sm leading-7`}>
              {sec.lines.map((l, j) => /^([-*•]|\d+[.)])\s+/.test(l)
                ? <p key={j} className="flex gap-3"><ArrowRight className="mt-1.5 size-4 shrink-0 text-primary" /><span>{l.replace(/^([-*•]|\d+[.)])\s+/, "")}</span></p>
                : <p key={j}>{l}</p>)}
            </div>
          </Panel>
        </motion.div>
      ))}

      {answers.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <summary className="cursor-pointer text-sm font-bold">What you told the counselor</summary>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {answers.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ---------------- Scholarships ---------------- */

const SPLIT = /\s[-–—]\s/;

function ScholarshipView({ s }: { s: ScholarshipSearch }) {
  const items = strList(s.scholarships);
  const criteria = [s.educationLevel, s.category, s.state, s.interests].filter((x): x is string => !!x && x.trim() !== "");
  return (
    <div>
      {criteria.length > 0 && <div className="mb-6"><p className="mb-2 text-sm font-semibold">Based on</p><Chips items={criteria} tone="muted" /></div>}
      <h2 className="mb-4 text-xl font-bold">{items.length} suggestions for you</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item, i) => {
          const [name, ...rest] = item.split(SPLIT);
          return (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} key={i}>
              <Panel className="h-full">
                <Award className="text-accent" />
                <h3 className="mt-4 font-bold">{name}</h3>
                {rest.length > 0 && <p className="mt-2 text-sm text-muted-foreground">{rest.join(" · ")}</p>}
                {rest.length > 0 && (
                  <a href={`https://www.google.com/search?q=${encodeURIComponent((name ?? "") + " scholarship apply")}`} target="_blank" rel="noreferrer"
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border text-sm font-semibold hover:bg-secondary">
                    Open official info <ArrowRight className="size-4" />
                  </a>
                )}
              </Panel>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Jobs ---------------- */

const JOB_FORMAT = /^(.*?)\s*\(\s*match\s*~?(\d{1,3})\s*%\s*\)\s*[-–—:]\s*(.*?)\s*[-–—]\s*(.*)$/i;

function JobsView({ j }: { j: JobMatch }) {
  const items = strList(j.matches);
  const input = [...(j.skills ? j.skills.split(",").map((x) => x.trim()).filter(Boolean) : [])];
  return (
    <div>
      {input.length > 0 && <div className="mb-6"><p className="mb-2 text-sm font-semibold">Your skills</p><Chips items={input} /></div>}
      <h2 className="mb-4 text-xl font-bold">Your strongest matches</h2>
      <div className="space-y-4">
        {items.map((item, i) => {
          const m = JOB_FORMAT.exec(item);
          const title = m?.[1] ?? item;
          const pct = m?.[2] ? Math.min(100, Number(m[2])) : null;
          return (
            <motion.div whileHover={{ y: -4 }} key={i}>
              <Panel>
                <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold">{title}</h3>
                    {m ? (
                      <>
                        <p className="mt-3 text-sm text-muted-foreground"><strong className="text-foreground">Why it fits:</strong> {m[3]}</p>
                        <p className="mt-2 text-sm text-muted-foreground"><strong className="text-foreground">Learn next:</strong> {m[4]}</p>
                      </>
                    ) : null}
                  </div>
                  <div>
                    {pct !== null && (
                      <>
                        <div className="flex items-center justify-between text-sm"><span>Match</span><strong className="text-success">{pct}%</strong></div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"><motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: i * 0.1, duration: 0.8 }} className="h-full rounded-full bg-gradient-brand" /></div>
                      </>
                    )}
                    <a href={`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer"
                      className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md border border-border text-sm font-semibold hover:bg-secondary">Search live jobs</a>
                  </div>
                </div>
              </Panel>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}