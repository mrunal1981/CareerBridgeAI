import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

type Props = { open: boolean; onClose: () => void; onSuccess: () => void };

const inputClass =
  "h-12 rounded-xl border border-input bg-background px-4 font-normal outline-none transition-shadow focus:ring-2 focus:ring-ring";

export function AuthModal({ open, onClose, onSuccess }: Props) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Close with the Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setError("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "signup" && !name.trim()) return setError("Please enter your name.");
    if (!email.trim() || !password) return setError("Email and password are required.");
    if (mode === "signup" && password.length < 6)
      return setError("Password must be at least 6 characters.");

    setLoading(true);
    try {
      if (mode === "signup") await signup(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      setPassword("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={mode === "login" ? "Log in" : "Sign up"}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            className="relative w-full max-w-md rounded-2xl border border-border bg-card p-7 text-card-foreground shadow-glow"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-muted"
            >
              <X size={18} />
            </button>

            <span className="grid size-11 place-items-center rounded-xl bg-gradient-brand text-primary-foreground">
              <Sparkles size={20} />
            </span>
            <h2 className="mt-4 text-2xl font-extrabold">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Log in to continue your career journey."
                : "Takes less than a minute. Your results are saved to your account."}
            </p>

            <form onSubmit={submit} className="mt-6 grid gap-4">
              {mode === "signup" && (
                <label className="grid gap-2 text-sm font-semibold">
                  Full name
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Mrunal Pawar"
                    autoComplete="name"
                  />
                </label>
              )}
              <label className="grid gap-2 text-sm font-semibold">
                Email
                <input
                  type="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Password
                <input
                  type="password"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </label>

              {error && (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" variant="hero" size="lg" disabled={loading}>
                {loading ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "login" ? "New here? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => switchMode(mode === "login" ? "signup" : "login")}
                className="font-bold text-primary hover:underline"
              >
                {mode === "login" ? "Create an account" : "Log in"}
              </button>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}