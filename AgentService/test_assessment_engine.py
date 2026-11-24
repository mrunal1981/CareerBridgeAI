"""Tests for the adaptive assessment engine (no network and no web framework needed)."""
import json
import pytest

import assessment_engine as E
from careers import CAREERS, DIMENSIONS


def good_question(text="Which of these would you enjoy most as daily work?"):
    return {
        "text": text, "why": "To learn what you enjoy.", "type": "multi", "maxSelect": 2,
        "allowOther": True, "skippable": True,
        "options": [
            {"label": "Writing programs " + text[-6:], "signals": {"technology": 3, "s_logic": 1}},
            {"label": "Helping patients", "signals": {"healthcare": 3}},
            {"label": "Selling ideas", "signals": {"business": 2, "s_comm": 2}},
            {"label": "Not sure", "signals": {}},
        ],
    }


class FakeAI:
    """Returns a different valid question each time, like a working AI."""
    def __init__(self):
        self.n = 0

    def __call__(self, system, user):
        self.n += 1
        if "Shape:" in system:
            return {}
        return good_question(f"Question number {self.n} about what you enjoy most in daily work item {self.n * 7}?")


def answer_first_option(state, ai):
    q = state["questions"][-1]
    return E.apply_answer(state, q["id"], [q["options"][0]["label"]], "", False, ai)


def run_to_ready(stage, ai):
    state = E.start_assessment(stage, ai)
    guard = 0
    while state["status"] != "ready":
        state = answer_first_option(state, ai)
        guard += 1
        assert guard <= E.MAX_QUESTIONS + 2, "assessment never finished"
    return state


@pytest.mark.parametrize("stage", E.STAGES)
def test_every_stage_finishes_between_min_and_max(stage):
    state = run_to_ready(stage, FakeAI())
    assert E.MIN_QUESTIONS <= len(state["questions"]) <= E.MAX_QUESTIONS
    ids = [q["id"] for q in state["questions"]]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("stage", E.STAGES)
def test_works_with_no_ai_at_all(stage):
    state = run_to_ready(stage, None)           # only built-in questions
    assert state["status"] == "ready"
    texts = [q["text"] for q in state["questions"]]
    assert len(texts) == len(set(texts))


def test_bad_ai_output_falls_back_to_builtin_questions():
    def broken(system, user):
        return {"text": "x", "options": "nope"}
    state = run_to_ready("AFTER_12TH", broken)
    assert state["status"] == "ready"


def test_ai_exception_falls_back():
    def down(system, user):
        raise RuntimeError("rate limited")
    assert run_to_ready("AFTER_10TH", down)["status"] == "ready"


def test_after_12th_asks_subject_group_only_for_science():
    s = E.start_assessment("AFTER_12TH", None)
    assert s["questions"][0]["id"] == "seed_stream"
    s = E.apply_answer(s, "seed_stream", ["Commerce"], "", False, None)
    assert s["questions"][-1]["id"] != "seed_group"
    s2 = E.start_assessment("AFTER_12TH", None)
    s2 = E.apply_answer(s2, "seed_stream", ["Science"], "", False, None)
    assert s2["questions"][-1]["id"] == "seed_group"


def test_answer_validation():
    s = E.start_assessment("BEFORE_10TH", None)
    qid = s["questions"][0]["id"]
    with pytest.raises(E.AssessmentError):
        E.apply_answer(s, qid, ["Not an option"], "", False, None)
    with pytest.raises(E.AssessmentError):
        E.apply_answer(s, qid, [], "", False, None)                   # nothing chosen
    with pytest.raises(E.AssessmentError):
        E.apply_answer(s, qid, [], "", True, None)                    # opening question cannot be skipped
    with pytest.raises(E.AssessmentError):
        E.apply_answer(s, qid, ["Maths", "Science", "Computer / IT"], "", False, None)   # more than 2
    with pytest.raises(E.AssessmentError):
        E.apply_answer(s, "q999", ["Maths"], "", False, None)


def test_single_select_rejects_two_options():
    s = E.start_assessment("AFTER_10TH", None)
    s = E.apply_answer(s, "seed_marks", ["Above 90%"], "", False, None)
    assert s["questions"][-1]["id"] == "seed_strong"
    s = E.apply_answer(s, "seed_strong", ["Maths"], "", False, None)
    assert s["questions"][-1]["id"] == "seed_lean"
    with pytest.raises(E.AssessmentError):
        E.apply_answer(s, "seed_lean", ["Not sure yet", "ITI / vocational"], "", False, None)


def test_changing_an_old_answer_drops_later_questions_and_adapts():
    ai = FakeAI()
    s = E.start_assessment("AFTER_12TH", ai)
    s = E.apply_answer(s, "seed_stream", ["Science"], "", False, ai)
    s = E.apply_answer(s, "seed_group", ["PCM (Physics, Chemistry, Maths)"], "", False, ai)
    s = E.apply_answer(s, "seed_marks", ["75% to 90%"], "", False, ai)
    before = len(s["questions"])
    s = E.apply_answer(s, "seed_stream", ["Commerce"], "", False, ai)       # edit the first answer
    ids = [q["id"] for q in s["questions"]]
    assert "seed_group" not in ids and len(s["questions"]) < before + 1
    assert s["questions"][-1]["answer"] is None


