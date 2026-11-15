# NasaTwisters — Flame in Freefall

Project for the NASA Space Apps Challenge 2026, challenge "Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data".

A web dashboard that summarizes, ranks and interprets NASA's microgravity combustion investigations to deliver fire-safety insights for crewed missions. Every result shows where it came from, who calculated it, who audited it, and how much it can be trusted.

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
- **Dashboard:** login and demo view, 3D station model, the investigations section reading the `investigations` table, and the local chat in the "Research assistant" panel (`npm run dev` only).
- Charts (Vega-Lite 6) and proof graphs on request; agent commands `/investigate`, `/ask "<question>"`, `/chart F-001`, `/graph F-001`.
- `scripts/numbers.py` is now `scripts/number_check.py`: the old name hid the Python standard module `numbers` and crashed the Auditor.

**Findings and their grades (without the model, so C8 is still open)**

| Finding | Grade now | What is missing |
|---|---|---|
| F-001, F-006, F-008, F-009 | C | C8 (needs Ollama) |
| F-003, F-004, F-005 | C | C8, and a person answers Q8 (does the SQL answer the question?) in `stages/05_auditar/output/reviews/F-XXX.json` |
| F-007 | rejected | C8 and Q8: a no-data finding must pass the text review |
| F-002 (v5) | C | C7 (0.2% of the cells it needs are unreadable) and C8. Inverse flames are left out: their oxygen is the burner stream, not the room |

**Waiting on teammates**

- **Database owner:** done: the pressure fix, the `findings` table in `supabase/schema.sql` and `scripts/load_snapshot.py` are merged, and the database matches `pull_db`. Next: a person runs `uv run python -m scripts.push_findings --apply` to load the audited findings into the `findings` table (without `--apply` it only shows what would change; rejected and unaudited findings are never sent).
- **Team:** review three Investigator records against PSI, every line of `tier-review.md`, and the use of `transit_vehicle`; then run `push_investigations --apply`. Tier changes go in `_config/tiers.md`.
- **Auditor and model:** see "Connecting the Auditor to a teammate's model" below.

## Connecting the Auditor to a teammate's model

The Auditor sends each text question to an Ollama server. A teammate on the same network is building an API in front of their Ollama. For the Auditor to use it without changes:

- In `.env`: `OLLAMA_URL=http://<their address>:<port>` and `MODELO_AUDITOR=gemma4:e4b-it-qat` (the model in `_config/models.md`).
- The API must accept `POST <OLLAMA_URL>/api/chat` with the Ollama body (`model`, `messages`, `stream: false`, `think: false`, `format` with a JSON schema, `options`) and answer with the Ollama shape (`message.content`), because `OllamaModel` in `scripts/auditar.py` reads exactly that. The dashboard chat uses `/api/generate` and `/api/tags` on the same URL.
- Security: Ollama has no password. Expose only those routes and the one model, ask for a token, and do not open it beyond the local network. If the API asks for a token, `OllamaModel` must send it in a header: a two-line change in the Auditor file, to agree with its owner; keep the token only in `.env`.
- Use the same model and settings on every computer, so the same finding gets the same review.

## Idea for the dashboard: an interpretation lab (not built yet)

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

`api/` exposes the Auditor over HTTP so the Calculator and Chatbot PCs can reach it: `POST /audit`, `GET /audits`, `GET /findings`, `GET /health`. Every route except `/health` needs the `X-API-Key` header. Start it on the Wi-Fi/LAN address of the Auditor's PC (`ip -4 addr show wlp0s20f3`): `uv run uvicorn api.main:app --host 192.168.1.128 --port 8000` (set `API_KEY` in `.env`). Binding to that address means `localhost` does not work on that PC: use the LAN address there too. Open the port to the LAN only: `sudo ufw allow from 192.168.1.0/24 to any port 8000 proto tcp`. Router DHCP can change the address: reserve it in the router, or update `base_url` and `AUDITOR_URL` when it changes. To test across PCs, import `postman/NasaFlameFreefall.postman_collection.json` and `postman/local.postman_environment.json`, then set `base_url` and `api_key`. The Calculator PC runs `uv run python -m scripts.audit_client F-001`, and the Chatbot PC reads grades through `scripts/chat_tools.py`; both need `AUDITOR_URL=http://192.168.1.128:8000` and `AUDITOR_API_KEY` (the chatbot's launcher must export them: `chat_tools` does not read `.env`). Received findings and their audits are kept in `stages/05_auditar/output/gateway/` (git-ignored).

## Notes

> **Free Supabase projects pause.** The free plan pauses a project after 7 days without database activity, and judging starts on November 16, 2026. If a judge opens the demo while the database is paused, it will look empty.
> - Before submitting and during judging, open the Supabase dashboard and confirm the project is active. If it is paused, restore it with "Restore".
> - The dashboard falls back to the JSON copy in `dashboard/public/data/` when it cannot reach Supabase. Keep that copy current: stage 06 writes it on every publish.
> - Confirm the exact limit on Supabase's official pricing page; the 7-day figure comes from blog posts.

## Data

Source: [NASA PSI Data Repository](https://psi.nasa.gov/physci/repo/search?q=combustion), license CC0-1.0. PSI asks that each investigation be cited by its DOI; the dashboard shows the DOI next to every result. Details in `docs/datos-psi-inventario.md`.
