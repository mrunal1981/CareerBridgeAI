import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Compass, Info, Moon, Sparkles, Sun, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/AgentScreens";
import { useAuth } from "@/lib/auth";
import { assessmentApi } from "@/lib/api";
import { parseReport, STAGE_NAMES, type AssessmentSession, type CareerReport, type ReportCareer } from "@/lib/assessment";

const THEME_KEY = "careerbridge.theme";

const NAV = [
  ["summary", "Profile"], ["careers", "Top careers"], ["alternatives", "Other paths"], ["skills", "Skill gap"],
  ["roadmap", "Roadmap"], ["resources", "Resources"], ["education", "Education"], ["scores", "About scores"],
] as const;

function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  useEffect(() => { try { setDark(localStorage.getItem(THEME_KEY) === "dark"); } catch { /* ignore */ } }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    try { localStorage.setItem(THEME_KEY, next ? "dark" : "light"); } catch { /* ignore */ }
  };
  const back = () => navigate({ to: "/", search: { agent: "career" } });
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
              <Button variant="outline" onClick={back}><ArrowLeft /><span className="hidden sm:inline">Back to Career Counselor</span><span className="sm:hidden">Back</span></Button>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" className="rounded-full">{dark ? <Sun /> : <Moon />}</Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

function Notice({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Panel className="text-center">
      <TriangleAlert className="mx-auto text-accent" />
      <h2 className="mt-3 text-xl font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Panel>
  );
}

export function AssessmentReportPage({ id }: { id: number }) {
  const { student, ready } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<AssessmentSession | null>(null);
  const [state, setState] = useState<"loading" | "login" | "missing" | "error" | "ok">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!student) { setState("login"); return; }
    if (!Number.isInteger(id)) { setState("missing"); return; }
    let alive = true;
    setState("loading");
    assessmentApi.get(id)
      .then((s) => { if (alive) { setSession(s); setState("ok"); } })
      .catch((e: unknown) => {
        if (!alive) return;
        const status = (e as { status?: number }).status;
        if (status === 404 || status === 403) setState("missing");
        else { setMessage(e instanceof Error ? e.message : "Could not load this report."); setState("error"); }
      });
    return () => { alive = false; };
  }, [ready, student?.id, id]);

  const home = <Button variant="hero" onClick={() => navigate({ to: "/", search: { agent: "career" } })}>Open Career Counselor</Button>;
  const report = session ? parseReport(session.reportJson) : null;

  let body: ReactNode;
  if (state === "loading") body = <div className="space-y-4" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-muted/50" />)}</div>;
  else if (state === "login") body = <Notice title="Please log in" text="Log in to see your saved career report." action={<Button variant="hero" onClick={() => navigate({ to: "/" })}>Go to login</Button>} />;
  else if (state === "missing") body = <Notice title="Report not found" text="This report does not exist, or it belongs to another account." action={home} />;
  else if (state === "error") body = <Notice title="Could not load this report" text={message} action={<Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>} />;
  else if (!report || !session) body = <Notice title="Your report is not ready yet" text="Finish the questions and press “Generate my career report”." action={home} />;
  else body = <ReportView report={report} />;

  return <Shell>{body}</Shell>;
}

/* ---------------- small building blocks ---------------- */

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <Panel>
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="mt-4">{children}</div>
      </Panel>
    </section>
  );
}

const List = ({ items, tone = "plain" }: { items: string[]; tone?: "plain" | "good" | "warn" }) =>
  items.length === 0 ? null : (
    <ul className="space-y-2 text-sm">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2.5">
          {tone === "good" ? <Check className="mt-0.5 size-4 shrink-0 text-success" />
            : tone === "warn" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              : <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />}
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );

const Labeled = ({ label, items }: { label: string; items: string[] }) =>
  items.length === 0 ? null : (<div><h4 className="mb-2 text-sm font-semibold">{label}</h4><List items={items} /></div>);

const Chips = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((s) => <span key={s} className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">{s}</span>)}
  </div>
);

const needWord = (n: number) => (n >= 3 ? "Very important" : n === 2 ? "Important" : "Helpful");

