"""Adaptive career assessment engine (pure Python, no web framework).

Flow
  start_assessment()  -> state with the first question
  apply_answer()      -> saves an answer (or skip), then adds the next question or marks the
                         assessment "ready"
  build_report()      -> scores careers with code, asks the AI only to explain them

The AI is only used to (1) word the next question and (2) explain the report. What gets
asked, when to stop, how options are scored and the ranking are all decided here.
The AI call is injected (ask_json) so everything can be tested without a network.
"""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Callable, Optional

from careers import CAREERS, DIMENSIONS

STAGES = ("BEFORE_10TH", "AFTER_10TH", "AFTER_12TH", "UNDERGRAD")
STAGE_TEXT = {
    "BEFORE_10TH": "a student who is studying before class 10",
    "AFTER_10TH": "a student who has finished class 10",
    "AFTER_12TH": "a student who has finished class 12",
    "UNDERGRAD": "a college student or recent graduate",
}

MIN_QUESTIONS = 10      # never finish before this many questions
MAX_QUESTIONS = 18      # always finish by this many
SIGNAL_CAP = 4.0        # signal points that count as "fully" showing a trait
MAX_STATE_CHARS = 250_000

# Order in which the AI-worded questions are asked (category per slot).
PLAN = ["interests", "interests", "skills", "work_style", "interests", "skills",
        "career_prefs", "work_style", "career_prefs", "goals"]
QUOTA = {c: PLAN.count(c) for c in set(PLAN)}

CATEGORY_GUIDE = {
    "interests": (
        "Explore what the student enjoys. Look at their earlier answers and go one level deeper. "
        "Examples: maths or coding -> ask whether they prefer solving maths problems, building software, "
        "analysing data or how computers work, or AI / cybersecurity / robotics; business or communication -> "
        "marketing, entrepreneurship, management, finance, sales or HR; biology or helping people -> "
        "healthcare, medicine, biotechnology, psychology or allied health. If nothing is clear yet, "
        "ask about broad activities they enjoy."),
    "skills": (
        "Ask which strengths the student sees in themselves (logical reasoning, mathematics, communication, "
        "creativity, leadership, problem solving, technical skills, analytical thinking, practical skills, teamwork). "
        "These are self-reported, so word it as 'which describes you' and not as a test."),
    "work_style": (
        "Ask about working style without labelling the student: independent or team work, structured or flexible "
        "environments, practical or theoretical work, risk taking, working under pressure, how they like to learn."),
    "career_prefs": (
        "Ask about career preferences: preferred industries, private or government work, own business, research "
        "or practical work, further studies, remote or on-site work, location."),
    "goals": (
        "Ask about future goals: long-term ambitions, income expectations, the lifestyle they want, willingness to "
        "study more or relocate, and what matters most to them."),
    "clarify": (
        "The profile is still unclear between several careers. Ask ONE question that separates the student's top "
        "domains from each other (for example 'which of these would you enjoy more as daily work')."),
}


class AssessmentError(ValueError):
    """The request or the stored state is not valid (maps to HTTP 400)."""


# ---------------------------------------------------------------------------
# Built-in questions: the opening academic questions and the offline fallbacks
# ---------------------------------------------------------------------------

def _o(label, tags=None, **signals):
    for k in signals:
        assert k in DIMENSIONS, k
    opt = {"label": label, "signals": dict(signals)}
    if tags:
        opt["tags"] = list(tags)
    return opt


SUBJECTS = [
    _o("Maths", s_math=2, s_logic=1),
    _o("Science", science=2, s_analytical=1),
    _o("Biology", healthcare=2, science=1),
    _o("Computer / IT", technology=2, s_logic=1),
    _o("English / Languages", communication=2, s_comm=1),
    _o("Social Studies / History", social=1, government=1, communication=1),
    _o("Commerce / Accounts", business=1, finance=2),
    _o("Art / Drawing", arts=2, design=1, s_creative=1),
]
SUBJECTS_SCHOOL = [o for o in SUBJECTS if o["label"] not in ("Biology", "Commerce / Accounts")]
MARKS_BANDS = [_o("Above 90%"), _o("75% to 90%"), _o("60% to 75%"), _o("Below 60%"), _o("Prefer not to say")]


def _seed(qid, text, why, options, qtype="single", max_select=None):
    return {"id": qid, "category": "academic", "text": text, "why": why, "type": qtype,
            "maxSelect": max_select, "options": options, "allowOther": False, "skippable": False,
            "seed": True, "answer": None}


