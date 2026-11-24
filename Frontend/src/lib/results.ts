import { useEffect, useState } from "react";
import {
  api, type CounselingSession, type DashboardData, type JobMatch, type ResumeResult, type ScholarshipSearch,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Shared by the agent screens (which save a fresh result) and the results pages (which show it).

export type ResultKind = "resume" | "career" | "scholarship" | "jobs";
export type ResultMap = {
  resume: ResumeResult;
  career: CounselingSession;
  scholarship: ScholarshipSearch;
  jobs: JobMatch;
};

export const isResultKind = (v: string): v is ResultKind =>
  v === "resume" || v === "career" || v === "scholarship" || v === "jobs";

const cacheKey = (kind: ResultKind, id: number) => `careerbridge.result.${kind}.${id}`;

// Called right after an agent finishes, so the results page opens instantly
// (and without asking the backend again) and survives a normal page refresh.
export function cacheResult<K extends ResultKind>(kind: K, item: ResultMap[K]): void {
  try { sessionStorage.setItem(cacheKey(kind, item.id), JSON.stringify(item)); } catch { /* storage blocked */ }
}

function readCache<K extends ResultKind>(kind: K, id: number): ResultMap[K] | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(kind, id));
    return raw ? (JSON.parse(raw) as ResultMap[K]) : null;
  } catch { return null; }
}

function pick<K extends ResultKind>(kind: K, d: DashboardData): ResultMap[K][] {
  const lists = { resume: d.resumes, career: d.counselingSessions, scholarship: d.scholarshipSearches, jobs: d.jobMatches };
  return lists[kind] as ResultMap[K][];
}

export type ResultState<T> =
  | { status: "loading" }
  | { status: "login" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

// 1) use the saved copy from this browser tab, 2) otherwise load it from the backend
// (the result is already stored in the database, so no new AI request is made).
export function useSavedResult<K extends ResultKind>(kind: K, id: number): ResultState<ResultMap[K]> {
  const { student, ready } = useAuth();
  const [state, setState] = useState<ResultState<ResultMap[K]>>({ status: "loading" });

  useEffect(() => {
    if (!ready) return;
    if (!student) { setState({ status: "login" }); return; }
    if (!Number.isInteger(id)) { setState({ status: "missing" }); return; }

    const cached = readCache(kind, id);
    if (cached && cached.studentId === student.id) { setState({ status: "ready", data: cached }); return; }

    let alive = true;
    setState({ status: "loading" });
    api.dashboard(student.id)
      .then((d) => {
        if (!alive) return;
        const found = pick(kind, d).find((x) => x.id === id);
        if (found) { cacheResult(kind, found); setState({ status: "ready", data: found }); }
        else setState({ status: "missing" });
      })
      .catch((e) => { if (alive) setState({ status: "error", message: e instanceof Error ? e.message : "Could not load this result." }); });
    return () => { alive = false; };
  }, [ready, student?.id, kind, id]);

  return state;
}