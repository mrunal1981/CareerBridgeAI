import json
import logging
import os
import time
import uuid
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from groq import Groq
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(request_id)s] %(message)s",
)


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


for _handler in logging.getLogger().handlers:
    _handler.addFilter(_RequestIdFilter())

log = logging.getLogger("agent")

app = FastAPI(title="CareerBridge Agent Service")

MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_TIMEOUT = float(os.getenv("GROQ_TIMEOUT", "60"))

MAX_INPUT_CHARS = 12000
MAX_CONTEXT_CHARS = 1500

_client: Optional[Groq] = None


def get_client() -> Groq:
    """Create the Groq client on first use so the service can start without a key."""
    global _client
    if _client is None:
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise HTTPException(status_code=503, detail="GROQ_API_KEY is not set")
        _client = Groq(api_key=key, timeout=GROQ_TIMEOUT, max_retries=1)
    return _client


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started = time.perf_counter()
    extra = {"request_id": request_id}
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error on %s %s", request.method, request.url.path, extra=extra)
        raise
    ms = int((time.perf_counter() - started) * 1000)
    log.info("%s %s -> %s in %sms", request.method, request.url.path, response.status_code, ms, extra=extra)
    response.headers["x-request-id"] = request_id
    return response


class ResumeRequest(BaseModel):
    resume_text: str = Field(min_length=20)


class CounselRequest(BaseModel):
    stage: Literal["BEFORE_10TH", "AFTER_10TH", "AFTER_12TH", "EXAM_PREP"]
    answers: Optional[str] = None
    context: Optional[str] = None


class ScholarshipRequest(BaseModel):
    education_level: str = Field(min_length=1)
    category: Optional[str] = None
    state: Optional[str] = None
    interests: Optional[str] = None
    context: Optional[str] = None


class JobMatchRequest(BaseModel):
    skills: str = Field(min_length=1)
    preferred_role: Optional[str] = None
    experience_level: Optional[str] = None
    context: Optional[str] = None


# ---------- helpers ----------

def clip(text: Optional[str]) -> str:
    """Keep inputs to a safe size."""
    return (text or "")[:MAX_INPUT_CHARS]


def with_context(user_prompt: str, context: Optional[str]) -> str:
    """Append what the other agents know, only when there is something to add."""
    ctx = (context or "").strip()[:MAX_CONTEXT_CHARS]
    if not ctx:
        return user_prompt
    return (
        f"{user_prompt}\n\n"
        "Background from this student's earlier results in other tools "
        "(use it only where it helps, do not repeat it back):\n"
        f"{ctx}"
    )


def ask_llm_json(system_prompt: str, user_prompt: str) -> dict:
    """Send a prompt to Groq and return the reply parsed as a JSON dict."""
    client = get_client()
    try:
        chat = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        parsed = json.loads(chat.choices[0].message.content)
        if not isinstance(parsed, dict):
            raise ValueError("LLM did not return a JSON object")
        return parsed
    except HTTPException:
        raise
    except Exception as e:
        log.error("LLM json call failed: %s", e)
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


def ask_llm_text(system_prompt: str, user_prompt: str) -> str:
    """Send a prompt to Groq and return the reply as plain text."""
    client = get_client()
    try:
        chat = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
        )
        text = (chat.choices[0].message.content or "").strip()
        if not text:
            raise ValueError("empty reply")
        return text
    except HTTPException:
        raise
    except Exception as e:
        log.error("LLM text call failed: %s", e)
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


def to_str_list(value) -> list:
    """Turn whatever the LLM returned into a clean list of strings."""
    if not isinstance(value, list):
        return []
    return [str(x).strip() for x in value if str(x).strip()]


# ---------- Health ----------

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "llm_configured": bool(os.getenv("GROQ_API_KEY"))}


# ---------- Resume Evaluator ----------

def clean_analysis(data: dict) -> dict:
    """Keep only the extra resume-analysis fields, in a safe shape (camelCase for the frontend)."""
    summary = data.get("summary")
    return {
        "summary": summary.strip()[:600] if isinstance(summary, str) else "",
        "strengths": to_str_list(data.get("strengths"))[:6],
        "weaknesses": to_str_list(data.get("weaknesses"))[:6],
        "skillsFound": to_str_list(data.get("skills_found"))[:15],
        "skillsToAdd": to_str_list(data.get("skills_to_add"))[:8],
        "suitableRoles": to_str_list(data.get("suitable_roles"))[:5],
    }


