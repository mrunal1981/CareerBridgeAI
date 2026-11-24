import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  api, getToken, setToken, setUnauthorizedHandler,
  type ProfileInput, type Student,
} from "@/lib/api";

// Keeps "who is logged in" in one place so every screen can read it with useAuth().
// The student profile is kept in localStorage; the JWT is kept by api.ts.

type AuthValue = {
  student: Student | null;
  ready: boolean; // true once we have checked the browser for a saved login
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (p: ProfileInput) => Promise<void>;
};

const STORAGE_KEY = "careerbridge.student";
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [ready, setReady] = useState(false);

  const save = (s: Student | null) => {
    setStudent(s);
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage can be blocked - the login still works for this session */
    }
    if (!s) setToken(null);
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // A saved student without a token is an old login from before JWT existed: ask to log in again.
      if (saved && getToken()) setStudent(JSON.parse(saved) as Student);
      else if (saved) localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore broken saved data */
    }
    setReady(true);
    // Any 401 from the backend (expired or invalid token) logs the student out.
    setUnauthorizedHandler(() => save(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const value: AuthValue = {
    student,
    ready,
    login: async (email, password) => {
      const { token, ...s } = await api.login(email, password);
      setToken(token);
      save(s);
    },
    signup: async (name, email, password) => {
      const { token, ...s } = await api.signup({ name, email, password });
      setToken(token);
      save(s);
    },
    logout: () => save(null),
    updateProfile: async (p) => {
      if (!student) return;
      save(await api.updateProfile(student.id, p));
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}