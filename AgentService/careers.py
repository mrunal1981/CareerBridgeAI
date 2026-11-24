"""Career catalogue + scoring taxonomy used by the adaptive assessment.

The AI never invents the match percentage. Every answer option carries "signals"
(which of the dimensions below it points to). The student's profile is the sum of the
signals of the options they chose, and each career in CAREERS lists which dimensions it
needs. The score is computed by plain code (see assessment_engine.score_careers).
"""

# key -> (label, group)
DIMENSIONS = {
    # interest domains
    "technology": ("Technology", "interest"),
    "engineering": ("Engineering", "interest"),
    "healthcare": ("Healthcare", "interest"),
    "business": ("Business", "interest"),
    "finance": ("Finance", "interest"),
    "science": ("Science", "interest"),
    "research": ("Research", "interest"),
    "design": ("Design", "interest"),
    "arts": ("Arts and media", "interest"),
    "education": ("Education", "interest"),
    "law": ("Law", "interest"),
    "government": ("Government and public service", "interest"),
    "social": ("Helping people and society", "interest"),
    "entrepreneurship": ("Entrepreneurship", "interest"),
    "agriculture": ("Agriculture and environment", "interest"),
    "communication": ("Communication and writing", "interest"),
    "management": ("Management", "interest"),
    # skills and strengths (self-reported)
    "s_logic": ("Logical reasoning", "skill"),
    "s_math": ("Mathematics", "skill"),
    "s_analytical": ("Analytical thinking", "skill"),
    "s_creative": ("Creativity", "skill"),
    "s_comm": ("Communication", "skill"),
    "s_lead": ("Leadership", "skill"),
    "s_problem": ("Problem solving", "skill"),
    "s_technical": ("Technical aptitude", "skill"),
    "s_team": ("Teamwork", "skill"),
    "s_practical": ("Practical skills", "skill"),
    # working style
    "w_independent": ("Prefers independent work", "style"),
    "w_collab": ("Prefers teamwork", "style"),
    "w_structured": ("Prefers structured work", "style"),
    "w_flexible": ("Prefers flexible work", "style"),
    "w_hands_on": ("Prefers hands-on work", "style"),
    "w_theory": ("Prefers theory and ideas", "style"),
    "w_pressure": ("Comfortable under pressure", "style"),
    "w_risk": ("Comfortable taking risks", "style"),
}


def _c(name, domain, tags=None, **needs):
    unknown = [k for k in needs if k not in DIMENSIONS]
    assert not unknown, f"{name}: unknown dimensions {unknown}"
    return {"name": name, "domain": domain, "tags": tags, "needs": needs}


PCM, PCB, COM, ARTS = "pcm", "pcb", "commerce", "arts"