def _seeds(stage, answered):
    """Opening questions about education, in order. `answered` maps question id -> selected labels."""
    s = {
        "BEFORE_10TH": [
            ("seed_like", lambda: _seed("seed_like", "Which subjects do you enjoy the most? (pick up to 2)",
                                        "Your favourite subjects are a good first hint about your interests.",
                                        SUBJECTS_SCHOOL, "multi", 2)),
            ("seed_hard", lambda: _seed("seed_hard", "Which subject feels the hardest right now?",
                                        "This helps us understand where you may need support.",
                                        [_o(o["label"]) for o in SUBJECTS_SCHOOL] + [_o("None in particular")])),
            ("seed_marks", lambda: _seed("seed_marks", "How are your marks usually?",
                                         "Marks do not decide your future, but they help us suggest realistic paths.",
                                         MARKS_BANDS)),
        ],
        "AFTER_10TH": [
            ("seed_marks", lambda: _seed("seed_marks", "What were your class 10 marks?",
                                         "Marks help us suggest realistic paths.", MARKS_BANDS)),
            ("seed_strong", lambda: _seed("seed_strong", "Which subjects are you strongest in? (pick up to 2)",
                                          "Strong subjects point to streams and courses that suit you.",
                                          SUBJECTS, "multi", 2)),
            ("seed_lean", lambda: _seed("seed_lean", "Which path are you leaning towards right now?",
                                        "We will compare this with what your answers suggest.",
                                        [_o("Science (11th-12th)"), _o("Commerce (11th-12th)"),
                                         _o("Arts / Humanities (11th-12th)"), _o("Diploma / Polytechnic"),
                                         _o("ITI / vocational"), _o("Not sure yet")])),
        ],
        "AFTER_12TH": [
            ("seed_stream", lambda: _seed("seed_stream", "Which stream did you study in class 12?",
                                          "Your stream decides which courses are open to you.",
                                          [_o("Science", ["pcm", "pcb"]), _o("Commerce", ["commerce"]),
                                           _o("Arts / Humanities", ["arts"])])),
            ("seed_group", lambda: _seed("seed_group", "Which subject group did you study?",
                                         "Science groups open different degrees.",
                                         [_o("PCM (Physics, Chemistry, Maths)", ["pcm"]),
                                          _o("PCB (Physics, Chemistry, Biology)", ["pcb"]),
                                          _o("PCMB (all four)", ["pcm", "pcb"]),
                                          _o("Other", ["pcm", "pcb"])])),
            ("seed_marks", lambda: _seed("seed_marks", "What were your class 12 marks?",
                                         "Marks help us suggest realistic paths.", MARKS_BANDS)),
            ("seed_strong", lambda: _seed("seed_strong", "Which subjects are you strongest in? (pick up to 3)",
                                          "Strong subjects point to degrees that suit you.", SUBJECTS, "multi", 3)),
        ],
        "UNDERGRAD": [
            ("seed_degree", lambda: _seed("seed_degree", "What are you studying (or have you studied)?",
                                          "Your degree is the base for your next career steps.",
                                          [_o("Engineering / Technology", ["pcm"], engineering=1),
                                           _o("Computer Applications / IT", ["pcm"], technology=1),
                                           _o("Commerce / Business", ["commerce"], business=1),
                                           _o("Arts / Humanities", ["arts"], communication=1),
                                           _o("Science", ["pcm", "pcb"], science=1),
                                           _o("Medical / Health Sciences", ["pcb"], healthcare=1),
                                           _o("Law", None, law=1), _o("Other")])),
            ("seed_year", lambda: _seed("seed_year", "Which year are you in?",
                                        "The next steps are different for each year.",
                                        [_o("1st year"), _o("2nd year"), _o("3rd year"), _o("Final year"),
                                         _o("Already graduated")])),
            ("seed_plan", lambda: _seed("seed_plan", "What is your current plan after your degree?",
                                        "We will check whether your answers support this plan.",
                                        [_o("Get a job soon"), _o("Higher studies", research=1, w_theory=1),
                                         _o("Government exams", government=2),
                                         _o("Start my own business", entrepreneurship=2, w_risk=1),
                                         _o("Not sure yet")])),
        ],
    }[stage]
    for qid, build in s:
        if qid == "seed_group" and "Science" not in answered.get("seed_stream", []):
            continue                      # only Science students are asked for a subject group
        if qid not in answered:
            return build()
    return None