function CareerCard({ c, rank }: { c: ReportCareer; rank: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: rank * 0.05 }}
      className="rounded-2xl border border-border bg-background/55 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-primary">#{rank + 1} · {c.domain}</p>
          <h3 className="mt-1 text-xl font-bold">{c.name}</h3>
        </div>
        <div className="w-40" title="Indicative compatibility, not a chance of getting a job">
          <div className="flex items-center justify-between text-xs"><span>Compatibility</span><strong className="text-success">{c.score}%</strong></div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={c.score} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.name} compatibility`}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${c.score}%` }} transition={{ duration: 0.7, delay: rank * 0.05 }} className="h-full rounded-full bg-gradient-brand" />
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-7">{c.why}</p>

      {c.breakdown.length > 0 && (
        <div className="mt-4 rounded-xl bg-secondary/60 p-4">
          <p className="text-xs font-bold uppercase text-primary">Why this score</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {c.breakdown.map((b) => (
              <li key={b.key} className="flex items-center justify-between gap-3">
                <span>{b.label} <span className="text-xs text-muted-foreground">({needWord(b.need)} for this career)</span></span>
                <span className="font-semibold">your answers: {b.level}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group mt-4">
        <summary className="cursor-pointer text-sm font-bold text-primary">Skills, education, opportunities and first steps</summary>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <Labeled label="Required skills" items={c.requiredSkills} />
          {c.education && <div><h4 className="mb-2 text-sm font-semibold">Required education</h4><p className="text-sm">{c.education}</p></div>}
          <Labeled label="Important entrance exams (check eligibility on the official site)" items={c.entranceExams} />
          <Labeled label="Career opportunities" items={c.opportunities} />
          <div>{c.advantages.length > 0 && <><h4 className="mb-2 text-sm font-semibold">Advantages</h4><List items={c.advantages} tone="good" /></>}</div>
          <div>{c.challenges.length > 0 && <><h4 className="mb-2 text-sm font-semibold">Challenges</h4><List items={c.challenges} tone="warn" /></>}</div>
        </div>
        <div className="mt-5"><Labeled label="Suggested starting roadmap" items={c.startRoadmap} /></div>
      </details>
    </motion.div>
  );
}

const GROUP_TITLE = { interest: "Interests", skill: "Strengths (as you described them)", style: "Working style" } as const;

function ReportView({ report: r }: { report: CareerReport }) {
  const roadmapCols: [string, string[]][] = [
    ["Immediate actions", r.roadmap.immediate], ["Next 3 months", r.roadmap.next3Months], ["Next 6 months", r.roadmap.next6Months],
    ["Next 12 months", r.roadmap.next12Months], ["Long-term goals", r.roadmap.longTerm],
  ];
  const resourceCols: [string, string[]][] = [
    ["Courses", r.resources.courses], ["Certifications", r.resources.certifications], ["Books", r.resources.books],
    ["Projects to build", r.resources.projects], ["Learning platforms", r.resources.platforms], ["Practice resources", r.resources.practice],
  ];
  const hasRoadmap = roadmapCols.some(([, v]) => v.length > 0);
  const hasResources = resourceCols.some(([, v]) => v.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase text-primary">Career report · {STAGE_NAMES[r.stage] ?? r.stage}</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Your career discovery report</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Based on {r.answeredCount} answers · created {new Date(r.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>

      {(!r.aiParts.careers || !r.aiParts.overview) && (
        <div className="flex gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm" role="status">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>The AI could not write every part of this report right now, so some sections are shorter. Your scores and ranking are not affected.</span>
        </div>
      )}

      <nav aria-label="Report sections" className="sticky top-16 z-30 -mx-1 flex gap-2 overflow-x-auto bg-background/85 px-1 py-2 backdrop-blur">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary">{label}</a>
        ))}
      </nav>

      <Block id="summary" title="Your profile">
        <div className="grid gap-5 md:grid-cols-2">
          {r.profile.education && <div><h4 className="mb-2 text-sm font-semibold">Education</h4><p className="text-sm">{r.profile.education}</p></div>}
          <div><h4 className="mb-2 text-sm font-semibold">Interests</h4><Chips items={r.profile.interests} /></div>
          <div><h4 className="mb-2 text-sm font-semibold">Skills you reported</h4><Chips items={r.profile.skills} /></div>
          <div><h4 className="mb-2 text-sm font-semibold">Working preferences</h4><Chips items={r.profile.preferences} /></div>
          {r.profile.strengths.length > 0 && <Labeled label="Strengths" items={r.profile.strengths} />}
          {r.profile.goals.length > 0 && <Labeled label="Goals" items={r.profile.goals} />}
        </div>
        {r.interestAnalysis && (
          <div className="mt-6 rounded-xl bg-secondary/60 p-4">
            <h4 className="text-sm font-bold">Interests and working style</h4>
            <p className="mt-2 text-sm leading-7">{r.interestAnalysis}</p>
            <p className="mt-2 text-xs text-muted-foreground">This describes your answers. It is not a personality type or a scientific test.</p>
          </div>
        )}
        {r.dimensions.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 text-sm font-bold">What your answers point to most</h4>
            <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
              {r.dimensions.map((d) => (
                <div key={d.key}>
                  <div className="flex items-center justify-between text-xs"><span>{d.label} <span className="text-muted-foreground">· {GROUP_TITLE[d.group]}</span></span><span className="font-semibold">{d.percent}%</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-brand" style={{ width: `${d.percent}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Block>

      <Block id="careers" title="Top career recommendations">
        <p className="mb-4 text-sm text-muted-foreground">Ranked by compatibility with your answers. Open a career for skills, education, exams and first steps.</p>
        <div className="space-y-4">{r.careers.map((c, i) => <CareerCard key={c.name} c={c} rank={i} />)}</div>
      </Block>

      <Block id="alternatives" title="Paths you may not have considered">
        <div className="grid gap-4 md:grid-cols-3">
          {r.alternativeCareers.map((a) => (
            <div key={a.name} className="rounded-2xl border border-border bg-background/55 p-4">
              <p className="text-xs font-bold uppercase text-primary">{a.domain}</p>
              <h3 className="mt-1 font-bold">{a.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Compatibility {a.score}%</p>
              <p className="mt-2 text-sm">{a.reason}</p>
            </div>
          ))}
        </div>
      </Block>

      <Block id="skills" title="Skill gap analysis">
        <div className="grid gap-5 md:grid-cols-2">
          <div>{r.skillGap.strengths.length > 0 && <><h4 className="mb-2 text-sm font-semibold">Existing strengths</h4><List items={r.skillGap.strengths} tone="good" /></>}</div>
          <div>{r.skillGap.toImprove.length > 0 && <><h4 className="mb-2 text-sm font-semibold">Needs improvement</h4><List items={r.skillGap.toImprove} tone="warn" /></>}</div>
          <Labeled label="Technical skills to build" items={r.skillGap.technical} />
          <Labeled label="Soft skills to build" items={r.skillGap.soft} />
          <Labeled label="Recommended learning areas" items={r.skillGap.learning} />
        </div>
        {Object.values(r.skillGap).every((v) => v.length === 0) && <p className="text-sm text-muted-foreground">The AI did not return this section this time.</p>}
      </Block>

      <Block id="roadmap" title="Your personal roadmap">
        {hasRoadmap ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {roadmapCols.filter(([, v]) => v.length > 0).map(([t, v]) => (
              <div key={t} className="rounded-2xl border border-border bg-background/55 p-4"><h4 className="mb-2 text-sm font-bold text-primary">{t}</h4><List items={v} /></div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">The AI did not return this section this time.</p>}
      </Block>

      <Block id="resources" title="Courses and resources">
        <p className="mb-4 text-xs text-muted-foreground">Names and types only. Always confirm details on the provider&apos;s own website.</p>
        {hasResources ? (
          <div className="grid gap-5 md:grid-cols-2">{resourceCols.map(([t, v]) => <Labeled key={t} label={t} items={v} />)}</div>
        ) : <p className="text-sm text-muted-foreground">The AI did not return this section this time.</p>}
      </Block>

      <Block id="education" title="Education and entrance exam guidance">
        <div className="grid gap-5 md:grid-cols-2">
          <Labeled label="Education pathways" items={r.educationGuidance.pathways} />
          <Labeled label="Entrance exams to look at" items={r.educationGuidance.entranceExams} />
        </div>
        {r.educationGuidance.notes && <p className="mt-4 text-sm">{r.educationGuidance.notes}</p>}
        <p className="mt-4 text-xs text-muted-foreground">Eligibility, dates and fees change. Check them on the official website of each exam or college.</p>
      </Block>

      <Block id="scores" title="How the compatibility scores work">
        <p className="text-sm leading-7">{r.scoring.method}</p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{r.scoring.disclaimer}</p>
      </Block>

      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><Compass className="text-primary" /><p className="text-sm font-semibold">Want to explore more or change your answers? Start a new assessment any time.</p></div>
      </Panel>
    </div>
  );
}
