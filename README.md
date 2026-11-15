# NasaTwisters — Flame in Freefall

Project for the NASA Space Apps Challenge 2026, challenge "Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data".

A web dashboard that summarizes, ranks and interprets NASA's microgravity combustion investigations to deliver fire-safety insights for crewed missions. Every result shows where it came from, who calculated it, who audited it, and how much it can be trusted.

## Try it

**Live site: [flametrace.world](https://www.flametrace.world)**. On the sign-in page, click **Explore demo**: no account is needed.

What works on the public site: the opening animation, the 18 published findings with their confidence grades and proof (rows and DOI), the investigations browser, coverage gaps (what has no data), the interpretation lab, and the 3D station and habitat models. All of it is read from the Supabase database.

### Why the AI research assistant is offline on the public site

The chat ("Research assistant" panel) is offline on flametrace.world **by design, for security**. It runs an open model (Google's Gemma 4, `gemma4:e4b-it-qat`) with Ollama on the team's own GPU, and we do not expose that machine to the internet:

- no open ports on the internet, and no API keys in the browser;
- questions are never sent to a third-party AI service;
- the model only explains: every number in an answer comes from code (`scripts/chat_tools.py`) and is checked against the tool results before it is shown.

The demo video shows it answering. To run it yourself:

1. Install [Ollama](https://ollama.com), then `ollama pull gemma4:e4b-it-qat` (6.1 GB; fits in 8 GB of VRAM).
2. Install [uv](https://docs.astral.sh/uv/) and Node.js, then from the repository root: `uv sync`.
3. `cd dashboard`, `npm install`, `npm run dev`, and open http://localhost:5173. The chat's tools read `data/snapshot/`, which is in the repository. To use a model on another computer, see `dashboard/.env.example` (`OLLAMA_URL` and `OLLAMA_API_KEY`, through the gateway's `/llm` route).

**Future work:** a cloud-hosted chat (a serverless function that queries Supabase, with a hosted model and a daily question limit), so it no longer depends on the team's computers.

## How it works

Three AI agents work in sequence on NASA's public data:

1. **Investigator**: reads each investigation and proposes what is worth calculating.
2. **Calculator**: answers each question with code on the test tables and records the exact rows it used. It offers a chart or a graph when the data justifies one, and draws it on request.
3. **Auditor**: re-runs the calculation independently, checks units, ranges, citations and charts, and assigns a confidence grade.

The dashboard only shows results that went through all three. It has two views: **student** and **professional**.

## Structure

| Folder | Contents |
|---|---|
| `stages/` | Six numbered stages: ingest, normalize, investigate, calculate, audit and publish. Each has a `CONTEXT.md` that states what it reads, what it does and what it delivers |
| `_config/` | Shared context for the agents: challenge summary, tier table, crew environments, the two views, confidence grade, data schema, models |
| `data/snapshot/` | The normalized PSI data the Calculator and the Auditor read: a copy of the database made with `scripts.pull_db` (the database is the source of truth) |
| `.claude/` | The Investigator and Calculator agents and their commands (`/investigate`, `/ask`, `/chart`, `/graph`) |
| `schemas/` | Exact format of the data passed between stages, with examples |
| `scripts/` | Python tools for every deterministic step: download, normalize, query, calculate, check, chart |
| `supabase/` | `schema.sql`: the database tables |
| `dashboard/` | The React web app: login, demo view, 3D station, data sections and the local chat; reads from Supabase |
| `docs/` | Challenge text, PSI data inventory, Calculator output format, and the ICM paper |

To get started: `CONTEXT.md` gives the order of the stages and `CLAUDE.md` the working rules. The layout follows the ICM method (`docs/Interpretable Context Methodology.pdf`): numbered stage folders, with plain-text files as the contract between them.

## Technology

| Part | With | Runs on |
|---|---|---|
| Agents and scripts | Python | The team's computers, before the demo |
| Database | Supabase (Postgres) | Cloud |
| Dashboard | React + Vite (JavaScript) | Vercel |
| Charts | Vega-Lite (JSON) | Drawn by the dashboard |

```
PSI (NASA) → Python agents and scripts → Supabase → dashboard on Vercel
```

The agents never run on Vercel: the dashboard only reads results that are already verified.

## Calculator output

Each finding is one JSON file: the claim, a student summary, a professional summary, the values, the method, the evidence (rows and DOI), assumptions, limitations and warnings. Charts and graphs are created only when someone asks for them; by default the finding carries a footnote offering one.

Full spec: `docs/calculator-output.md`. Schema: `schemas/finding.schema.json`. Examples: `schemas/examples/`.

## Status

Setup: `uv sync` (needs uv and Python 3.12+); tests: `uv run python -m unittest discover -s scripts/tests -t .` and `uv run python -m unittest scripts.test_auditar` (see `CLAUDE.md`).

**Works now**

- **The database (Supabase) is the source of truth.** Tables `investigations` (24), `tests` (1982), `relations` (95), `tests_clean` and `measurements`. `uv run python -m scripts.pull_db` copies the first three into `data/snapshot/`; `--check` only says whether they differ.
- **Calculator:** read-only SQL over the snapshot, a tested calculation catalog (`o2_range`, `coverage_by_environment`, `sql_query`) and findings checked before they are saved (every number in the text must come from the computed values).
- **"No data" is not zero:** `coverage_by_environment` leaves out a fuel phase whose count would be 0 while some of its tests report no oxygen (solids and smoke for the lunar base). The chat says "No data for ..." for those phases.
- **Investigator:** records for all 24 investigations in `stages/03_investigar/output/investigations/`, with `tier-review.md` (5 investigations the brief names that the tier table keeps at Tier 2) and `questions.json` (9 candidate questions). `uv run python -m scripts.push_investigations` shows what would change in the database; after a person reviews the records, `--apply` updates the four Investigator columns and copies the database back into the snapshot. The agent itself can no longer rebuild the snapshot.
- **Auditor** (`scripts/auditar.py`): recalculates every value with code from the original NASA tables, never with the model, and grades each finding. Its model step (C8) needs Ollama.
- **Dashboard** ([flametrace.world](https://www.flametrace.world), on Vercel): opening animation (Monterrey, Mexico, then Earth and the station), login and demo view, student and professional views, findings with grades and evidence, investigations browser, coverage gaps, interpretation lab, 3D station and habitat models. It reads the `investigations`, `tests`, `relations` and `findings` tables. The chat in the "Research assistant" panel runs locally only (see "Try it").
- Charts (Vega-Lite 6) and proof graphs on request; agent commands `/investigate`, `/ask "<question>"`, `/chart F-001`, `/graph F-001`.
- `scripts/numbers.py` is now `scripts/number_check.py`: the old name hid the Python standard module `numbers` and crashed the Auditor.

**Findings and their grades**

18 audited findings are published in the `findings` table (F-001 to F-006, F-008 to F-014, F-016 to F-018, F-020, F-021), all with grade **C**. Grade C means every number was recalculated and matched, but the text review is not finished:

- C8 (is the text faithful to the evidence?) needs the Auditor's model run on the latest version of each finding, plus a person's answer to the questions it flags (`stages/05_auditar/output/reviews/F-XXX.json`).
- F-002 also fails C7: 0.2% of the cells it needs are unreadable. Inverse flames are left out: their oxygen is the burner stream, not the room.
- F-007 (rejected) and unaudited findings are never published.

**Waiting on teammates**

- **Database owner:** done: the pressure fix, the `findings` table in `supabase/schema.sql` and `scripts/load_snapshot.py` are merged, the database matches `pull_db`, and the audited findings are loaded (`uv run python -m scripts.push_findings --apply`; without `--apply` it only shows what would change).
- **Team:** review three Investigator records against PSI, every line of `tier-review.md`, and the use of `transit_vehicle`; then run `push_investigations --apply`. Tier changes go in `_config/tiers.md`.
- **Auditor and model:** see "Connecting the Auditor to a teammate's model" below.

## Connecting the Auditor to a teammate's model

The Auditor sends each text question to an Ollama server. The Auditor gateway (below) now puts an authenticated `/llm` route in front of the Auditor PC's Ollama. The requirements it meets:

- In `.env`: `OLLAMA_URL=http://<their address>:<port>` and `MODELO_AUDITOR=gemma4:e4b-it-qat` (the model in `_config/models.md`).
- The API must accept `POST <OLLAMA_URL>/api/chat` with the Ollama body (`model`, `messages`, `stream: false`, `think: false`, `format` with a JSON schema, `options`) and answer with the Ollama shape (`message.content`), because `OllamaModel` in `scripts/auditar.py` reads exactly that. The dashboard chat uses `/api/generate` and `/api/tags` on the same URL.
- Security: Ollama has no password. Expose only those routes and the one model, ask for a token, and do not open it beyond the local network. If the API asks for a token, `OllamaModel` must send it in a header: a two-line change in the Auditor file, to agree with its owner; keep the token only in `.env`.
- Use the same model and settings on every computer, so the same finding gets the same review.

## Interpretation lab

A first version is in the dashboard (the lab panel). The design follows.

The official path stays fixed: each finding uses one documented interpretation, so the Auditor can repeat it and the grade means something. The lab is a separate panel next to the chat to ask "what if I read the data differently?" and see whether a result holds (a sensitivity check). If a number barely moves across reasonable choices, the finding is robust; if it moves a lot, that is worth showing too.

- **Not a new agent.** It is one more read-only tool of the chat: code recomputes with the chosen options and shows option A next to option B; the model only explains the difference, and the chat number check still applies.
- **Always labeled "exploration, ungraded".** Nothing from the lab is a finding. A result worth keeping goes through `/ask` and the Auditor.
- **Variables to start with:**
  - Pressure column when a table has several: initial, mean or final (`pinit`, `pmean`, `pfinal`).
  - Oxygen read as a fraction or a percent (0.3 or 30), and mole versus volume fraction (treated as equal today).
  - Oxygen threshold: 30% (lunar habitat), 34% (the 8.2 psi atmosphere in PSI-20), or a custom value.
  - Pressure limit: 10.2 psi, 8.2 psi or a custom value.
  - Include or exclude inverse flames (CFI-G and Flame Design inverse report the burner stream, not the room).
  - Rows that are test days or ranges ("0.17; 0.21"): use the minimum, the maximum, or leave them out.
  - Tests with no oxygen or no pressure: leave them out (no data) or show them as their own group.
  - Tier filter: Tier 1 only, or all investigations.
- **Show next to each result:** how many tests each choice adds or drops, and which investigations they come from.

## Auditor gateway

`api/` exposes the Auditor over HTTP so the Calculator and Chatbot PCs can reach it: `POST /audit`, `GET /audits`, `GET /findings`, `GET /health`, and `/llm` (a narrow pass-through to the Auditor PC's Ollama for the dashboard chat: only the configured model, no streaming, `/api/generate` only for preloading; `api/routes/llm.py`). Every route except `/health` needs the `X-API-Key` header. Start it on the Wi-Fi/LAN address of the Auditor's PC (`ip -4 addr show wlp0s20f3`): `uv run uvicorn api.main:app --host 192.168.1.128 --port 8000` (set `API_KEY` in `.env`). Binding to that address means `localhost` does not work on that PC: use the LAN address there too. Open the port to the LAN only: `sudo ufw allow from 192.168.1.0/24 to any port 8000 proto tcp`. Router DHCP can change the address: reserve it in the router, or update `base_url` and `AUDITOR_URL` when it changes. To test across PCs, import `postman/NasaFlameFreefall.postman_collection.json` and `postman/local.postman_environment.json`, then set `base_url` and `api_key`. The Calculator PC runs `uv run python -m scripts.audit_client F-001`, and the Chatbot PC reads grades through `scripts/chat_tools.py`; both need `AUDITOR_URL=http://192.168.1.128:8000` and `AUDITOR_API_KEY` (the chatbot's launcher must export them: `chat_tools` does not read `.env`). Received findings and their audits are kept in `stages/05_auditar/output/gateway/` (git-ignored).

## Notes

> **Free Supabase projects pause.** The free plan pauses a project after 7 days without database activity, and judging starts on November 16, 2026. If a judge opens the demo while the database is paused, it will look empty.
> - Before submitting and during judging, open the Supabase dashboard and confirm the project is active. If it is paused, restore it with "Restore".
> - The dashboard falls back to the JSON copy in `dashboard/public/data/` when it cannot reach Supabase. Keep that copy current: stage 06 writes it on every publish.
> - Confirm the exact limit on Supabase's official pricing page; the 7-day figure comes from blog posts.

## Data

Source: [NASA PSI Data Repository](https://psi.nasa.gov/physci/repo/search?q=combustion), license CC0-1.0. PSI asks that each investigation be cited by its DOI; the dashboard shows the DOI next to every result. Details in `docs/datos-psi-inventario.md`.

### NASA data and resources

- **NASA Physical Science Informatics (PSI)**: the combustion investigations and their test tables (24 investigations, 1,982 tests). Every finding cites its investigation, file, rows and DOI.
- **NASA Scientific Visualization Studio**: the Earth map of the opening animation (`dashboard/public/textures/SOURCES.md`).
- **NASA GIBS / Blue Marble**: the regional imagery of northern Mexico in the opening (`dashboard/public/textures/SOURCES.md`).
- **NASA 3D resources**: the International Space Station model (NASA / Michael D. Carbajal; `dashboard/public/models/SOURCES.md`).

### Other data, resources and tools

- **Natural Earth**: the Nuevo León outline, public domain (`dashboard/public/data/geo/SOURCES.md`).
- **Software**: Python, DuckDB, FastAPI, uv; React, Vite, three.js, Vega-Lite; Supabase (Postgres); Vercel; Ollama. Packages and versions are pinned in `pyproject.toml`/`uv.lock` and `dashboard/package.json`/`package-lock.json`.

## Use of AI (SI) tools

- **Claude Code (Anthropic)** runs the Investigator and Calculator agents (`.claude/agents/`). It was also used to help write and review code, tests and documentation in this repository.
- **Gemma 4 (Google, open model, local with Ollama)** answers the Auditor's yes/no text checks (C8) and powers the local research assistant.
- **Every number** in a finding or a chat answer **comes from code**, never from a model. Code checks the text against the computed values before it is saved or shown (`scripts/number_check.py`, `dashboard/chat/checkNumbers.js`).
- The idea and the design of the solution are the team's.