_FALLBACKS = [
    ("interests", "Which kinds of activities do you enjoy the most? (pick up to 3)", "Activities you enjoy point to careers you may enjoy.", "multi", 3, [
        _o("Building apps, websites or gadgets", technology=3, s_technical=1),
        _o("Understanding how machines and structures work", engineering=3, s_practical=1),
        _o("Helping people stay healthy", healthcare=3, social=1),
        _o("Running or growing a business", business=2, entrepreneurship=2),
        _o("Experiments and finding out how nature works", science=3, research=1),
        _o("Designing, drawing or creating media", design=2, arts=2, s_creative=1),
        _o("Teaching, advising or supporting people", education=2, social=2),
        _o("Debating, writing or public service", law=1, government=1, communication=2)]),
    ("interests", "Which kind of problem would you most like to solve? (pick up to 2)", "The problems you like to solve show your strengths.", "multi", 2, [
        _o("Making a system faster or more secure", technology=2, s_problem=2),
        _o("Finding patterns in numbers and data", s_analytical=3, s_math=1, finance=1),
        _o("Designing something people love to use", design=3, s_creative=1),
        _o("Improving someone's health or well-being", healthcare=2, social=2),
        _o("Fixing problems in society or the environment", social=2, agriculture=1, government=1),
        _o("Growing a company or earning money smartly", business=2, finance=2)]),
    ("interests", "What would you happily learn about on your own? (pick up to 3)", "What you learn without being asked says a lot.", "multi", 3, [
        _o("Programming and how computers work", technology=3, s_logic=1),
        _o("The human body, medicine or psychology", healthcare=2, science=1, social=1),
        _o("Money, markets and investing", finance=3),
        _o("Art, films, music or storytelling", arts=3, s_creative=1),
        _o("Space, physics, chemistry or biology", science=3, research=1),
        _o("Law, politics and current affairs", law=1, government=2, communication=1),
        _o("Starting projects and startups", entrepreneurship=3, business=1)]),
    ("skills", "Which of these describe your strengths best? (pick up to 3)", "This is how you see yourself, not a test.", "multi", 3, [
        _o("I enjoy puzzles and logical thinking", s_logic=3), _o("I am good with numbers", s_math=3),
        _o("I notice patterns and analyse information", s_analytical=3),
        _o("I come up with creative ideas", s_creative=3), _o("I explain ideas clearly", s_comm=3),
        _o("I like taking charge of a group", s_lead=3)]),
    ("skills", "Which of these do people say you are good at? (pick up to 3)", "Other people often notice strengths we miss.", "multi", 3, [
        _o("Fixing or building things", s_practical=3, s_technical=1), _o("Working well in a team", s_team=3),
        _o("Staying calm when problems appear", s_problem=2, w_pressure=1),
        _o("Learning new tools and technology quickly", s_technical=3),
        _o("Keeping things organised", w_structured=2, management=1),
        _o("Convincing and motivating others", s_comm=2, s_lead=2)]),
    ("work_style", "Which way of working suits you best?", "There is no right answer, this only shapes which careers fit.", "single", None, [
        _o("Mostly alone, with deep focus", w_independent=3), _o("In a team, sharing ideas", w_collab=3),
        _o("Leading and organising others", s_lead=2, w_collab=1, management=1),
        _o("Hands-on, away from a desk", w_hands_on=3), _o("A mix, depending on the task")]),
    ("work_style", "What kind of work environment do you prefer?", "Work environments differ a lot between careers.", "single", None, [
        _o("Clear rules, routines and deadlines", w_structured=3), _o("Flexible and changing every day", w_flexible=3),
        _o("Fast-paced and high pressure", w_pressure=3), _o("Ideas and theory over practical work", w_theory=3),
        _o("Practical work over theory", w_hands_on=2, s_practical=1)]),
    ("career_prefs", "What type of path attracts you most?", "Careers differ in how stable, creative or independent they are.", "single", None, [
        _o("A private-sector job"), _o("A government job", government=2),
        _o("My own business", entrepreneurship=3, w_risk=1), _o("Research or academics", research=2, w_theory=1),
        _o("Creative or freelance work", arts=1, w_flexible=2), _o("Not sure yet")]),
    ("career_prefs", "How do you feel about studying for many more years?", "Some careers need long studies, others do not.", "single", None, [
        _o("Happy to study for many more years", research=1, w_theory=1), _o("One more degree is fine"),
        _o("I want to start working soon", w_hands_on=1), _o("Open to anything that leads to a good career")]),
    ("goals", "What matters most to you in a career? (pick up to 2)", "Your priorities help us rank the options.", "multi", 2, [
        _o("High income", finance=1, business=1), _o("Job security", government=1, w_structured=1),
        _o("Creative freedom", arts=1, design=1, w_flexible=1), _o("Helping society", social=2),
        _o("Building something of my own", entrepreneurship=2), _o("Learning and research", research=2),
        _o("Recognition and leadership", s_lead=2, management=1)]),
    ("clarify", "Which of these sounds closest to your ideal day at work? (pick up to 2)", "This helps us separate careers that still look similar for you.", "multi", 2, [
        _o("Writing code or solving technical problems", technology=2, s_technical=1),
        _o("Meeting people and building relationships", s_comm=2, business=1),
        _o("Analysing data and numbers", s_analytical=2, finance=1),
        _o("Creating or designing something new", s_creative=2, design=1),
        _o("Caring for or teaching others", social=1, education=1, healthcare=1),
        _o("Planning and managing projects", management=2, s_lead=1)]),
]


