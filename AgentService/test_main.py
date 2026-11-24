from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_resume_score_is_clamped(monkeypatch):
    monkeypatch.setattr(
        main, "ask_llm_json",
        lambda s, u: {"ats_score": 150, "missing_sections": ["Projects"], "suggestions": ["Add metrics"]},
    )
    r = client.post("/evaluate-resume", json={"resume_text": "x" * 40})
    assert r.status_code == 200
    assert r.json()["ats_score"] == 100
    assert r.json()["missing_sections"] == ["Projects"]


def test_resume_too_short_is_rejected():
    assert client.post("/evaluate-resume", json={"resume_text": "hi"}).status_code == 422


def test_unknown_stage_is_rejected():
    assert client.post("/counsel", json={"stage": "NOPE", "answers": "a"}).status_code == 422


def test_context_is_added_to_prompt_only_when_present(monkeypatch):
    seen = {}

    def fake(system, user):
        seen["user"] = user
        return {"matches": ["Data Analyst (match 80%) - fits - learn SQL"]}

    monkeypatch.setattr(main, "ask_llm_json", fake)

    client.post("/match-jobs", json={"skills": "Python"})
    assert "Background from this student" not in seen["user"]

    client.post("/match-jobs", json={"skills": "Python", "context": "Latest resume: ATS 72/100"})
    assert "Latest resume: ATS 72/100" in seen["user"]


def test_empty_llm_answer_is_a_502(monkeypatch):
    monkeypatch.setattr(main, "ask_llm_json", lambda s, u: {"scholarships": []})
    r = client.post("/find-scholarships", json={"education_level": "Undergraduate"})
    assert r.status_code == 502
    

def test_resume_extra_analysis_is_returned_as_json(monkeypatch):
    import json
    monkeypatch.setattr(
        main, "ask_llm_json",
        lambda s, u: {
            "ats_score": 72, "missing_sections": [], "suggestions": ["Add metrics"],
            "summary": "A fresher with two projects.", "strengths": ["Clear projects"],
            "weaknesses": ["No metrics"], "skills_found": ["Python"],
            "skills_to_add": ["SQL"], "suitable_roles": ["Data Analyst"],
        },
    )
    r = client.post("/evaluate-resume", json={"resume_text": "x" * 40})
    extra = json.loads(r.json()["analysis_json"])
    assert extra["summary"] == "A fresher with two projects."
    assert extra["suitableRoles"] == ["Data Analyst"]


def test_resume_without_extra_fields_still_works(monkeypatch):
    import json
    monkeypatch.setattr(main, "ask_llm_json", lambda s, u: {"ats_score": 50})
    r = client.post("/evaluate-resume", json={"resume_text": "x" * 40})
    assert r.status_code == 200
    assert json.loads(r.json()["analysis_json"])["strengths"] == []


def test_counsel_prompt_asks_for_sections(monkeypatch):
    seen = {}

    def fake(system, user):
        seen["system"] = system
        return "## Your profile\n- ok"

    monkeypatch.setattr(main, "ask_llm_text", fake)
    for stage in ("BEFORE_10TH", "AFTER_10TH", "AFTER_12TH", "EXAM_PREP"):
        r = client.post("/counsel", json={"stage": stage, "answers": "Stream: Science"})
        assert r.status_code == 200
        assert "## " in seen["system"] and "Your next 3 steps" in seen["system"]