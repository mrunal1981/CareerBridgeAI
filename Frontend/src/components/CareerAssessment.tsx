import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Compass, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/AgentScreens";
import { useAuth } from "@/lib/auth";
import { assessmentApi, newRunId, watchRun } from "@/lib/api";
import {
  parseState, STAGE_NAMES,
  type AssessmentQuestion, type AssessmentSession, type AssessmentStage, type AssessmentSummary,
} from "@/lib/assessment";

const STAGE_CARDS: { id: AssessmentStage; desc: string }[] = [
  { id: "BEFORE_10TH", desc: "Find your direction early" },
  { id: "AFTER_10TH", desc: "Choose a stream or path" },
  { id: "AFTER_12TH", desc: "Choose a course and career" },
  { id: "UNDERGRAD", desc: "Plan your next career step" },
];

type Draft = { selected: string[]; other: string };
const emptyDraft: Draft = { selected: [], other: "" };

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// Keeps one request at a time and shows the live status text from the backend.
function useGuardedCall() {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const run = async <T,>(label: string, fn: (runId: string) => Promise<T>): Promise<T | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(label); setError(""); setStatus("");
    const runId = newRunId();
    const stop = watchRun(runId, (s) => setStatus(s.status === "queued" || s.status === "running" ? s.message : ""));
    try { return await fn(runId); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); return null; }
    finally { stop(); setStatus(""); setBusy(""); busyRef.current = false; }
  };
  return { busy, status, error, setError, run };
}