def _fallback(category, asked_ids, used_texts=()):
    for i, (cat, text, why, qtype, mx, opts) in enumerate(_FALLBACKS):
        fid = f"fb_{cat}_{i}"
        if cat == category and fid not in asked_ids and not is_duplicate(text, used_texts):
            return {"id": fid, "category": cat, "text": text, "why": why, "type": qtype, "maxSelect": mx,
                    "options": opts, "allowOther": True, "skippable": True, "seed": False, "answer": None}
    return None


# ---------------------------------------------------------------------------
# Validation of what the AI returns
# ---------------------------------------------------------------------------

def _norm(text):
    return re.sub(r"[^a-z0-9 ]+", " ", str(text).lower()).split()


def is_duplicate(text, used_texts):
    a = set(_norm(text))
    if not a:
        return True
    for u in used_texts:
        b = set(_norm(u))
        if b and len(a & b) / len(a | b) >= 0.75:
            return True
    return False


def clean_question(raw, category, used_texts):
    """Turn the AI's question into a safe, scoreable question or raise ValueError."""
    if not isinstance(raw, dict):
        raise ValueError("question is not an object")
    text = str(raw.get("text", "")).strip()
    if not 12 <= len(text) <= 240:
        raise ValueError("question text has a bad length")
    if is_duplicate(text, used_texts):
        raise ValueError("question repeats an earlier one")
    qtype = raw.get("type") if raw.get("type") in ("single", "multi") else "single"
    opts_raw = raw.get("options")
    if not isinstance(opts_raw, list):
        raise ValueError("options missing")
    options, seen = [], set()
    for o in opts_raw:
        if not isinstance(o, dict):
            continue
        label = str(o.get("label", "")).strip()
        if not label or len(label) > 90 or label.lower() in seen:
            continue
        seen.add(label.lower())
        signals = {}
        sig_raw = o.get("signals")
        if isinstance(sig_raw, dict):
            for k, v in sig_raw.items():
                try:
                    w = max(0, min(3, int(v)))
                except (TypeError, ValueError):
                    continue
                if k in DIMENSIONS and w > 0:
                    signals[k] = w
        top = dict(sorted(signals.items(), key=lambda kv: -kv[1])[:4])
        options.append({"label": label, "signals": top})
    options = options[:8]
    if not 3 <= len(options) <= 8:
        raise ValueError("need 3 to 8 usable options")
    if sum(1 for o in options if o["signals"]) < 2:
        raise ValueError("options carry too few scoring signals")
    max_select = None
    if qtype == "multi":
        try:
            max_select = max(2, min(4, int(raw.get("maxSelect", 3))))
        except (TypeError, ValueError):
            max_select = 3
        max_select = min(max_select, len(options))
    return {"id": "", "category": category, "text": text, "why": str(raw.get("why", "")).strip()[:200],
            "type": qtype, "maxSelect": max_select, "options": options,
            "allowOther": bool(raw.get("allowOther", True)), "skippable": bool(raw.get("skippable", True)),
            "seed": False, "answer": None}


def _dimension_help():
    return "\n".join(f"  {k}: {label}" for k, (label, _g) in DIMENSIONS.items())


def _qa_lines(state, limit=6000):
    lines = []
    for q in state["questions"]:
        a = q.get("answer")
        if not a:
            continue
        if a.get("skipped"):
            lines.append(f"Q: {q['text']}\nA: (skipped)")
            continue
        parts = list(a.get("selected", []))
        if a.get("other"):
            parts.append(f"other: {a['other']}")
        lines.append(f"Q: {q['text']}\nA: {'; '.join(parts)}")
    return "\n".join(lines)[:limit]


