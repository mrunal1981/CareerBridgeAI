import type { Stage } from "@/lib/api";

// The Career Counselor questions live here, one flow per stage.
// Each flow is a list of short steps (max 4 questions visible per step).
// Some questions only appear after an earlier answer (showIf).

export type Answers = Record<string, string | string[]>;

export type CounselQuestion = {
  id: string;
  label: string; // also sent to the AI as the question text
  type: "single" | "multi" | "text" | "number";
  options?: string[];
  placeholder?: string;
  optional?: boolean;
  max?: number; // multi: maximum number of choices
  showIf?: (a: Answers) => boolean;
  profile?: "marks" | "stream"; // pre-filled from / saved to the student profile
};

export type CounselStep = { title: string; hint: string; questions: CounselQuestion[] };

const SUBJECTS = ["Mathematics", "Science", "Social Science", "English", "Hindi / Regional language", "Computer / IT"];
const INTERESTS = ["Technology", "Design", "People", "Research", "Business", "Public Service", "Healthcare"];
const INDUSTRIES = ["IT & Software", "Healthcare", "Finance & Banking", "Government services", "Design & Media", "Education", "Core engineering", "Business & Startups", "Law & Policy"];
const STRENGTHS = ["Problem solving", "Communication", "Creativity", "Leadership", "Empathy", "Analytical thinking", "Hands-on skills", "Discipline"];
const LEARNING = ["Hands-on practice", "Reading and notes", "Videos and demos", "Group discussion"];

const is = (id: string, value: string) => (a: Answers) => a[id] === value;

