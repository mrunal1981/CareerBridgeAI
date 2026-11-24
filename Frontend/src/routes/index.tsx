import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, Award, BookOpen, BriefcaseBusiness, Check, ChevronDown, Compass,
  FileSearch, GraduationCap, LayoutDashboard, Menu, Moon, Search, Sparkles,
  Sun, Target, TrendingUp, UploadCloud, Users, X, Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/AuthModal";
import { Overview, ResumeAgent, ScholarshipAgent, JobsAgent } from "@/components/AgentScreens";
import { CareerHub } from "@/components/CareerHub";import { useAuth } from "@/lib/auth";
import { api, type DashboardData, type PublicStats, type Student } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "CareerBridge — Your career, no connections needed" },
    { name: "description", content: "Four AI-powered career agents helping students improve resumes, choose careers, find scholarships, and discover jobs." },
    { property: "og:title", content: "CareerBridge — AI career guidance for students" },
    { property: "og:description", content: "Equal-opportunity career guidance, from your first resume to your first job." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { agent?: Agent } => {
    const a = s["agent"];
    return a === "overview" || a === "resume" || a === "career" || a === "scholarship" || a === "jobs" ? { agent: a } : {};
  },
  component: CareerBridge,
});
type Agent = "overview" | "resume" | "career" | "scholarship" | "jobs";
const agents = [
  { id: "resume" as const, title: "Resume Evaluator", short: "Resume", desc: "Turn your resume into an interview-ready story.", icon: FileSearch, color: "text-primary", bg: "bg-secondary" },
  { id: "career" as const, title: "Career & Exam Guide", short: "Guidance", desc: "Find paths that fit your strengths and interests.", icon: Compass, color: "text-accent-foreground", bg: "bg-accent/70" },
  { id: "scholarship" as const, title: "Scholarship Finder", short: "Scholarships", desc: "Discover funding and free learning resources.", icon: GraduationCap, color: "text-success", bg: "bg-success/10" },
  { id: "jobs" as const, title: "Job Matcher", short: "Jobs", desc: "Match your skills to roles where you can thrive.", icon: BriefcaseBusiness, color: "text-primary", bg: "bg-secondary" },
];

const MotionButton = motion.create(Button);
const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: .55 } };