def _question_prompts(state, category):
    stage = STAGE_TEXT[state["stage"]]
    system = (
        "You are an experienced, friendly career counsellor in India talking to a student. "
        "Write ONE new question for an adaptive career assessment. Reply ONLY with JSON in this shape: "
        '{"text": str, "why": str, "type": "single" or "multi", "maxSelect": int (multi only, 2 to 4), '
        '"allowOther": bool, "skippable": bool, '
        '"options": [{"label": str, "signals": {dimension: 1 to 3}}]}. '
        "Rules: 4 to 7 options that are clearly different from each other; each option's signals use ONLY "
        "the dimension keys listed below (1 to 3 keys, weight 1 to 3) and say which interests, skills or "
        "working styles choosing it reflects; an option such as 'Not sure' may have empty signals. "
        "For a multi question say 'pick up to N' in the text. 'why' is one short friendly sentence on why you "
        "ask. Use simple English suitable for the student's level. Never ask for names, contact details or "
        "other personal information. Never repeat or reword an earlier question.\n"
        f"Dimension keys:\n{_dimension_help()}"
    )
    user = (
        f"The student is {stage}.\nTopic for this question: {category}. {CATEGORY_GUIDE[category]}\n\n"
        f"Questions asked so far and the answers:\n{_qa_lines(state) or '(none yet)'}\n\n"
        "Write the next question now."
    )
    return system, user


# ---------------------------------------------------------------------------
# Profile and scoring (plain code, no AI)
# ---------------------------------------------------------------------------

def _answered(state):
    return [q for q in state["questions"] if q.get("answer") is not None]


def _chosen_options(q):
    a = q.get("answer") or {}
    chosen = set(a.get("selected", []))
    return [o for o in q["options"] if o["label"] in chosen]


def profile_totals(state):
    totals = {k: 0.0 for k in DIMENSIONS}
    for q in _answered(state):
        for o in _chosen_options(q):
            for k, w in o.get("signals", {}).items():
                if k in totals:
                    totals[k] += w
    return totals


def profile_levels(state):
    return {k: min(1.0, v / SIGNAL_CAP) for k, v in profile_totals(state).items()}


def student_tags(state):
    tags = set()
    for q in _answered(state):           # a later tagged answer (e.g. subject group) replaces an earlier one
        for o in _chosen_options(q):
            if o.get("tags"):
                tags = set(o["tags"]) if q["type"] == "single" or not tags else tags | set(o["tags"])
    return tags


def score_careers(levels, tags):
    """Compatibility = how much of what a career needs is supported by the student's answers."""
    out = []
    for c in CAREERS:
        if tags and c["tags"] and not (set(c["tags"]) & tags):
            continue
        total_need = sum(c["needs"].values())
        parts = []
        for dim, need in c["needs"].items():
            level = levels.get(dim, 0.0)
            parts.append((need * level / total_need, dim, need, level))
        score = sum(p[0] for p in parts)
        parts.sort(key=lambda p: -p[0])
        out.append({"name": c["name"], "domain": c["domain"], "score": score,
                    "breakdown": [{"key": d, "label": DIMENSIONS[d][0], "need": n, "level": round(lv * 100)}
                                  for _s, d, n, lv in parts[:3]]})
    out.sort(key=lambda r: -r["score"])
    return out


def _confident(scored):
    if len(scored) < 6:
        return True
    return scored[0]["score"] >= 0.45 and scored[0]["score"] - scored[5]["score"] >= 0.08


# ---------------------------------------------------------------------------
# State handling
# ---------------------------------------------------------------------------

def new_state(stage):
    if stage not in STAGES:
        raise AssessmentError(f"stage must be one of {list(STAGES)}")
    return {"version": 1, "stage": stage, "status": "in_progress", "seq": 0, "questions": [], "progress": {}}


def load_state(raw):
    if not isinstance(raw, str) or not raw or len(raw) > MAX_STATE_CHARS:
        raise AssessmentError("state is missing or too large")
    try:
        state = json.loads(raw)
    except ValueError:
        raise AssessmentError("state is not valid JSON")
    if (not isinstance(state, dict) or state.get("stage") not in STAGES
            or not isinstance(state.get("questions"), list)):
        raise AssessmentError("state is not a valid assessment")
    for q in state["questions"]:
        if (not isinstance(q, dict) or not isinstance(q.get("options"), list)
                or not isinstance(q.get("id"), str) or "text" not in q):
            raise AssessmentError("state contains a broken question")
    state.setdefault("seq", len(state["questions"]))
    return state


