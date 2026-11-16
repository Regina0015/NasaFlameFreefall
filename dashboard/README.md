# Dashboard

FlameTrace's web app, built with React and Vite. It reads verified results from Supabase and is published on Vercel at [flametrace.world](https://www.flametrace.world). On the public site, click **Explore demo** on the sign-in page: no account is needed.

The public build never calculates and never calls a model. The research assistant (chat) runs only on a team computer: see "The local research assistant" below.

## What it shows

- **Opening animation**: Monterrey, Mexico, then Earth, then the station (`src/components/EarthScene.jsx`, timeline in `src/lib/intro.js`). It can be skipped, paused or replayed, and it is skipped when the system asks for reduced motion.
- **Two views**: student and professional. The rules for each are in `_config/audiences.md`.
- **Findings**: each one with its confidence grade, its checks and its evidence (rows and DOI). No claim is shown without a grade.
- **Investigations browser** and investigation details.
- **Coverage gaps**: what has no data, for example partial gravity.
- **Interpretation lab**: compares readings of the data side by side. Labeled as exploration; it is ungraded.
- **3D models**: the station and a conceptual habitat.
- **Research assistant** (local only).

## Run it on your computer

```
cd dashboard
npm install
npm run dev
```

Then open http://localhost:5173. `npm install` only writes to `dashboard/node_modules/`. With no settings, the dashboard uses the JSON copy in `public/data/`.

Tests: `npm test` (Node's built-in test runner, no extra packages).

## Settings (`.env.local`)

Copy `.env.example` to `.env.local` and fill it in. That file is git-ignored.

| Variable | What it is |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The Supabase project and its public (publishable) key. The `service_role` key never goes here |
| `OLLAMA_URL`, `CHAT_MODEL`, `OLLAMA_API_KEY` | The local chat's model (server side only, no `VITE_` prefix) |
| `VITE_DEMO_*` | Optional local demo accounts. They are checked in the browser only, so they are not real security |

## The local research assistant

The chat is offline on the public site **by design, for security**. It runs an open model (Google's Gemma 4, `gemma4:e4b-it-qat`) with Ollama on the team's own GPU, and that machine is not exposed to the internet:

- no API keys in the browser;
- questions are never sent to a third-party AI service;
- the model chooses tools and writes the text, but every number comes from code (`scripts/chat_tools.py`) and is checked by `chat/checkNumbers.js` before it is shown.

To run it:

1. Install [Ollama](https://ollama.com), then `ollama pull gemma4:e4b-it-qat`.
2. From the repository root, run `uv sync`. The chat tools run with `uv` and read `data/snapshot/`.
3. `npm run dev` in `dashboard/`. The chat server is mounted by `vite.config.js` at `/api/chat`, only in `npm run dev` and `npm run preview`.

To use a model on another computer, point `OLLAMA_URL` at the Auditor gateway's `/llm` route and set `OLLAMA_API_KEY` (see `.env.example` and `api/routes/llm.py`).

## Publish on Vercel

- **Root Directory**: `dashboard`. Vercel detects Vite; no `vercel.json` is needed, because the app uses hash routes (`#/demo`).
- **Environment variables**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Vite writes them into the build, so a change needs a new deployment.
- Every push to `main` deploys again.

## Layout

| Path | What is there |
|---|---|
| `src/App.jsx` | Routing between sign-in and the demo |
| `src/pages/` | `Login.jsx` (opening animation and sign-in) and `DemoShell.jsx` (the dashboard and its student/professional switch) |
| `src/components/` | One component per panel: findings, evidence, investigations, coverage gaps, lab, 3D viewers, chat |
| `src/lib/` | Data access and logic: `supabase.js`, `findings/` (where findings come from and how they are checked), `evidence.js`, `lab.js`, `geo.js`, `intro.js` |
| `src/chat/` | The chat panel's state (`useChat.js`) and its status messages |
| `chat/` | The local chat server: agent loop, tools, prompt and number check |
| `public/data/` | JSON copy of the data, used when Supabase is not reachable |
| `public/models/`, `public/textures/`, `public/data/geo/` | 3D models, Earth imagery and the Nuevo León outline, each with a `SOURCES.md` (origin and license) |
| `src/secciones/` | Early scaffold, no longer used by the app |

The database tables are in `supabase/schema.sql`.
