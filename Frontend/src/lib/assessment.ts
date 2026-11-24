// Types and parsers for the adaptive Career Assessment.
// The backend stores the state and the report as JSON text; these helpers read them safely.

export type AssessmentStage = "BEFORE_10TH" | "AFTER_10TH" | "AFTER_12TH" | "UNDERGRAD";

export type AssessmentOption = { label: string; signals?: Record<string, number>; tags?: string[] };

export type AssessmentAnswer = { selected: string[]; other: string; skipped: boolean };

export type AssessmentQuestion = {
  id: string;
  category: string;
  text: string;
  why: string;
  type: "single" | "multi";
  maxSelect: number | null;
  options: AssessmentOption[];
  allowOther: boolean;
  skippable: boolean;
  seed: boolean;
  answer: AssessmentAnswer | null;
};

export type AssessmentState = {
  stage: AssessmentStage;
  status: "in_progress" | "ready";
  questions: AssessmentQuestion[];
  progress: { answered: number; minTotal: number; maxTotal: number; coverage: number };
};

export type AssessmentSummary = {
  id: number;
  stage: AssessmentStage;
  status: "IN_PROGRESS" | "READY" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
};

export type AssessmentSession = AssessmentSummary & { stateJson: string; reportJson: string | null };

export type ReportCareer = {
  name: string;
  domain: string;
  score: number;
  breakdown: { key: string; label: string; need: number; level: number }[];
  why: string;
  requiredSkills: string[];
  education: string;
  entranceExams: string[];
  opportunities: string[];
  advantages: string[];
  challenges: string[];
  startRoadmap: string[];
};

export type CareerReport = {
  generatedAt: string;
  stage: AssessmentStage;
  answeredCount: number;
  dimensions: { key: string; label: string; group: "interest" | "skill" | "style"; percent: number }[];
  profile: { education: string; interests: string[]; skills: string[]; strengths: string[]; preferences: string[]; goals: string[] };
  interestAnalysis: string;
  careers: ReportCareer[];
  alternativeCareers: { name: string; domain: string; score: number; reason: string }[];
  skillGap: { strengths: string[]; toImprove: string[]; technical: string[]; soft: string[]; learning: string[] };
  roadmap: { immediate: string[]; next3Months: string[]; next6Months: string[]; next12Months: string[]; longTerm: string[] };
  resources: { courses: string[]; certifications: string[]; books: string[]; projects: string[]; platforms: string[]; practice: string[] };
  educationGuidance: { pathways: string[]; entranceExams: string[]; notes: string };
  scoring: { method: string; disclaimer: string };
  aiParts: { careers: boolean; overview: boolean };
};

export const STAGE_NAMES: Record<AssessmentStage, string> = {
  BEFORE_10TH: "Before 10th",
  AFTER_10TH: "After 10th",
  AFTER_12TH: "After 12th",
  UNDERGRAD: "College / graduate",
};

export function parseState(json: string | null | undefined): AssessmentState | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as Partial<AssessmentState>;
    if (!s || !Array.isArray(s.questions) || !s.stage) return null;
    return {
      stage: s.stage,
      status: s.status === "ready" ? "ready" : "in_progress",
      questions: s.questions,
      progress: s.progress ?? { answered: 0, minTotal: 10, maxTotal: 18, coverage: 0 },
    };
  } catch { return null; }
}

export function parseReport(json: string | null | undefined): CareerReport | null {
  if (!json) return null;
  try {
    const r = JSON.parse(json) as Partial<CareerReport>;
    return r && Array.isArray(r.careers) && r.scoring ? (r as CareerReport) : null;
  } catch { return null; }
}