def dump_state(state):
    state["progress"] = _progress(state)
    return json.dumps(state, ensure_ascii=False)


def _counts(state):
    counts = {}
    for q in _answered(state):
        a = q["answer"]
        if q.get("category") in QUOTA and not a.get("skipped") and (a.get("selected") or a.get("other")):
            counts[q["category"]] = counts.get(q["category"], 0) + 1
    return counts


def _progress(state):
    counts = _counts(state)
    answered_ids = {q["id"]: q["answer"].get("selected", []) for q in _answered(state) if q.get("seed")}
    seeds_total = {"BEFORE_10TH": 3, "AFTER_10TH": 3, "AFTER_12TH": 4, "UNDERGRAD": 3}[state["stage"]]
    if state["stage"] == "AFTER_12TH" and answered_ids.get("seed_stream") and "Science" not in answered_ids["seed_stream"]:
        seeds_total = 3
    done = len(answered_ids) + sum(min(counts.get(c, 0), n) for c, n in QUOTA.items())
    needed = seeds_total + sum(QUOTA.values())
    return {"answered": len(_answered(state)), "minTotal": MIN_QUESTIONS, "maxTotal": MAX_QUESTIONS,
            "coverage": round(min(1.0, done / needed), 2)}


def _next_category(state):
    counts, need = _counts(state), {}
    for cat in PLAN:
        need[cat] = need.get(cat, 0) + 1
        if counts.get(cat, 0) < need[cat]:
            return cat
    return None


def _make_question(state, category, ask_json):
    asked_ids = {q["id"] for q in state["questions"]}
    used = [q["text"] for q in state["questions"]]
    if ask_json is not None:
        system, user = _question_prompts(state, category)
        for _attempt in range(2):
            try:
                q = clean_question(ask_json(system, user), category, used)
                state["seq"] += 1
                q["id"] = f"q{state['seq']}"
                return q
            except Exception:           # bad AI output or AI down -> try again, then use the built-in question
                continue
    return _fallback(category, asked_ids, used) or _fallback("clarify", asked_ids, used)


def advance(state, ask_json):
    """Make sure the state ends with one unanswered question, or is marked ready."""
    qs = state["questions"]
    if qs and qs[-1].get("answer") is None:
        state["status"] = "in_progress"
        return state
    answered_seed_ids = {q["id"]: q["answer"].get("selected", []) for q in _answered(state) if q.get("seed")}
    seed = _seeds(state["stage"], answered_seed_ids)
    if seed is not None:
        qs.append(seed)
        state["status"] = "in_progress"
        return state
    if len(qs) >= MAX_QUESTIONS:
        state["status"] = "ready"
        return state
    category = _next_category(state)
    if category is None:
        scored = score_careers(profile_levels(state), student_tags(state))
        if len(qs) >= MIN_QUESTIONS and _confident(scored):
            state["status"] = "ready"
            return state
        category = "clarify"
    q = _make_question(state, category, ask_json)
    if q is None:
        state["status"] = "ready"       # nothing sensible left to ask
        return state
    qs.append(q)
    state["status"] = "in_progress"
    return state


def start_assessment(stage, ask_json=None):
    return advance(new_state(stage), ask_json)


def apply_answer(state, question_id, selected, other, skip, ask_json=None):
    qs = state["questions"]
    idx = next((i for i, q in enumerate(qs) if q["id"] == question_id), None)
    if idx is None:
        raise AssessmentError("that question is not part of this assessment")
    q = qs[idx]
    other = (other or "").strip()[:200]
    if skip:
        if not q.get("skippable"):
            raise AssessmentError("this question cannot be skipped")
        new = {"selected": [], "other": "", "skipped": True}
    else:
        labels = [o["label"] for o in q["options"]]
        picked = []
        for s in selected or []:
            if s not in labels:
                raise AssessmentError("selected option is not one of the choices")
            if s not in picked:
                picked.append(s)
        if q["type"] == "single" and len(picked) > 1:
            raise AssessmentError("choose only one option")
        if q["type"] == "multi" and len(picked) > (q.get("maxSelect") or 4):
            raise AssessmentError(f"choose at most {q.get('maxSelect') or 4} options")
        if other and not q.get("allowOther"):
            raise AssessmentError("this question does not take a custom answer")
        if not picked and not other:
            raise AssessmentError("please choose an option")
        new = {"selected": picked, "other": other, "skipped": False}

    changed = q.get("answer") != new
    q["answer"] = new
    if changed:
        del qs[idx + 1:]                 # later questions depended on the old answer
        state["status"] = "in_progress"
    elif idx < len(qs) - 1 or state.get("status") == "ready":
        return state
    return advance(state, ask_json)


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