@app.post("/evaluate-resume")
def evaluate_resume(req: ResumeRequest):
    system_prompt = (
        "You are an expert ATS resume evaluator for students and freshers. "
        "Reply ONLY with a JSON object in exactly this shape: "
        '{"ats_score": <integer 0-100>, '
        '"missing_sections": [<strings>], '
        '"suggestions": [<strings>], '
        '"summary": <string>, '
        '"strengths": [<strings>], '
        '"weaknesses": [<strings>], '
        '"skills_found": [<strings>], '
        '"skills_to_add": [<strings>], '
        '"suitable_roles": [<strings>]}. '
        "missing_sections lists standard resume sections that are absent. "
        "suggestions gives 3 to 6 short, specific improvements. "
        "summary is 2 to 3 sentences describing the candidate and the overall quality of the resume. "
        "strengths gives 3 to 5 real strengths visible in the resume. "
        "weaknesses gives 3 to 5 specific problems (vague bullets, no metrics, formatting, gaps). "
        "skills_found lists the technical and soft skills that actually appear in the resume. "
        "skills_to_add lists up to 6 skills that would strengthen it for the roles it targets. "
        "suitable_roles gives 3 to 5 job roles this resume is best suited for. "
        "Only use facts that are in the resume. Do not invent experience, employers or skills."
    )
    data = ask_llm_json(system_prompt, f"Evaluate this resume:\n\n{clip(req.resume_text)}")

    try:
        score = max(0, min(100, int(data.get("ats_score", 0))))
    except (TypeError, ValueError):
        score = 0

    return {
        "ats_score": score,
        "missing_sections": to_str_list(data.get("missing_sections")),
        "suggestions": to_str_list(data.get("suggestions")),
        # sent as a JSON string so the Spring Boot backend can store it in one TEXT column
        "analysis_json": json.dumps(clean_analysis(data)),
    }


# ---------- Career Counselor ----------

COUNSEL_BASE = (
    "You are a friendly, honest career counsellor for students in India. "
    "Use simple English. Be specific and personal: tie every recommendation to something "
    "the student actually answered (their subjects, marks, interests, strengths, goals, "
    "constraints). Never give generic advice that would fit any student, and do not repeat "
    "all their answers back. Do not invent exact cutoffs, fees, salaries or exam dates; "
    "if a detail can change, tell the student to check the official website. "
    "If the answers are thin or contradict each other, say so briefly and give the best "
    "guidance you can. "
    "FORMAT RULES: write the answer as sections, each starting with a line '## Section title' "
    "(exactly two # characters). Under each heading use short sentences or lines starting "
    "with '- '. No other markdown, no bold, no tables. Keep the whole answer under 450 words. "
)

STAGE_PROMPTS = {
    "BEFORE_10TH": (
        "The student is before class 10 and answered questions about subjects, free-time "
        "activities, how they learn and what matters to them. Use exactly these sections: "
        "'## Your profile' (2 to 3 lines on their strengths and interests), "
        "'## Best-fit paths after class 10' (2 or 3 options from Science, Commerce, Arts, "
        "Diploma/Polytechnic, ITI, each with one line on why it fits THIS student), "
        "'## Subjects to focus on now', '## Watch out for' (one honest concern, for example "
        "a subject they find hard), '## Your next 3 steps'."
    ),
    "AFTER_10TH": (
        "The student has finished class 10. Use exactly these sections: "
        "'## Your profile' (marks, strengths, interests in 2 to 3 lines), "
        "'## Best-fit paths' (rank 2 or 3 options from Science, Commerce, Arts, "
        "Diploma/Polytechnic, ITI/vocational and say why each fits; respect their stated "
        "preference but challenge it politely if the answers point elsewhere), "
        "'## What each path leads to' (careers and later courses), "
        "'## Practical things to consider' (earning early, studying away from home, any "
        "worries they mentioned), '## Your next 3 steps'."
    ),
    "AFTER_12TH": (
        "The student has finished class 12. Use exactly these sections: "
        "'## Your profile' (stream, marks, strengths and experience in 2 to 3 lines), "
        "'## Top 3 career paths' (each: the path, why it fits THIS student, the degree or "
        "course to take, and the entrance exams to check), "
        "'## Skills to build' (based on their weaknesses and the industries they chose), "
        "'## Backup option', '## Your next 3 steps' (concrete things to do this month)."
    ),
    "EXAM_PREP": (
        "The student is preparing for a competitive exam. Use exactly these sections: "
        "'## Where you stand' (honest reading of attempt, time left, study hours and mock "
        "score), '## Priorities' (what to study first, using their weak and strong topics), "
        "'## Weekly routine' (a simple realistic plan that fits their study hours), "
        "'## Fix your biggest challenge' (address what they said is hardest), "
        "'## Backup plan', '## Your next 3 steps'."
    ),
}


