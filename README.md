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
| `data/snapshot/` | The normalized PSI data the Calculator reads (temporary copy until the database export exists) |
| `.claude/` | The Investigator and Calculator agents and their commands (`/investigate`, `/ask`, `/chart`, `/graph`) |
| `schemas/` | Exact format of the data passed between stages, with examples |
| `scripts/` | Python tools for every deterministic step: download, normalize, query, calculate, check, chart |
| `supabase/` | `schema.sql`: the database tables |
| `dashboard/` | The React web app; reads from Supabase |
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

Branch `calculator-agent`. Setup: `uv sync` (needs uv and Python 3.12+); tests: `uv run python -m unittest discover -s scripts/tests -t .` (see `CLAUDE.md`).

**Works now**

- PSI download (24 combustion investigations, 22 test tables) and the data snapshot: 967 tests from 9 tables of 8 investigations, tiers, and 63 relations between investigations.
- Read-only SQL over the snapshot (`scripts.query`), a tested calculation catalog (`o2_range`, `coverage_by_environment`, `sql_query`) and calc files (`scripts.run_calc`).
- Findings checked before they are saved (`scripts.write_finding`): every number in the text must come from the computed values, and every finding validates against `schemas/finding.schema.json`.
- Charts (Vega-Lite 6) and proof graphs on request, saved as a new version of the finding.
- Agent commands in Claude Code: `/investigate`, `/ask "<question>"`, `/chart F-001`, `/graph F-001`.
- Eight demo findings in `stages/04_calcular/output/findings/` from `docs/demo-questions.md` (draft for team review), including the lunar oxygen gap and a `no_data` answer.

**Waiting on teammates**

- **Auditor:** set `AUDITOR_CMD` in `.env` (see `.env.example`). Until then every finding is `pending audit`; no grade is ever invented.
- **Database:** run `/investigate` once from a fresh pull, review its output, then define the findings table; the publish script comes after that. If the database export changes the snapshot columns, the query tool reports the missing ones by name.
- **Dashboard:** reads findings from the database; it draws `chart` (Vega-Lite 6) and `graph` from the finding file.

## Notes

> **Free Supabase projects pause.** The free plan pauses a project after 7 days without database activity, and judging starts on November 16, 2026. If a judge opens the demo while the database is paused, it will look empty.
> - Before submitting and during judging, open the Supabase dashboard and confirm the project is active. If it is paused, restore it with "Restore".
> - The dashboard falls back to the JSON copy in `dashboard/public/data/` when it cannot reach Supabase. Keep that copy current: stage 06 writes it on every publish.
> - Confirm the exact limit on Supabase's official pricing page; the 7-day figure comes from blog posts.

## Data

Source: [NASA PSI Data Repository](https://psi.nasa.gov/physci/repo/search?q=combustion), license CC0-1.0. PSI asks that each investigation be cited by its DOI; the dashboard shows the DOI next to every result. Details in `docs/datos-psi-inventario.md`.