DISCLAIMER = ("Compatibility scores are indicative. They show how well your answers match what a career usually "
              "needs. They are not a prediction of getting a job or of success, and this is not a validated "
              "psychological test. Check eligibility, fees and dates on official websites before deciding.")
METHOD = ("Each option you chose adds points to the interests, skills and working styles it reflects. For every career "
          "we take the traits it needs (weighted by importance) and measure how strongly your answers support them. "
          "100% would mean all required traits are fully supported by your answers.")


def _strs(v, limit=8):
    if not isinstance(v, list):
        return []
    return [str(x).strip()[:300] for x in v if str(x).strip()][:limit]


def _text(v, limit=900):
    return str(v).strip()[:limit] if isinstance(v, (str, int, float)) else ""


def _pick_alternatives(scored, top, count=3):
    top_names = {c["name"] for c in top}
    top_domains = {c["domain"] for c in top}
    rest = [c for c in scored if c["name"] not in top_names]
    fresh = [c for c in rest if c["domain"] not in top_domains]
    chosen = fresh[:count]
    chosen += [c for c in rest if c not in chosen][:count - len(chosen)]
    return chosen


def _report_prompts(state, top, alts, context):
    qa = _qa_lines(state)
    stage = STAGE_TEXT[state["stage"]]
    careers_txt = "\n".join(
        f"- {c['name']} (indicative compatibility {round(c['score'] * 100)}%; strongest matches: "
        f"{', '.join(b['label'] for b in c['breakdown'])})" for c in top)
    alts_txt = "\n".join(f"- {c['name']}" for c in alts)
    rules = ("You are an honest, practical career counsellor for students in India. Be specific to this student. "
             "Do not invent URLs, certification names, salaries, statistics or exact cutoffs. Name only well-known "
             "platforms or exams you are sure exist, otherwise describe the type of resource. When eligibility can "
             "change, say it must be checked on the official website. Keep every list item to one short sentence. "
             "Reply ONLY with JSON.")
    sys_a = (rules + ' Shape: {"careers": [{"name": str (exactly as given), "why": str, "requiredSkills": [str], '
             '"education": str, "entranceExams": [str], "opportunities": [str], "advantages": [str], '
             '"challenges": [str], "startRoadmap": [str]}], "alternatives": [{"name": str (exactly as given), '
             '"reason": str}]}. Give 3 to 5 items in each list. Use the careers in the same order.')
    user_a = (f"Student: {stage}.\nAnswers:\n{qa}\n\nCareers already ranked by our scoring (do not re-rank, explain each):\n"
              f"{careers_txt}\n\nAlternative careers the student may not have considered (explain why each could suit them):\n"
              f"{alts_txt}")
    sys_b = (rules + ' Shape: {"profile": {"education": str, "interests": [str], "skills": [str], "strengths": [str], '
             '"preferences": [str], "goals": [str]}, "interestAnalysis": str (3 to 5 sentences, descriptive, no '
             'personality labels), "skillGap": {"strengths": [str], "toImprove": [str], "technical": [str], '
             '"soft": [str], "learning": [str]}, "roadmap": {"immediate": [str], "next3Months": [str], '
             '"next6Months": [str], "next12Months": [str], "longTerm": [str]}, "resources": {"courses": [str], '
             '"certifications": [str], "books": [str], "projects": [str], "platforms": [str], "practice": [str]}, '
             '"educationGuidance": {"pathways": [str], "entranceExams": [str], "notes": str}}. '
             "The roadmap must fit the student's current education stage.")
    user_b = (f"Student: {stage}.\nAnswers:\n{qa}\n"
              + (f"\nExtra background about this student:\n{context[:1200]}\n" if context else "")
              + f"\nTop careers by our scoring: {', '.join(c['name'] for c in top)}.")
    return (sys_a, user_a), (sys_b, user_b)


def _level_words(levels, group, n=5):
    items = [(lv, k) for k, lv in levels.items() if DIMENSIONS[k][1] == group and lv > 0]
    items.sort(reverse=True)
    return [DIMENSIONS[k][0] for _lv, k in items[:n]]