def test_same_answer_again_does_not_reset_progress():
    ai = FakeAI()
    s = E.start_assessment("BEFORE_10TH", ai)
    s = E.apply_answer(s, "seed_like", ["Maths"], "", False, ai)
    n = len(s["questions"])
    s = E.apply_answer(s, "seed_like", ["Maths"], "", False, ai)
    assert len(s["questions"]) == n


def test_skip_does_not_count_towards_coverage():
    ai = FakeAI()
    s = E.start_assessment("BEFORE_10TH", ai)
    for qid, ans in (("seed_like", ["Maths"]), ("seed_hard", ["Science"]), ("seed_marks", ["Above 90%"])):
        s = E.apply_answer(s, qid, ans, "", False, ai)
    q = s["questions"][-1]
    assert q["category"] == "interests" and q["skippable"]
    s = E.apply_answer(s, q["id"], [], "", True, ai)
    assert s["questions"][-1]["category"] == "interests"                  # asked again, the skip did not count


def test_custom_text_answer_is_kept_and_limited():
    ai = FakeAI()
    s = E.start_assessment("BEFORE_10TH", ai)
    for qid, ans in (("seed_like", ["Maths"]), ("seed_hard", ["Science"]), ("seed_marks", ["Above 90%"])):
        s = E.apply_answer(s, qid, ans, "", False, ai)
    q = s["questions"][-1]
    s = E.apply_answer(s, q["id"], [], "x" * 500, False, ai)
    assert len(s["questions"][-2]["answer"]["other"]) == 200


def test_clean_question_rejects_unscoreable_and_duplicates():
    q = good_question()
    assert E.clean_question(q, "interests", [])["type"] == "multi"
    bad = good_question()
    for o in bad["options"]:
        o["signals"] = {"made_up_dimension": 3}
    with pytest.raises(ValueError):
        E.clean_question(bad, "interests", [])
    with pytest.raises(ValueError):
        E.clean_question(good_question(), "interests", [good_question()["text"]])
    weird = good_question()
    weird["options"][0]["signals"] = {"technology": 99, "bogus": 2, "s_logic": "x"}
    cleaned = E.clean_question(weird, "interests", [])
    assert cleaned["options"][0]["signals"] == {"technology": 3}          # clamped, unknown and bad values dropped


def test_state_loading_rejects_garbage():
    for raw in ("", "not json", "[]", json.dumps({"stage": "NOPE", "questions": []}),
                json.dumps({"stage": "AFTER_12TH", "questions": [{"id": 1}]}), "x" * (E.MAX_STATE_CHARS + 1)):
        with pytest.raises(E.AssessmentError):
            E.load_state(raw)
    s = E.start_assessment("AFTER_12TH", None)
    assert E.load_state(E.dump_state(s))["stage"] == "AFTER_12TH"


def test_progress_is_reported_honestly():
    s = E.start_assessment("AFTER_10TH", None)
    p = json.loads(E.dump_state(s))["progress"]
    assert p["minTotal"] == E.MIN_QUESTIONS and p["maxTotal"] == E.MAX_QUESTIONS and 0 <= p["coverage"] <= 1


# ---------- scoring ----------

def profile_state(picks):
    """A state answered with chosen options, so scores can be checked by hand."""
    opts = [{"label": k, "signals": v} for k, v in picks.items()]
    q = {"id": "q1", "category": "interests", "text": "t", "type": "multi", "maxSelect": 4, "options": opts,
         "answer": {"selected": list(picks), "other": "", "skipped": False}}
    return {"stage": "AFTER_12TH", "questions": [q]}


def test_score_is_computed_by_code_from_signals():
    state = profile_state({"coder": {"technology": 3, "s_logic": 3, "s_problem": 3, "s_technical": 3}})
    levels = E.profile_levels(state)
    scored = {c["name"]: c for c in E.score_careers(levels, set())}
    assert scored["Software Developer"]["score"] == pytest.approx(0.75)         # 3 signal points of the 4-point cap in every needed trait
    assert scored["Doctor (MBBS)"]["score"] < 0.1
    assert scored["Software Developer"]["score"] > scored["Data Scientist"]["score"]
    assert E.score_careers(levels, set())[0]["name"] == "Software Developer"


def test_scores_are_between_0_and_1_and_sorted():
    levels = E.profile_levels(profile_state({"a": {"technology": 3}, "b": {"business": 3, "finance": 3}}))
    scored = E.score_careers(levels, set())
    assert all(0 <= c["score"] <= 1 for c in scored)
    assert [c["score"] for c in scored] == sorted((c["score"] for c in scored), reverse=True)