@app.post("/counsel")
def counsel(req: CounselRequest):
    stage_prompt = STAGE_PROMPTS.get(req.stage)
    if stage_prompt is None:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {req.stage}")

    user_prompt = with_context(f"Student details and answers:\n{clip(req.answers)}", req.context)
    recommendation = ask_llm_text(COUNSEL_BASE + stage_prompt, user_prompt)
    return {"recommendation": recommendation}


# ---------- Scholarship & Resource Finder ----------

@app.post("/find-scholarships")
def find_scholarships(req: ScholarshipRequest):
    system_prompt = (
        "You help Indian students find scholarships and study resources. "
        "Reply ONLY with a JSON object in exactly this shape: "
        '{"scholarships": [<strings>]}. '
        "Give 5 to 7 items. Each item is ONE string in the form: "
        '"Name - who it is for - where to apply". '
        "Only list well-known, real schemes and portals (for example the National "
        "Scholarship Portal, central and state government schemes, AICTE schemes, "
        "and large trusts) that match the student's details. "
        "Do NOT invent scholarship names, amounts, or deadlines. If you are not "
        "sure about an amount or date, leave it out. "
        "The last item must remind the student to verify eligibility and "
        "deadlines on the official website."
    )
    user_prompt = (
        f"Education level: {req.education_level}\n"
        f"Category: {req.category or 'not given'}\n"
        f"State: {req.state or 'not given'}\n"
        f"Interests: {clip(req.interests) or 'not given'}"
    )
    data = ask_llm_json(system_prompt, with_context(user_prompt, req.context))
    items = to_str_list(data.get("scholarships"))
    if not items:
        raise HTTPException(status_code=502, detail="LLM returned no scholarships")
    return {"scholarships": items}


# ---------- Job Matcher ----------

@app.post("/match-jobs")
def match_jobs(req: JobMatchRequest):
    system_prompt = (
        "You are a career advisor who matches students and freshers to job roles. "
        "Reply ONLY with a JSON object in exactly this shape: "
        '{"matches": [<strings>]}. '
        "Give 5 items, best match first. Each item is ONE string in the form: "
        '"Role (match NN%) - why it fits - skills to learn next". '
        "These are role suggestions, not live job listings. Do not invent "
        "company names or salaries."
    )
    user_prompt = (
        f"Skills: {clip(req.skills)}\n"
        f"Preferred role: {req.preferred_role or 'not given'}\n"
        f"Experience level: {req.experience_level or 'not given'}"
    )
    data = ask_llm_json(system_prompt, with_context(user_prompt, req.context))
    items = to_str_list(data.get("matches"))
    if not items:
        raise HTTPException(status_code=502, detail="LLM returned no matches")
    return {"matches": items}
# ======================================================================
# Adaptive Career Assessment (see assessment_engine.py and careers.py)
# ======================================================================
import assessment_engine as engine 
from typing import List


class AssessmentStartRequest(BaseModel):
    stage: Literal["BEFORE_10TH", "AFTER_10TH", "AFTER_12TH", "UNDERGRAD"]


class AssessmentAnswerRequest(BaseModel):
    state: str
    question_id: str = Field(min_length=1, max_length=40)
    selected: List[str] = Field(default_factory=list, max_length=8)
    other: Optional[str] = None
    skip: bool = False


class AssessmentReportRequest(BaseModel):
    state: str
    context: Optional[str] = None


@app.post("/assessment/start")
def assessment_start(req: AssessmentStartRequest):
    try:
        state = engine.start_assessment(req.stage, ask_llm_json)
    except engine.AssessmentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"state_json": engine.dump_state(state), "status": state["status"]}


@app.post("/assessment/answer")
def assessment_answer(req: AssessmentAnswerRequest):
    try:
        state = engine.load_state(req.state)
        state = engine.apply_answer(state, req.question_id, req.selected, req.other, req.skip, ask_llm_json)
    except engine.AssessmentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"state_json": engine.dump_state(state), "status": state["status"]}


@app.post("/assessment/report")
def assessment_report(req: AssessmentReportRequest):
    try:
        state = engine.load_state(req.state)
        report = engine.build_report(state, ask_llm_json, (req.context or "").strip()[:MAX_CONTEXT_CHARS])
    except engine.AssessmentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"report_json": json.dumps(report, ensure_ascii=False)}