export function CareerAssessment() {
  const { student } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<AssessmentSession | null>(null);
  const [past, setPast] = useState<AssessmentSummary[]>([]);
  const [view, setView] = useState(0); // index of the question on screen (== number of questions -> review screen)
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const { busy, status, error, setError, run } = useGuardedCall();

  const state = useMemo(() => (session ? parseState(session.stateJson) : null), [session]);
  const total = state?.questions.length ?? 0;
  const question: AssessmentQuestion | undefined = state?.questions[view];
  const showReview = state !== null && state.status === "ready" && view >= total;

  // Earlier assessments of this student (to continue or open).
  useEffect(() => {
    if (!student) return;
    assessmentApi.list().then(setPast).catch(() => setPast([]));
  }, [student?.id, session === null]);

  // Show the saved answer when the student goes back to a question.
  useEffect(() => {
    const a = question?.answer;
    setDraft(a && !a.skipped ? { selected: a.selected, other: a.other } : emptyDraft);
  }, [question?.id, session?.updatedAt]);

  const open = (s: AssessmentSession) => {
    const st = parseState(s.stateJson);
    setSession(s);
    setView(st ? (st.questions.findIndex((q) => q.answer === null) === -1 ? st.questions.length : st.questions.findIndex((q) => q.answer === null)) : 0);
  };

  const start = async (stage: AssessmentStage) => {
    const out = await run("start", (id) => assessmentApi.start(stage, id));
    if (out) open(out);
  };

  const resume = async (summary: AssessmentSummary) => {
    if (summary.status === "COMPLETED") { navigate({ to: "/assessment/$id", params: { id: String(summary.id) } }); return; }
    const out = await run("load", () => assessmentApi.get(summary.id));
    if (out) open(out);
  };

  const toggle = (q: AssessmentQuestion, label: string) => {
    setDraft((d) => {
      if (q.type === "single") return { ...d, selected: [label] };
      if (d.selected.includes(label)) return { ...d, selected: d.selected.filter((x) => x !== label) };
      const max = q.maxSelect ?? 3;
      const kept = d.selected.length >= max ? d.selected.slice(d.selected.length - max + 1) : d.selected;
      return { ...d, selected: [...kept, label] };
    });
  };

  const next = async () => {
    if (!session || !question) return;
    const a = question.answer;
    const unchanged = a !== null && !a.skipped && sameSet(a.selected, draft.selected) && a.other === draft.other.trim();
    if (unchanged) { setView(view + 1); return; }       // nothing changed -> no new request
    const out = await run("answer", (id) =>
      assessmentApi.answer(session.id, { questionId: question.id, selected: draft.selected, other: draft.other.trim(), skip: false }, id));
    if (out) { setSession(out); setView(view + 1); }
  };

  const skip = async () => {
    if (!session || !question) return;
    const out = await run("answer", (id) =>
      assessmentApi.answer(session.id, { questionId: question.id, selected: [], other: "", skip: true }, id));
    if (out) { setSession(out); setView(view + 1); }
  };

  const makeReport = async () => {
    if (!session) return;
    const out = await run("report", (id) => assessmentApi.report(session.id, id));
    if (out) navigate({ to: "/assessment/$id", params: { id: String(out.id) } });
  };

  const leave = () => { setSession(null); setView(0); setError(""); };
  const canNext = draft.selected.length > 0 || draft.other.trim().length > 0;
  const working = busy === "answer" ? status || "Thinking of your next question..." : busy === "report" ? status || "Writing your career report..." : "";

  /* ---------------- start screen ---------------- */
  if (!session || !state) {
    return (
      <div>
        <Panel>
          <div className="flex items-center gap-3"><Compass className="text-primary" /><h2 className="text-xl font-bold">Career discovery</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">
            Answer a few questions, one at a time. Each answer shapes the next question, and you can go back and change anything before the report.
          </p>
          <h3 className="mt-6 font-semibold">Where are you right now?</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {STAGE_CARDS.map((s) => (
              <button key={s.id} disabled={busy !== ""} onClick={() => start(s.id)}
                className="rounded-2xl border border-border bg-background/50 p-5 text-left transition-all hover:-translate-y-1 hover:border-primary disabled:opacity-60">
                <strong className="block">{STAGE_NAMES[s.id]}</strong>
                <span className="mt-1 block text-sm text-muted-foreground">{s.desc}</span>
              </button>
            ))}
          </div>
          {busy === "start" && <p className="mt-4 text-sm font-semibold text-primary" role="status">{status || "Preparing your first question..."}</p>}
          {error && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
        </Panel>

        {past.length > 0 && (
          <Panel className="mt-5">
            <h3 className="font-semibold">Your earlier assessments</h3>
            <div className="mt-3 space-y-2">
              {past.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
                  <div className="text-sm">
                    <strong>{STAGE_NAMES[p.stage] ?? p.stage}</strong>
                    <span className="ml-2 text-muted-foreground">{new Date(p.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-primary">
                      {p.status === "COMPLETED" ? "Report ready" : p.status === "READY" ? "Ready for report" : "In progress"}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" disabled={busy !== ""} onClick={() => resume(p)}>{p.status === "COMPLETED" ? "View report" : "Continue"}</Button>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    );
  }

  /* ---------------- review screen ---------------- */
  if (showReview) {
    return (
      <Panel>
        <div className="flex items-center gap-3"><ClipboardCheck className="text-primary" /><h2 className="text-xl font-bold">Review your answers</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">Everything look right? You can change any answer. Changing one may update the questions that follow it.</p>
        <div className="mt-5 space-y-3">
          {state.questions.map((q, i) => (
            <div key={q.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background/50 p-4">
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{i + 1}. {q.text}</p>
                <p className="mt-1 text-muted-foreground">
                  {q.answer?.skipped ? "Skipped" : [...(q.answer?.selected ?? []), ...(q.answer?.other ? [`Other: ${q.answer.other}`] : [])].join(", ")}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setView(i)} aria-label={`Edit answer ${i + 1}`}><Pencil className="size-4" />Edit</Button>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setView(total - 1)} disabled={busy !== ""}><ArrowLeft />Back</Button>
          <Button variant="warm" size="lg" onClick={makeReport} disabled={busy !== ""}>
            {busy === "report" ? <>{working}</> : <>Generate my career report <Sparkles /></>}
          </Button>
        </div>
        {busy === "report" && (
          <div className="mt-5 rounded-xl border border-primary/20 bg-secondary p-4 text-sm" role="status">
            This takes about half a minute. Your report will open by itself.
          </div>
        )}
        {error && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
      </Panel>
    );
  }

  /* ---------------- question screen ---------------- */
  if (!question) return null;
  const pct = Math.round((state.progress.coverage || 0) * 100);
  const maxPick = question.type === "multi" ? question.maxSelect ?? 3 : 1;

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">{STAGE_NAMES[state.stage]}</span>
        <button onClick={leave} className="text-xs font-semibold text-muted-foreground hover:text-primary">Save and exit</button>
      </div>

      <div className="mt-4" aria-label="Assessment progress">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Question {view + 1}</span>
          <span>Most people finish in {state.progress.minTotal} to {state.progress.maxTotal} questions</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <motion.div className="h-full rounded-full bg-gradient-brand" animate={{ width: `${Math.max(pct, 4)}%` }} transition={{ duration: 0.4 }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={question.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} className="mt-7">
          <h3 className="text-xl font-bold sm:text-2xl">{question.text}</h3>
          {question.why && <p className="mt-2 text-sm italic text-muted-foreground">Why we ask: {question.why}</p>}
          <p className="mt-3 text-xs font-semibold text-primary">{question.type === "multi" ? `Choose up to ${maxPick}` : "Choose one"}</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2" role={question.type === "multi" ? "group" : "radiogroup"}>
            {question.options.map((o) => {
              const on = draft.selected.includes(o.label);
              return (
                <button key={o.label} type="button" role={question.type === "multi" ? "checkbox" : "radio"} aria-checked={on}
                  onClick={() => toggle(question, o.label)} disabled={busy !== ""}
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-left text-sm font-medium transition-all hover:-translate-y-0.5 ${on ? "border-primary bg-secondary shadow-glow" : "border-border bg-background/60"}`}>
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center border ${question.type === "multi" ? "rounded-md" : "rounded-full"} ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    {on && <Check className="size-3.5" />}
                  </span>
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>

          {question.allowOther && (
            <input value={draft.other} onChange={(e) => setDraft((d) => ({ ...d, other: e.target.value.slice(0, 200) }))} disabled={busy !== ""}
              placeholder="Something else? Write it here (optional)" aria-label="Your own answer"
              className="mt-4 h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
          )}
        </motion.div>
      </AnimatePresence>

      {working && <p className="mt-5 text-sm font-semibold text-primary" role="status">{working}</p>}
      {error && <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={() => setView(Math.max(0, view - 1))} disabled={view === 0 || busy !== ""}><ArrowLeft />Back</Button>
        <div className="flex items-center gap-2">
          {question.skippable && <Button variant="ghost" onClick={skip} disabled={busy !== ""}>Skip</Button>}
          <Button variant="hero" onClick={next} disabled={!canNext || busy !== ""}>Next <ArrowRight /></Button>
        </div>
      </div>
    </Panel>
  );
}