function CareerBridge() {
  const { student, logout } = useAuth();
  const search = Route.useSearch(); // /?agent=resume reopens that agent (used by the "Back" buttons on result pages)
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<"home" | "dashboard">(search.agent ? "dashboard" : "home");
  const [agent, setAgent] = useState<Agent>(search.agent ?? "overview");
  useEffect(() => { try { setDark(localStorage.getItem("careerbridge.theme") === "dark"); } catch { /* ignore */ } }, []);
  const changeTheme = (v: boolean) => { setDark(v); try { localStorage.setItem("careerbridge.theme", v ? "dark" : "light"); } catch { /* ignore */ } };
  const [menu, setMenu] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [pending, setPending] = useState<Agent>("overview"); // where to go after login
  const rootRef = useRef<HTMLDivElement>(null);

  const openDashboard = (next: Agent) => { setAgent(next); setView("dashboard"); setMenu(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Dashboard needs a logged-in student: if nobody is logged in, show the login popup first.
  const goDashboard = (next: Agent = "overview") => {
    if (!student) { setPending(next); setAuthOpen(true); setMenu(false); return; }
    openDashboard(next);
  };
  const handleLogout = () => { logout(); setView("home"); setMenu(false); };

  return (
    <div ref={rootRef} className={dark ? "dark" : ""}>
      <div className="min-h-screen overflow-x-hidden bg-background text-foreground transition-colors duration-300">
        <Navbar dark={dark} setDark={changeTheme} view={view} setView={setView} goDashboard={goDashboard} menu={menu} setMenu={setMenu} student={student} onLogin={() => { setMenu(false); setAuthOpen(true); }} onLogout={handleLogout} />
        <AnimatePresence mode="wait">
          {view === "home" || !student ? <Landing key="home" goDashboard={goDashboard} /> : <Dashboard key="dashboard" agent={agent} setAgent={setAgent} />}
        </AnimatePresence>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => { setAuthOpen(false); openDashboard(pending); }} />
      </div>
    </div>
  );
}
function Navbar({ dark, setDark, view, setView, goDashboard, menu, setMenu, student, onLogin, onLogout }: { dark: boolean; setDark: (v:boolean)=>void; view:string; setView:(v:"home"|"dashboard")=>void; goDashboard:(a?:Agent)=>void; menu:boolean; setMenu:(v:boolean)=>void; student: Student | null; onLogin: ()=>void; onLogout: ()=>void }) {  const home = () => { setView("home"); setMenu(false); window.scrollTo({top:0, behavior:"smooth"}); };
  return <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
    <nav className="mx-auto grid h-18 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 sm:px-8">
      <button onClick={home} className="flex min-w-0 items-center gap-2.5 cursor-pointer" aria-label="CareerBridge home">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-brand text-primary-foreground shadow-glow"><Sparkles size={18}/></span>
        <span className="truncate font-display text-xl font-extrabold">Career<span className="text-primary">Bridge</span></span>
      </button>
      <div className="hidden items-center gap-7 md:flex">
        <button onClick={home} className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">Home</button>
        <a href={view === "home" ? "#features" : "/#features"} className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">Features</a>
        <button onClick={()=>goDashboard()} className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">Dashboard</button>
        <a href={view === "home" ? "#about" : "/#about"} className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">About</a>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="icon" onClick={()=>setDark(!dark)} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} className="relative overflow-hidden rounded-full">
          <AnimatePresence mode="wait" initial={false}>{dark ? <motion.span key="sun" initial={{opacity:0,rotate:-90}} animate={{opacity:1,rotate:0}} exit={{opacity:0,rotate:90}}><Sun/></motion.span> : <motion.span key="moon" initial={{opacity:0,rotate:90}} animate={{opacity:1,rotate:0}} exit={{opacity:0,rotate:-90}}><Moon/></motion.span>}</AnimatePresence>
        </Button>
        {student && <span className="hidden max-w-32 truncate text-sm font-semibold sm:inline">Hi, {student.name.split(" ")[0]}</span>}
        {student ? <Button variant="outline" onClick={onLogout}>        <Button variant="ghost" size="icon" className="md:hidden" onClick={()=>setMenu(!menu)} aria-label="Open menu"><Menu/></Button>Logout</Button> : <Button variant="hero" onClick={onLogin}>Login / Signup</Button>}
      </div>
    </nav>
    <AnimatePresence>{menu && <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden border-t border-border bg-surface-strong md:hidden"><div className="grid gap-2 p-4"><Button variant="ghost" onClick={home}>Home</Button><Button variant="ghost" onClick={()=>goDashboard()}>Dashboard</Button><Button variant="hero" onClick={()=>goDashboard()}>Login / Signup</Button></div></motion.div>}</AnimatePresence>
  </header>;
}

function Landing({ goDashboard }: { goDashboard:(a?:Agent)=>void }) {
  const [stats, setStats] = useState<PublicStats | null>(null);
  useEffect(() => { api.publicStats().then(setStats).catch(() => setStats(null)); }, []);
  const num = (n: number | undefined) => (n === undefined ? "–" : String(n));
  return <motion.main initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.3}}>
    <section className="relative min-h-[730px] overflow-hidden border-b border-border/60 pt-24 ambient-grid">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/20 via-background/80 to-background" />
      <motion.div animate={{y:[0,-12,0],rotate:[0,3,0]}} transition={{duration:6,repeat:Infinity,ease:"easeInOut"}} className="absolute left-[7%] top-36 hidden size-14 place-items-center rounded-2xl border border-primary/20 bg-surface text-primary shadow-soft lg:grid"><Target/></motion.div>
      <motion.div animate={{y:[0,14,0],rotate:[0,-4,0]}} transition={{duration:7,repeat:Infinity,ease:"easeInOut"}} className="absolute right-[8%] top-52 hidden size-14 place-items-center rounded-2xl border border-accent/30 bg-surface text-accent-foreground shadow-soft lg:grid"><Award/></motion.div>
      <div className="relative mx-auto max-w-5xl px-5 text-center sm:px-8">
        <motion.div initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary px-4 py-2 text-sm font-semibold text-primary"><Zap size={15}/> Four AI agents. One confident future.</motion.div>
        <motion.h1 initial={{opacity:0,y:25}} animate={{opacity:1,y:0}} transition={{delay:.1,duration:.6}} className="mx-auto max-w-4xl font-display text-5xl font-extrabold leading-[1.04] sm:text-7xl lg:text-8xl">Your career,<br/><span className="text-gradient-brand">no connections needed.</span></motion.h1>
        <motion.p initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.22}} className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">Personal guidance, practical opportunities, and a fair start—for every student, from every background.</motion.p>
        <MotionButton initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.35}} variant="hero" size="lg" className="mt-9" onClick={()=>goDashboard()}>Get Started <ArrowRight/></MotionButton>
        <motion.div initial={{opacity:0,y:35}} animate={{opacity:1,y:0}} transition={{delay:.5,duration:.65}} className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-3 rounded-2xl border border-border bg-surface p-3 shadow-soft backdrop-blur-xl sm:grid-cols-4">
          {[[num(stats?.resumes),'Resumes evaluated'],[num(stats?.counselingSessions),'Career sessions'],[num(stats?.scholarshipSearches),'Scholarship searches'],[num(stats?.jobMatches),'Job match runs']].map(([n,l])=><div key={l} className="rounded-xl bg-background/60 px-4 py-5"><div className="font-display text-2xl font-extrabold text-primary">{n}</div><div className="mt-1 text-xs font-semibold text-muted-foreground">{l}</div></div>)}
        </motion.div>
      </div>
    </section>
    <section id="features" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <motion.div {...rise} className="mb-12 max-w-2xl"><p className="mb-3 text-sm font-bold uppercase text-primary">Your support system</p><h2 className="text-4xl font-extrabold sm:text-5xl">Four experts in your corner.</h2><p className="mt-4 text-lg text-muted-foreground">Move from uncertainty to opportunity with guidance built around you.</p></motion.div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">{agents.map((a,i)=><motion.article key={a.id} {...rise} transition={{delay:i*.08,duration:.5}} whileHover={{y:-8}} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft backdrop-blur-md transition-shadow hover:shadow-glow"><div className={`mb-8 grid size-12 place-items-center rounded-xl ${a.bg} ${a.color}`}><a.icon className="transition-transform group-hover:rotate-6 group-hover:scale-110"/></div><h3 className="text-xl font-bold">{a.title}</h3><p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">{a.desc}</p><Button variant="ghost" className="mt-6 px-0 text-primary" onClick={()=>goDashboard(a.id)}>Try it <ArrowRight/></Button></motion.article>)}</div>
    </section>
    <section className="border-y border-border bg-secondary/45"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:items-center"><motion.div {...rise}><p className="text-sm font-bold uppercase text-primary">Impact that compounds</p><h2 className="mt-3 text-4xl font-extrabold">Small steps. Real momentum.</h2><p className="mt-4 max-w-lg text-muted-foreground">Built to help students make informed decisions without needing insider access.</p></motion.div><div className="grid grid-cols-2 gap-4">{[{n:stats?.students??0,s:"",l:"Students registered"},{n:stats?.resumes??0,s:"",l:"Resumes evaluated"},{n:stats?.counselingSessions??0,s:"",l:"Counseling sessions"},{n:(stats?.scholarshipSearches??0)+(stats?.jobMatches??0),s:"",l:"Scholarship & job searches"}].map((x,i)=><CountStat key={x.l} {...x} delay={i*.08}/>)}</div></div></section>
    <section id="about" className="mx-auto max-w-5xl px-5 py-24 text-center sm:px-8"><motion.div {...rise}><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-warm text-accent-foreground shadow-warm"><Users/></span><h2 className="mt-6 text-4xl font-extrabold">Talent is everywhere. Opportunity should be too.</h2><p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">CareerBridge is a college project exploring how responsible AI can make career support more accessible, personal, and actionable.</p></motion.div></section>
    <footer className="border-t border-border px-5 py-8"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row"><strong className="font-display text-foreground">CareerBridge</strong><span>Built for students, with ambition.</span><div className="flex gap-5"><a href="#features">Features</a><a href="#about">About</a></div></div></footer>
  </motion.main>;
}

