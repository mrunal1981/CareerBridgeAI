# CareerBridge — Frontend

AI-powered career guidance for students: Resume Evaluator, Career & Exam Counselor,
Scholarship Finder and Job Matcher.

**Stack:** React 19 · TypeScript · TanStack Start/Router · Tailwind CSS 4 · Motion · Vite

## Run locally

```sh
npm install
npm run dev        # opens on http://localhost:5173
```

Requires Node.js 20 or newer.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Check code style |

## Folder structure

```
src/
  routes/        pages (file-based routing) — index.tsx is the whole app UI for now
  components/ui/ reusable UI building blocks (buttons, cards, dialogs)
  lib/           helpers
  hooks/         custom React hooks
  styles.css     colors, fonts, light/dark theme
public/          favicon and static files
```

## Backend

This UI currently shows sample data. The Spring Boot backend (port 8080) and the
Python AI agent service (port 8000) live in the `backend/` and `AgentService/` folders
of the main CareerBridge project.