export const COUNSEL_FLOWS: Record<Stage, CounselStep[]> = {
  BEFORE_10TH: [
    { title: "About you", hint: "Start with school.", questions: [
      { id: "fav", label: "Which subject do you enjoy the most?", type: "single", options: ["Maths", "Science", "Social Studies", "Languages", "Art / Drawing"] },
      { id: "hard", label: "Which subject do you find the hardest?", type: "single", options: ["Maths", "Science", "Social Studies", "Languages", "Art / Drawing", "None in particular"] },
      { id: "scores", label: "How are your marks usually?", type: "single", options: ["Above 85%", "70% to 85%", "50% to 70%", "Below 50%"] },
    ] },
    { title: "Your style", hint: "How you like to spend your time and learn.", questions: [
      { id: "free", label: "What do you like doing in your free time? (up to 2)", type: "multi", max: 2, options: ["Solving puzzles", "Building or fixing things", "Reading or writing", "Drawing or designing", "Helping others", "Playing sports"] },
      { id: "work", label: "How do you prefer to work?", type: "single", options: ["Alone, focused", "In a team", "Leading a group", "Outdoors, hands-on"] },
      { id: "learn", label: "How do you learn best?", type: "single", options: LEARNING },
    ] },
    { title: "Your future", hint: "Dream a little.", questions: [
      { id: "excite", label: "Which of these sounds most exciting? (up to 2)", type: "multi", max: 2, options: ["Making an app or game", "Doing science experiments", "Running a business", "Teaching or counselling", "Creating art or videos"] },
      { id: "matters", label: "What matters most to you in a future career?", type: "single", options: ["High salary", "Job security", "Creativity", "Helping society", "Freedom to be my own boss"] },
      { id: "admire", label: "Is there a job or a person you admire? (optional)", type: "text", optional: true, placeholder: "e.g. a doctor in my family, a YouTuber, an engineer" },
    ] },
  ],

  AFTER_10TH: [
    { title: "Your academics", hint: "Where you stand right now.", questions: [
      { id: "marks", label: "Class 10 marks (%)", type: "number", placeholder: "e.g. 82", profile: "marks" },
      { id: "strong", label: "Which subjects are you strongest in? (up to 2)", type: "multi", max: 2, options: SUBJECTS },
      { id: "weak", label: "Which subject do you find hardest?", type: "single", options: [...SUBJECTS, "None in particular"] },
    ] },
    { title: "Interests and style", hint: "What fits you, not just your marks.", questions: [
      { id: "interests", label: "What interests you most? (up to 3)", type: "multi", max: 3, options: INTERESTS },
      { id: "learn", label: "How do you learn best?", type: "single", options: LEARNING },
      { id: "lean", label: "Which path are you leaning towards?", type: "single", options: ["Science (11th-12th)", "Commerce (11th-12th)", "Arts / Humanities (11th-12th)", "Diploma / Polytechnic", "ITI / vocational", "Not sure yet"] },
    ] },
    { title: "Your situation", hint: "Practical things that shape the choice.", questions: [
      { id: "unsure", label: "What makes the decision difficult?", type: "multi", max: 2, options: ["Too many options", "My family and I want different things", "Worried about marks or cutoffs", "I do not know what careers exist"], showIf: is("lean", "Not sure yet") },
      { id: "trade", label: "Which trade attracts you?", type: "single", options: ["Computer / IT", "Mechanical", "Electrical", "Civil", "Electronics", "Other"], showIf: is("lean", "Diploma / Polytechnic") },
      { id: "earn", label: "How soon do you want to start earning?", type: "single", options: ["As early as possible", "After a short course", "I can study for many years"] },
      { id: "away", label: "Can you study away from your home town?", type: "single", options: ["Yes", "Maybe", "No"] },
      { id: "goal", label: "Any career or goal in mind? (optional)", type: "text", optional: true, placeholder: "e.g. I want to become a pilot" },
    ] },
  ],

  AFTER_12TH: [
    { title: "Your academics", hint: "Your 12th details.", questions: [
      { id: "stream", label: "Stream", type: "single", options: ["Science", "Commerce", "Arts"], profile: "stream" },
      { id: "marks", label: "Class 12 marks (%)", type: "number", placeholder: "e.g. 84", profile: "marks" },
      { id: "group", label: "Which subject group did you study?", type: "single", options: ["PCM", "PCB", "PCMB", "Other"], showIf: is("stream", "Science") },
      { id: "maths", label: "Did you study Mathematics?", type: "single", options: ["Yes", "No"], showIf: is("stream", "Commerce") },
      { id: "arts", label: "Which subjects did you study most? (optional)", type: "text", optional: true, placeholder: "e.g. History, Political Science, Psychology", showIf: is("stream", "Arts") },
      { id: "subject", label: "Strongest subject", type: "text", placeholder: "e.g. Physics" },
    ] },
    { title: "Interests and industries", hint: "Where you see yourself working.", questions: [
      { id: "interests", label: "What interests you most? (up to 3)", type: "multi", max: 3, options: INTERESTS },
      { id: "industries", label: "Which industries attract you? (up to 3)", type: "multi", max: 3, options: INDUSTRIES },
      { id: "exp", label: "What experience do you have so far?", type: "single", options: ["Projects or internships", "Clubs, competitions or volunteering", "Only school activities", "None yet"] },
      { id: "expdesc", label: "Describe your best project or activity in one line", type: "text", placeholder: "e.g. Built a weather app using Python", showIf: (a) => a["exp"] === "Projects or internships" || a["exp"] === "Clubs, competitions or volunteering" },
    ] },
    { title: "Strengths and learning", hint: "Be honest, this makes the advice better.", questions: [
      { id: "strengths", label: "What are your strengths? (up to 3)", type: "multi", max: 3, options: STRENGTHS },
      { id: "improve", label: "What do you most want to improve?", type: "single", options: ["Focus and consistency", "Communication", "Maths and analytics", "Confidence", "Technical skills", "Time management"] },
      { id: "learn", label: "How do you learn best?", type: "single", options: LEARNING },
    ] },
    { title: "Your expectations", hint: "What you want from your career.", questions: [
      { id: "expect", label: "What do you expect most from your career?", type: "single", options: ["A high salary soon", "Job stability", "Following my passion", "Higher studies or going abroad", "Starting my own business"] },
      { id: "exams", label: "Entrance exams you are considering (optional)", type: "text", optional: true, placeholder: "e.g. JEE, CUET, NEET" },
      { id: "goal", label: "Anything else we should know? (optional)", type: "text", optional: true, placeholder: "e.g. I want a government job" },
    ] },
  ],

  EXAM_PREP: [
    { title: "Your exam", hint: "What you are preparing for.", questions: [
      { id: "exam", label: "Which exam are you preparing for?", type: "single", options: ["JEE", "NEET", "UPSC", "CUET", "CAT", "GATE", "SSC", "Banking", "Other"] },
      { id: "other", label: "Name of the exam", type: "text", placeholder: "e.g. CLAT", showIf: is("exam", "Other") },
      { id: "attempt", label: "Which attempt is this?", type: "single", options: ["First attempt", "Second attempt", "Third or more"] },
      { id: "left", label: "How much time is left?", type: "single", options: ["Less than 3 months", "3 to 6 months", "6 to 12 months", "More than a year"] },
    ] },
    { title: "Where you stand", hint: "Be realistic, the plan depends on it.", questions: [
      { id: "hours", label: "How many hours do you study per day?", type: "single", options: ["Under 2", "2 to 4", "4 to 6", "More than 6"] },
      { id: "mock", label: "Average mock test score (%) (optional)", type: "number", optional: true, placeholder: "e.g. 55" },
      { id: "strongT", label: "Strongest subjects or topics (optional)", type: "text", optional: true, placeholder: "e.g. Physics, Algebra" },
      { id: "weakT", label: "Weakest subjects or topics", type: "text", placeholder: "e.g. Organic Chemistry" },
    ] },
    { title: "Challenges and plan", hint: "What gets in your way.", questions: [
      { id: "challenge", label: "What is your biggest challenge? (up to 2)", type: "multi", max: 2, options: ["Staying consistent", "Managing time", "Weak concepts", "Exam anxiety", "Limited resources", "Mock tests and revision"] },
      { id: "mode", label: "How are you preparing?", type: "single", options: ["Self-study", "Coaching classes", "Online course", "A mix"] },
      { id: "backup", label: "Do you have a backup plan?", type: "single", options: ["Yes", "No", "Thinking about it"] },
      { id: "notes", label: "Anything else? (optional)", type: "text", optional: true, placeholder: "e.g. I get distracted by my phone" },
    ] },
  ],
};