function CountStat({n,s,l,delay}:{n:number;s:string;l:string;delay:number}) {
  const [v,setV]=useState(0);
  useEffect(()=>{
    let x=0;
    const step=Math.max(1,Math.ceil(n/30));
    const timer=setInterval(()=>{x+=step;if(x>=n){x=n;clearInterval(timer)}setV(x)},35);
    return ()=>clearInterval(timer);
  },[n]);
  return <motion.div {...rise} transition={{delay}} className="rounded-2xl border border-border bg-card p-6 shadow-soft"><div className="font-display text-3xl font-extrabold text-primary">{v}{s}</div><div className="mt-1 text-sm text-muted-foreground">{l}</div></motion.div>
}

function Dashboard({agent,setAgent}:{agent:Agent;setAgent:(a:Agent)=>void}) {
  const { student } = useAuth();
  const [done,setDone]=useState<number|null>(null);
  useEffect(()=>{
    if(!student) return;
    let alive=true;
    const load=()=>api.dashboard(student.id).then((d:DashboardData)=>{
      if(alive) setDone([d.resumes,d.counselingSessions,d.scholarshipSearches,d.jobMatches].filter(a=>a.length>0).length);
    }).catch(()=>{});
    load();
    const t=setInterval(load,15000);
    return ()=>{alive=false;clearInterval(t)};
  },[student?.id,agent]);
  const readiness=(done??0)*25;
  const tabs=[{id:"overview" as const,title:"Overview",icon:LayoutDashboard},...agents.map(a=>({id:a.id,title:a.short,icon:a.icon}))];
  return <motion.main initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} className="mx-auto grid max-w-[1500px] lg:grid-cols-[245px_minmax(0,1fr)]">
    <aside className="sticky top-18 hidden h-[calc(100vh-4.5rem)] border-r border-border bg-surface px-4 py-7 backdrop-blur-xl lg:block"><p className="px-3 text-xs font-bold uppercase text-muted-foreground">AI Career Team</p><div className="mt-4 grid gap-2">{tabs.map(t=><Button key={t.id} variant={agent===t.id?"secondary":"ghost"} className={`h-11 justify-start ${agent===t.id?"text-primary":"text-muted-foreground"}`} onClick={()=>setAgent(t.id)}><t.icon/>{t.title}</Button>)}</div><div className="absolute bottom-6 left-4 right-4 rounded-xl border border-primary/20 bg-secondary p-4"><p className="text-xs font-bold text-primary">AGENTS COMPLETED</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-background"><motion.div initial={{width:0}} animate={{width:`${readiness}%`}} className="h-full rounded-full bg-gradient-brand"/></div><p className="mt-2 text-xs text-muted-foreground">{done===null?"Loading…":`${done} of 4 agents used (${readiness}%)`}</p></div></aside>
    <div className="min-w-0 px-4 py-6 sm:px-8 lg:px-10 lg:py-9">
      <div className="mb-5 flex gap-2 overflow-x-auto pb-2 lg:hidden">{tabs.map(t=><Button key={t.id} variant={agent===t.id?"default":"outline"} className="shrink-0" onClick={()=>setAgent(t.id)}><t.icon/>{t.title}</Button>)}</div>
      <AnimatePresence mode="wait"><motion.div key={agent} initial={{opacity:0,x:22}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-22}} transition={{duration:.28}}>{agent==="overview"?<Overview setAgent={setAgent} agents={agents}/>:agent==="resume"?<ResumeAgent/>:agent==="career"?<CareerHub/>:agent==="scholarship"?<ScholarshipAgent/>:<JobsAgent/>}</motion.div></AnimatePresence>
    </div>
  </motion.main>;
}