def build_report(state, ask_json, context=""):
    if not _answered(state):
        raise AssessmentError("answer some questions before generating a report")
    levels = profile_levels(state)
    scored = score_careers(levels, student_tags(state))
    if not scored:
        raise AssessmentError("no careers match this profile yet")
    top = scored[:6]
    alts = _pick_alternatives(scored, top)
    (sa, ua), (sb, ub) = _report_prompts(state, top, alts, context)

    def safe(system, user):
        try:
            return ask_json(system, user)
        except Exception as e:           # one failed part must not lose the whole report
            return e

    with ThreadPoolExecutor(max_workers=2) as pool:
        fa, fb = pool.submit(safe, sa, ua), pool.submit(safe, sb, ub)
        part_a, part_b = fa.result(), fb.result()
    ok_a, ok_b = isinstance(part_a, dict), isinstance(part_b, dict)
    if not ok_a and not ok_b:
        raise RuntimeError("the AI could not write the report")

    by_name = {}
    if ok_a:
        for item in part_a.get("careers", []) if isinstance(part_a.get("careers"), list) else []:
            if isinstance(item, dict):
                by_name[_text(item.get("name")).lower()] = item
    careers = []
    for c in top:
        item = by_name.get(c["name"].lower(), {})
        careers.append({
            "name": c["name"], "domain": c["domain"], "score": round(c["score"] * 100), "breakdown": c["breakdown"],
            "why": _text(item.get("why")) or f"Your answers support the traits this career needs most: "
                                              f"{', '.join(b['label'] for b in c['breakdown'])}.",
            "requiredSkills": _strs(item.get("requiredSkills")), "education": _text(item.get("education")),
            "entranceExams": _strs(item.get("entranceExams")), "opportunities": _strs(item.get("opportunities")),
            "advantages": _strs(item.get("advantages")), "challenges": _strs(item.get("challenges")),
            "startRoadmap": _strs(item.get("startRoadmap")),
        })
    alt_text = {}
    if ok_a and isinstance(part_a.get("alternatives"), list):
        for item in part_a["alternatives"]:
            if isinstance(item, dict):
                alt_text[_text(item.get("name")).lower()] = _text(item.get("reason"), 400)
    alternatives = [{"name": c["name"], "domain": c["domain"], "score": round(c["score"] * 100),
                     "reason": alt_text.get(c["name"].lower()) or
                               f"It fits your {', '.join(b['label'].lower() for b in c['breakdown'][:2])}."}
                    for c in alts]

    pb = part_b if ok_b else {}
    prof = pb.get("profile") if isinstance(pb.get("profile"), dict) else {}
    gap = pb.get("skillGap") if isinstance(pb.get("skillGap"), dict) else {}
    road = pb.get("roadmap") if isinstance(pb.get("roadmap"), dict) else {}
    res = pb.get("resources") if isinstance(pb.get("resources"), dict) else {}
    edu = pb.get("educationGuidance") if isinstance(pb.get("educationGuidance"), dict) else {}
    dims = sorted(((lv, k) for k, lv in levels.items() if lv > 0), reverse=True)[:12]

    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "stage": state["stage"],
        "answeredCount": len(_answered(state)),
        "dimensions": [{"key": k, "label": DIMENSIONS[k][0], "group": DIMENSIONS[k][1], "percent": round(lv * 100)}
                       for lv, k in dims],
        "profile": {
            "education": _text(prof.get("education"), 300),
            "interests": _strs(prof.get("interests")) or _level_words(levels, "interest"),
            "skills": _strs(prof.get("skills")) or _level_words(levels, "skill"),
            "strengths": _strs(prof.get("strengths")),
            "preferences": _strs(prof.get("preferences")) or _level_words(levels, "style"),
            "goals": _strs(prof.get("goals")),
        },
        "interestAnalysis": _text(pb.get("interestAnalysis"), 1500) or
                            "Your answers point most strongly to: " + ", ".join(_level_words(levels, "interest", 3)) + ".",
        "careers": careers,
        "alternativeCareers": alternatives,
        "skillGap": {k: _strs(gap.get(k)) for k in ("strengths", "toImprove", "technical", "soft", "learning")},
        "roadmap": {k: _strs(road.get(k)) for k in ("immediate", "next3Months", "next6Months", "next12Months", "longTerm")},
        "resources": {k: _strs(res.get(k)) for k in ("courses", "certifications", "books", "projects", "platforms", "practice")},
        "educationGuidance": {"pathways": _strs(edu.get("pathways")), "entranceExams": _strs(edu.get("entranceExams")),
                              "notes": _text(edu.get("notes"), 600)},
        "scoring": {"method": METHOD, "disclaimer": DISCLAIMER},
        "aiParts": {"careers": ok_a, "overview": ok_b},
    }