export const visibleQuestions = (step: CounselStep, a: Answers) =>
  step.questions.filter((q) => !q.showIf || q.showIf(a));

export const hasAnswer = (q: CounselQuestion, a: Answers): boolean => {
  const v = a[q.id];
  return Array.isArray(v) ? v.length > 0 : (v ?? "").trim() !== "";
};

const validNumber = (v: string | string[] | undefined) => {
  const n = Number(v);
  return typeof v === "string" && v.trim() !== "" && !Number.isNaN(n) && n >= 0 && n <= 100;
};

export const stepReady = (step: CounselStep, a: Answers) =>
  visibleQuestions(step, a).every((q) => {
    if (q.type === "number" && hasAnswer(q, a)) return validNumber(a[q.id]); // marks must be 0-100
    return q.optional || hasAnswer(q, a);
  });

// Turns the answers into the plain text the backend already expects in "answers".
export function serializeAnswers(flow: CounselStep[], a: Answers): string {
  const lines: string[] = [];
  for (const step of flow) {
    for (const q of visibleQuestions(step, a)) {
      const v = a[q.id];
      if (!hasAnswer(q, a) || v === undefined) continue;
      const value = Array.isArray(v) ? v.join(", ") : v.trim();
      lines.push(`${q.label.replace(/(\s*\([^)]*\))+\s*$/, "").replace(/\?$/, "")}: ${q.type === "number" ? `${value}%` : value}`);
    }
  }
  return lines.join("\n");
}