def test_stream_filter_hides_careers_the_student_cannot_enter():
    levels = E.profile_levels(profile_state({"a": {"healthcare": 3, "science": 3, "social": 3}}))
    names_commerce = {c["name"] for c in E.score_careers(levels, {"commerce"})}
    assert "Doctor (MBBS)" not in names_commerce and "Mechanical Engineer" not in names_commerce
    names_pcb = {c["name"] for c in E.score_careers(levels, {"pcb"})}
    assert "Doctor (MBBS)" in names_pcb and "Mechanical Engineer" not in names_pcb


def test_subject_group_replaces_stream_tags():
    ai = None
    s = E.start_assessment("AFTER_12TH", ai)
    s = E.apply_answer(s, "seed_stream", ["Science"], "", False, ai)
    assert E.student_tags(s) == {"pcm", "pcb"}
    s = E.apply_answer(s, "seed_group", ["PCM (Physics, Chemistry, Maths)"], "", False, ai)
    assert E.student_tags(s) == {"pcm"}


def test_catalogue_is_consistent():
    assert len({c["name"] for c in CAREERS}) == len(CAREERS)
    for c in CAREERS:
        assert c["needs"] and all(k in DIMENSIONS and 1 <= w <= 3 for k, w in c["needs"].items())


def test_all_builtin_option_signals_are_valid_dimensions():
    for _cat, _t, _w, _ty, _mx, opts in E._FALLBACKS:
        for o in opts:
            assert all(k in DIMENSIONS for k in o["signals"])


# ---------- report ----------

def finished_state(ai=None):
    return run_to_ready("AFTER_12TH", ai or FakeAI())


def report_ai(system, user):
    if "alternatives" in system:
        names = [l[2:].split(" (")[0] for l in user.splitlines() if l.startswith("- ") and "(indicative" in l]
        return {"careers": [{"name": n, "why": f"{n} fits.", "requiredSkills": ["a", "b"], "education": "Degree",
                             "entranceExams": ["Check official site"], "opportunities": ["x"], "advantages": ["y"],
                             "challenges": ["z"], "startRoadmap": ["start"]} for n in names],
                "alternatives": []}
    return {"profile": {"education": "Class 12", "interests": ["Tech"], "skills": ["Logic"], "strengths": ["s"],
                        "preferences": ["p"], "goals": ["g"]},
            "interestAnalysis": "You like technology.", "skillGap": {"strengths": ["s"], "toImprove": ["t"]},
            "roadmap": {"immediate": ["do"], "next3Months": ["a"], "next6Months": ["b"], "next12Months": ["c"], "longTerm": ["d"]},
            "resources": {"courses": ["Intro course"]}, "educationGuidance": {"pathways": ["B.Tech"], "notes": "Check officially"}}


def test_report_has_every_section_and_ranked_careers():
    r = E.build_report(finished_state(), report_ai, "")
    assert 5 <= len(r["careers"]) <= 10 and len(r["alternativeCareers"]) == 3
    scores = [c["score"] for c in r["careers"]]
    assert scores == sorted(scores, reverse=True) and all(0 <= s <= 100 for s in scores)
    for key in ("profile", "interestAnalysis", "skillGap", "roadmap", "resources", "educationGuidance", "scoring", "dimensions"):
        assert key in r
    assert r["careers"][0]["requiredSkills"] == ["a", "b"] and r["careers"][0]["breakdown"]
    assert "not a validated" in r["scoring"]["disclaimer"].lower() or "not a prediction" in r["scoring"]["disclaimer"].lower()


def test_ai_cannot_change_the_ranking_or_scores():
    def sneaky(system, user):
        out = report_ai(system, user)
        if "careers" in out:
            out["careers"].reverse()
            for c in out["careers"]:
                c["score"] = 99
        return out
    st = finished_state()
    plain, tricked = E.build_report(st, report_ai, ""), E.build_report(st, sneaky, "")
    assert [c["name"] for c in plain["careers"]] == [c["name"] for c in tricked["careers"]]
    assert [c["score"] for c in plain["careers"]] == [c["score"] for c in tricked["careers"]]


def test_report_survives_one_ai_part_failing():
    def half(system, user):
        if "alternatives" in system:
            raise RuntimeError("timeout")
        return report_ai(system, user)
    r = E.build_report(finished_state(), half, "")
    assert r["aiParts"] == {"careers": False, "overview": True}
    assert all(c["why"] for c in r["careers"])                      # readable text even without the AI


def test_report_fails_only_when_both_parts_fail():
    def down(system, user):
        raise RuntimeError("down")
    with pytest.raises(RuntimeError):
        E.build_report(finished_state(), down, "")


def test_report_handles_garbage_ai_values():
    def garbage(system, user):
        return {"careers": "nope", "profile": 5, "skillGap": [], "roadmap": None, "resources": "x"}
    r = E.build_report(finished_state(), garbage, "")
    assert r["careers"] and r["roadmap"]["immediate"] == []


def test_report_needs_answers():
    with pytest.raises(E.AssessmentError):
        E.build_report(E.new_state("AFTER_12TH"), report_ai, "")


def test_report_json_is_serialisable():
    json.dumps(E.build_report(finished_state(), report_ai, ""))