# tags: None = open to every stream; otherwise the student needs one of the listed streams.
CAREERS = [
    # technology
    _c("Software Developer", "technology", technology=3, s_logic=3, s_problem=3, s_technical=3),
    _c("Data Scientist", "technology", technology=2, science=1, s_math=3, s_analytical=3, s_logic=2, research=1),
    _c("Data Analyst", "technology", technology=1, business=1, s_analytical=3, s_math=2, s_comm=1),
    _c("AI / Machine Learning Engineer", "technology", technology=3, s_math=3, s_logic=3, s_technical=2, research=1),
    _c("Cybersecurity Analyst", "technology", technology=3, s_logic=2, s_problem=3, s_analytical=2, w_structured=1),
    _c("Cloud / DevOps Engineer", "technology", technology=3, s_technical=3, s_problem=2, w_structured=1),
    _c("Game Developer", "technology", technology=3, design=2, s_creative=2, s_logic=2, s_technical=2),
    _c("UX / UI Designer", "design", design=3, technology=1, s_creative=3, s_comm=2, s_analytical=1, w_collab=1),
    # engineering
    _c("Mechanical Engineer", "engineering", [PCM], engineering=3, s_technical=2, s_math=2, s_practical=3, w_hands_on=2),
    _c("Civil Engineer", "engineering", [PCM], engineering=3, s_practical=2, s_math=2, s_lead=1, w_hands_on=2),
    _c("Electrical Engineer", "engineering", [PCM], engineering=3, s_technical=3, s_math=2, s_logic=2),
    _c("Electronics Engineer", "engineering", [PCM], engineering=3, technology=2, s_technical=3, s_logic=2),
    _c("Robotics Engineer", "engineering", [PCM], engineering=3, technology=2, s_technical=3, s_creative=1, s_problem=2),
    _c("Aerospace Engineer", "engineering", [PCM], engineering=3, science=2, s_math=3, s_analytical=2, research=1),
    # healthcare and life science
    _c("Doctor (MBBS)", "healthcare", [PCB], healthcare=3, science=2, social=2, s_comm=2, s_team=1, w_structured=1),
    _c("Biotechnologist / Life-science Researcher", "science", [PCB, PCM], science=3, research=3, healthcare=1, s_analytical=2),
    _c("Clinical Psychologist", "healthcare", healthcare=2, social=3, s_comm=3, research=1, s_analytical=1),
    _c("Pharmacist / Pharma Professional", "healthcare", [PCB, PCM], healthcare=3, science=2, w_structured=2),
    _c("Physiotherapist / Allied Health Professional", "healthcare", [PCB], healthcare=3, social=2, s_practical=2, w_hands_on=2),
    # business and finance
    _c("Marketing Manager", "business", business=3, communication=2, s_creative=2, s_comm=3, s_lead=1),
    _c("Digital Marketer", "business", business=2, communication=2, technology=1, s_creative=2, s_analytical=1),
    _c("Entrepreneur / Startup Founder", "entrepreneurship", entrepreneurship=3, business=2, s_lead=3, s_problem=2, w_flexible=2, w_risk=2),
    _c("Financial Analyst", "finance", finance=3, s_analytical=3, s_math=2, w_structured=1),
    _c("Chartered Accountant", "finance", finance=3, s_math=2, w_structured=3, s_analytical=2),
    _c("Business Analyst", "business", business=2, technology=1, s_analytical=3, s_comm=2, s_problem=2),
    _c("HR Manager", "management", management=2, social=2, s_comm=3, s_team=2, s_lead=1),
    _c("Operations / Project Manager", "management", management=3, s_lead=3, s_team=2, w_structured=2, s_problem=1),
    _c("Sales / Business Development Professional", "business", business=2, s_comm=3, w_risk=1, w_flexible=1),
    # science and research
    _c("Research Scientist", "research", research=3, science=3, s_analytical=3, w_independent=2, w_theory=2),
    _c("Environmental Scientist", "agriculture", science=2, social=1, research=2, agriculture=2, w_hands_on=1),
    _c("Agricultural Scientist", "agriculture", agriculture=3, science=2, research=1, w_hands_on=2),
    _c("Statistician / Actuary", "finance", s_math=3, s_analytical=3, finance=1, w_structured=2, research=1),
    # design and arts
    _c("Graphic Designer", "design", design=3, arts=2, s_creative=3, w_flexible=1),
    _c("Animator / VFX Artist", "arts", arts=3, design=2, s_creative=3, technology=1),
    _c("Architect", "design", [PCM], design=2, engineering=1, arts=2, s_creative=2, s_technical=1, s_math=1),
    _c("Filmmaker / Content Creator", "arts", arts=3, communication=3, s_creative=3, s_comm=2, w_flexible=2),
    # education, social, law, government, communication
    _c("Teacher / Professor", "education", education=3, s_comm=3, social=1, s_lead=1, w_structured=1),
    _c("Social Worker / NGO Professional", "social", social=3, s_team=2, s_comm=2, w_hands_on=1),
    _c("Lawyer", "law", law=3, s_comm=3, s_analytical=2, s_logic=1, w_pressure=1),
    _c("Civil Services Officer", "government", government=3, s_lead=2, s_comm=2, social=1, s_analytical=1, w_structured=1),
    _c("Armed Forces Officer", "government", government=2, s_lead=3, s_practical=1, w_hands_on=2, w_pressure=2),
    _c("Journalist", "communication", communication=3, social=1, s_comm=3, s_analytical=1, w_pressure=1),
    _c("Public Relations Specialist", "communication", communication=3, business=1, s_comm=3, s_creative=1),
]

CAREER_BY_NAME = {c["name"]: c for c in CAREERS}
assert len(CAREER_BY_NAME) == len(CAREERS), "duplicate career names"
