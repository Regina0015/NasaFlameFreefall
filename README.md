# FlameTrace — Flame in Freefall

**Fire-safety insights from NASA's microgravity combustion data, where every result can be checked.**

Team NasaTwisters · NASA Space Apps Challenge 2026 · Challenge: *Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data*

**Live site: [flametrace.world](https://www.flametrace.world)**. On the sign-in page, click **Explore demo**: no account is needed.

## What it is

FlameTrace is a web dashboard that summarizes, ranks and interprets NASA's microgravity combustion investigations from the Physical Science Informatics (PSI) repository (24 investigations, 1,982 tests). It delivers fire-safety insights for crewed missions: spacecraft, space stations, lunar and Martian bases, and pressurized rovers.

Large language models can state wrong numbers with full confidence, and in fire safety for crewed missions that is unacceptable. FlameTrace follows one rule: **the AI decides what to compute; code computes it.** No number on the dashboard comes from a model's memory. Every result shows its proof chain (claim, calculation, table rows, DOI) and a confidence grade from an independent audit.

## What you can do on the site

- **Findings**: answers to fire-safety questions, each with its confidence grade, the checks it passed or failed, and its evidence down to the rows of NASA's tables and the DOI.
- **Two views**: *student* (plain language) and *professional* (fuel, configuration, conditions, measurements).
- **Investigations browser**: every PSI combustion investigation, with summaries, its fire-safety pillar (prevention, detection or suppression) and the crewed environments it applies to.
- **Coverage gaps**: what NASA has not tested yet. "No data" is never shown as zero; for example, PSI has no partial-gravity data, and the dashboard says so instead of guessing about the Moon or Mars.
- **Interpretation lab**: checks whether a result holds under a different reasonable reading of the data. Clearly labeled as exploration, not a finding.
- **3D models**: the International Space Station and a conceptual habitat, and an opening that starts over Monterrey, Mexico.
- **Research assistant (chat)**: answers questions by querying the data with tools. See "The research assistant" below.

## How it works

```
NASA PSI data → Investigator → Calculator → Auditor → Supabase → dashboard (flametrace.world)
```

Three AI agents work on NASA's public data:

1. **Investigator** reads each PSI investigation and writes a structured record: student and professional summaries, fire-safety pillar and crewed environments. Every statement must cite the PSI field it comes from; a validator in code rejects anything without a source.
2. **Calculator** answers a question by choosing a tested calculation from a catalog, or writing one read-only SQL query. Python runs it on the test tables and records the exact rows used. The model writes the explanation, and a checker rejects any number in the text that the calculation did not produce.
3. **Auditor** recalculates every value with separate code and runs ten checks: format, traceability to real rows and DOIs, fidelity to the original cells, recalculation, units and physical ranges, number of supporting tests, whether the claim stays inside the tested conditions, data quality, faithful text, and charts. For the text review it uses an open model from a different family (Google's Gemma 4, run locally), on purpose, so the two agents do not share the same mistakes. That model only answers a fixed yes/no checklist with structured output; code answers everything numeric.

The result is a **confidence grade that no model chooses**:

| Grade | Meaning |
|---|---|
| **A** High | Every check passes, with broad support and clean data |
| **B** Medium | Passes, with limited support or minor data problems (the warning is shown) |
| **C** Low | The numbers pass, but the text review is open, the claim extrapolates, or data quality is low: shown as an indication, not a conclusion |
| **No data** | No test answers the question: shown as a knowledge gap |
| **Rejected** | A core check fails: never published |

Model alerts can only be dismissed by a person, with their name and reason, and the review is tied to the exact version of the finding. Code checks can never be dismissed. Full rules: [`_config/confidence.md`](_config/confidence.md).

**Current state:** 18 findings are published, all graded **C**. Every number was recalculated and matched; the text review (check C8) is still open for each one. The system does not raise a grade until that review is done.

## The research assistant

The chat answers questions in English by calling three tools on the data (`query_tests`, `check_environment`, `get_findings`). Before an answer is shown, code verifies that every number in it exists in the tool results. When a question touches the Moon or Mars, it always adds that PSI has no partial-gravity data.

It is **offline on the public site by design, for security.** It runs an open model (Google's Gemma 4, `gemma4:e4b-it-qat`) with Ollama on the team's own GPU, and we do not expose that machine to the internet: no open ports, no API keys in the browser, and questions are never sent to a third-party AI service. The demo video shows it answering.

To run it yourself:

1. Install [Ollama](https://ollama.com), then `ollama pull gemma4:e4b-it-qat` (6.1 GB; fits in 8 GB of VRAM).
2. Install [uv](https://docs.astral.sh/uv/) and Node.js, then from the repository root run `uv sync`.
3. `cd dashboard`, `npm install`, `npm run dev`, and open http://localhost:5173. The chat's tools read `data/snapshot/`, which is in this repository.

Example question: *"Did any solid fuel tests reach the lunar habitat oxygen level of 30 percent?"*

## Built with

| Part | Technology |
|---|---|
| Data | NASA PSI, DuckDB, Supabase (Postgres) |
| Agents and checks | Python; Claude Code (Investigator, Calculator); Gemma 4 with Ollama (Auditor text checks, chat) |
| Auditor gateway | FastAPI |
| Dashboard | React, Vite, three.js, Vega-Lite, deployed on Vercel |

## NASA data and resources

- **[NASA PSI Data Repository – Combustion Science](https://psi.nasa.gov/physci/repo/search?q=combustion)** (CC0-1.0): 24 investigations and 1,982 tests. Every finding cites its investigation, file, rows and DOI. Details in [`docs/datos-psi-inventario.md`](docs/datos-psi-inventario.md).
- **[NASA Scientific Visualization Studio](https://svs.gsfc.nasa.gov/3615)**: the Earth map in the opening.
- **[NASA GIBS](https://gibs.earthdata.nasa.gov/)**, Blue Marble: the regional imagery of northern Mexico in the opening.
- **NASA 3D Resources**: the International Space Station model (NASA / Michael D. Carbajal).

Other resources: [Natural Earth](https://www.naturalearthdata.com/) (Nuevo León outline, public domain) and the open-source software above. The origin and license of every asset is in the `SOURCES.md` files under `dashboard/public/`.

## Use of AI (SI) tools

- **Claude Code (Anthropic)** runs the Investigator and Calculator agents (`.claude/agents/`), and helped write and review code, tests and documentation in this repository.
- **Gemma 4 (Google, open model, run locally with Ollama)** answers the Auditor's yes/no text checks and powers the research assistant.
- **Every number** in a finding or a chat answer **comes from code**, never from a model. Code checks the text against the computed values before it is saved or shown (`scripts/number_check.py`, `dashboard/chat/checkNumbers.js`).
- The idea and the design of the solution are the team's.

## Future work

- A cloud-hosted research assistant (a serverless function that queries the database, with a hosted model and a daily question limit), so it no longer depends on the team's computers.
- Finish the text review of the published findings, so they can reach grades A and B.
- Add partial-gravity data when NASA publishes it (LUCI, FM2).

## For developers

| Folder | Contents |
|---|---|
| `stages/` | The pipeline in six numbered stages (ingest, normalize, investigate, calculate, audit, publish), each with a `CONTEXT.md` contract |
| `_config/` | Shared context: challenge summary, tiers, crewed environments, audiences, confidence grade, data schema, models |
| `data/snapshot/` | The normalized PSI data the agents read |
| `.claude/` | The Investigator and Calculator agents and their commands (`/investigate`, `/ask`, `/chart`, `/graph`) |
| `scripts/` | Python tools for every deterministic step, and their tests |
| `api/` | The Auditor gateway (FastAPI) |
| `schemas/` | JSON Schemas of the files passed between stages |
| `supabase/` | The database tables |
| `dashboard/` | The web app (see [`dashboard/README.md`](dashboard/README.md)) |
| `docs/` | Challenge text, PSI data inventory, finding format, demo questions |

Setup: `uv sync` (Python 3.12+). Tests: `uv run python -m unittest discover -s scripts/tests -t .` and, in `dashboard/`, `npm test`. Working rules: [`CLAUDE.md`](CLAUDE.md); stage order: [`CONTEXT.md`](CONTEXT.md); team notes: [`docs/development-notes.md`](docs/development-notes.md).
