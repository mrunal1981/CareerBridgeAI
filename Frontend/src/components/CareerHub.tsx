import { useState } from "react";
import { Compass } from "lucide-react";
import { CareerAgent } from "@/components/AgentScreens";
import { CareerAssessment } from "@/components/CareerAssessment";

// The Career Counselor tab: the new adaptive assessment, plus the classic form for exam preparation.
export function CareerHub() {
  const [tab, setTab] = useState<"discovery" | "exam">("discovery");
  const pill = (on: boolean) => `rounded-full px-4 py-2 text-sm font-semibold transition-all ${on ? "bg-primary text-primary-foreground shadow-glow" : "border border-border bg-background/60 text-muted-foreground hover:text-foreground"}`;
  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-primary">Agent 02</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Career &amp; Exam Counselor</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Discover careers that fit your interests, skills and goals, or get a plan for your exam.</p>
        </div>
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary"><Compass /></div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist">
        <button role="tab" aria-selected={tab === "discovery"} className={pill(tab === "discovery")} onClick={() => setTab("discovery")}>Career discovery</button>
        <button role="tab" aria-selected={tab === "exam"} className={pill(tab === "exam")} onClick={() => setTab("exam")}>Exam preparation plan</button>
      </div>
      {tab === "discovery" ? <CareerAssessment /> : <CareerAgent />}
    </>
  );
}
