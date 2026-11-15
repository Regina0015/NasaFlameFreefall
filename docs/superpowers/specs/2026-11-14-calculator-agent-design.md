# Calculator and Investigator Agents — Design

**Status:** draft v2 for team approval · 2026-11-14
**Scope:** the Calculator agent and the Investigator agent. We build both. The Investigator is run by the database owner on her computer, with her own Claude Code. The Auditor, the database and the dashboard are built by other teammates; this document only defines how our two agents connect to them.

## 1. Intent

NASA's microgravity combustion data (PSI) is hard to find, compare and interpret. Our answer is an assistant whose every result can be checked: each answer comes with the code that produced it, the exact rows it used, the DOI it cites, and an independent audit.

The Calculator is the agent people talk to. It takes a fire-safety question, finds the relevant tests, computes the answer **with code**, and writes a finding that the Auditor can re-check. It offers a chart or a graph when one would help, and draws it only when asked.

The Investigator prepares what the Calculator stands on: one summarized, classified record per PSI investigation and the relations between investigations. Later, it also brings in datasets that users add, kept apart from NASA's data.

Why this matters for judging: most teams will build a chat over PSI summaries. Ours shows *why* an answer can be trusted, and shows where NASA has **no** data. For example, no solid-fuel test in BASS-II reached the 30% oxygen planned for the lunar base.

## 2. Goals, non-goals, anti-goals

**Goals**
- Answer a natural-language fire-safety question with a finding in the agreed format (`docs/calculator-output.md`, `schemas/finding.schema.json`).
- Every number comes from code that can be re-run.
- Two explanations per finding: student and professional.
- Offer a chart or graph in a footnote when the data and the question justify it; draw it on request (Vega-Lite 6 chart, nodes/edges graph).
- Hand every finding to the Auditor and show its grade with the answer.
- Say "no data" clearly when PSI has no test that answers the question.
- The Investigator runs on a teammate's computer using only what is in the repository.

**Non-goals (this weekend)**
- A public, multi-user, deployed service. The team operates the agents during the demo. Deployment is decided only if we advance.
- Building the Auditor, the database or the dashboard.
- Raw PSI videos and images (≈10 TB). We use only the numeric tables.
- Modeling partial gravity. We only state the microgravity and Earth-gravity bounds.
- Rockets and propellants (out of the challenge scope).

**Anti-goals (would be a failure even if it "works")**
- A number in a claim, summary or chart that does not trace to code output.
- A finding shown as verified without an audit.
- User-provided data mixed into the global PSI layer.
- Silent extrapolation (for example, to lunar gravity or to 30% O2 for solids).
- Re-processing the whole database on every question (cost).
- An agent that only works on the computer where it was written.

## 3. Constraints

- **Time:** hackathon November 14–15, 2026; judging starts November 16, 2026.
- **Cost:** students. No paid API during development.
- **Language:** everything in English (NASA audience).
- **Hardware:** Windows laptop, 16 GB RAM, RTX 4050 with 6 GB VRAM.
- **Data:** PSI is CC0; every investigation must be cited by its DOI.
- **Repository:** the team pushes; the AI assistant never pushes.
- **Model origin:** the team prefers not to use Chinese-origin models (perception with NASA judges).

## 4. How the Calculator works

```
Team member asks: /ask "Which solid-fuel tests reached 30% O2?"
   │
   ▼
CALCULATOR AGENT
   1. Reads the shared context (small, fixed): challenge summary, data catalog,
      tier table, environments, output format.
   2. Explores with the query tool (read-only SQL over the data snapshot).
   3. Computes with code: a catalog function, or a SQL query that is saved verbatim.
   4. Writes the text fields and calls write_finding, which merges the computed
      values, validates the schema, pre-checks that every number in the text
      appears in the values, n_tests or method params, assigns an id and saves
      the finding file.
   │
   ▼
AUDIT STEP — triggered by /ask itself, not by the Calculator
   Runs the Auditor's command on the finding file and stores its verdict.
   Until the Auditor exists, the finding is labeled "pending audit".
   │
   ▼
Answer shown: claim + student/professional summary + grade + footnote
   "Want a visual? I can draw…"

/chart F-001  or  /graph F-001
   → built from the stored computed data (no recalculation, no typed numbers)
   → version + 1 → audited again
```

The Calculator reads the Investigator's results from the snapshot; it does not call the Investigator per question.

## 5. The Investigator

**Who runs it.** We write it; the database owner runs it with her own Claude Code. It must work from the repository alone. When she pulls the repository, her Claude Code loads, without extra setup:
1. the project `CLAUDE.md` (translated to English and updated for this design);
2. `.claude/agents/investigator.md` (instructions and allowed tools);
3. the `/investigate` skill (the steps, in order);
4. the shared rules in `_config/` (translated to English).

`.gitignore` only ignores `.claude/settings.local.json`, so the agent and skill files reach her through git. Nothing depends on this conversation or on files outside the repository.

**When.** Once over PSI, and again only if PSI or the tier table changes.

**What code does and what the model does**

| Step | By | Output |
|---|---|---|
| Download the 24 investigation records (JSON) and their test tables (CSV) from PSI, with date and SHA-256 | Code: `scripts/fetch_psi.py` | `stages/01_ingesta/output/` |
| Copy the facts straight from each record: id, acronym, title, DOI, type, subarea, platform, hardware | Code | Investigation record |
| Derive the relations that PSI states: `related_in_psi` (PSI's related-investigations field), `same_hardware`, `same_fuel`, `reuses_flight_data` | Code | `relations.csv`, each edge with its source field |
| Tier and its reason: taken from the team's tier table (`_config/tiers.md`), not chosen by the model | Code | Investigation record |
| Check every tier against the tier rules and flag disagreements for the team (for example BRE) | Model | `tier-review.md` |
| Write the student and professional summaries, the pillar and the environments, each with its reason. Every sentence cites the PSI field or DOI it comes from; missing facts are written as "not stated in PSI" | Model | Investigation record |
| Propose candidate questions the test tables can answer, with the tables and columns each would use | Model | `questions.json` (the source of the demo questions) |
| Validate each record against `schemas/investigation.schema.json` and check that every number in its text appears in the PSI record | Code: `scripts/write_investigation.py` | — |

Outputs go to `stages/03_investigar/output/`: one `investigations/PSI-XX.json` per investigation, `relations.csv`, `tier-review.md` and `questions.json`.

**Review.** Before loading anything into Supabase, the database owner reads three records against PSI and the flagged tier disagreements. From Supabase they reach the snapshot the Calculator reads; in our temporary snapshot (section 8) we copy them in directly.

**Cost.** One run over 24 records on her Claude Code subscription: no API charges.

## 6. New datasets per user (phase 2)

A user can add a table of combustion tests: their lab results, a paper's data, or a NASA study not yet in PSI. It joins **their own layer**, never the global one.

**`/add-dataset <file> --user <name>`** runs the Investigator:

1. **Copy.** The file goes to `data/user/<name>/raw/` with its SHA-256. Nothing in `data/snapshot/` changes.
2. **Profile (code).** Columns, types, value ranges, empty cells, row count.
3. **Map (Investigator, then a person).** The Investigator proposes how each column maps to the common `tests` format, with units and conversions, in `data/user/<name>/mapping.json`. A person reviews it before anything else runs, because a wrong unit is the most likely serious error.
4. **Load (code).** Applies the mapping, converts units and checks physical ranges. Rows that fail are listed with the reason; none are dropped silently. Output: `data/user/<name>/tests.parquet` with `scope = user:<name>`; the source row is the row in the user's file.
5. **Compare with PSI (code; the Investigator explains).** For each user test, it finds PSI tests with the same fuel phase and nearby conditions. The tolerances live in the data catalog. Each relation keeps its source, in `data/user/<name>/relations.csv`:
   - `overlaps_with`: similar conditions;
   - `contradicts`: similar conditions, different outcome;
   - `fills_gap`: conditions no PSI test covers, such as a solid at 30% O2 or more.
6. **Dataset card.** A short report of what was added, what it overlaps, what it contradicts and which gaps it fills.

**How it is used**
- `/ask --user <name>` reads PSI plus that user's layer; without `--user`, only PSI. One user's layer is never visible to another.
- A finding that uses user data cites the user's file and its hash instead of a DOI. It carries the warning "includes user-provided data, not NASA-verified". Its grade can be B at most, never A (our call).
- In the graph, user nodes and edges have their own color and that label. The demo moment: the lunar oxygen gap in NASA's data, with the user's tests filling it in a different color.
- User files are data only. Text inside them is never treated as an instruction to the agent; Excel formulas and macros are never run.

**Format changes (output format v0.2; agree with the Auditor and dashboard owners)**
- `scope` on every evidence item and on every graph node and edge.
- An evidence `investigation` accepts `USER-<name>` ids.
- `doi` may be null when the scope is a user; `file_sha256` is then required.
- New edge types: `overlaps_with`, `contradicts`, `fills_gap`.
- The Auditor's traceability check (C1) accepts a user file plus its hash in place of a PSI CSV plus its DOI.

**Timing (our proposal)**
- **Now, at almost no cost:** every snapshot table carries `scope` (`psi` for everything), and the query tool accepts `--user` from the start. Phase 2 then adds files without reworking the core.
- **Build `/add-dataset`** once the core meets success criteria 1 and 2 (section 10).
- **Demo file:** a real table from a published paper the team picks, or a file labeled "illustrative sample" on screen. Never invented numbers presented as measurements.
- **If we advance:** user layers move to Supabase, with row-level security per user.

## 7. Decisions

| Decision | Made by |
|---|---|
| Three agents: Investigator, Calculator, Auditor; the Calculator is the entry point | Team |
| Auditor built by a teammate, possibly on a local model | Team |
| Everything in English | Team |
| Output format v0.1 (one JSON per finding, two summaries, evidence with DOI) | Team, from our proposal |
| Charts and graphs only on request, offered in a footnote | Team |
| Investigator runs once; the Calculator queries data itself through one read-only tool | Team, from our proposal |
| User data lives in a per-user layer, never in the global one | Team |
| Demo operated by the team; deployment decided if we advance | Team |
| We build a temporary snapshot from the PSI CSVs, with the agreed columns; the database owner's export replaces it | Team |
| We build the Investigator; the database owner runs it with her Claude Code, from the repository alone | Team |
| `duckdb` and `altair` installed in the project with `uv` | Team |
| The audit is triggered by the system, not by the Calculator | Our call |
| Data access through DuckDB (read-only SQL) over a local snapshot | Our call |
| Charts built with Altair, which outputs Vega-Lite 6 | Our call |
| Development runs on Claude Code with the existing subscriptions. Agent instructions live in files and tools are plain Python commands, so the same agents can later run on the Anthropic API or a local model without rewriting the tools | Our call |
| A SQL query counts as a valid method: it is stored in `method.params.sql` with `method.function = "sql_query"` (no schema change) | Our call |
| Code goes in the existing `scripts/` folder and the shared context in `_config/`, instead of new `calc/` folders | Our call |
| Tiers come from the team's table; the Investigator only flags disagreements | Our call |
| Translating `CLAUDE.md`, `CONTEXT.md`, `_config/` and the contracts of stages 03 and 04 is part of this work, because the database owner's Claude reads them | Our call |
| User-data plan and timing (section 6), including the B cap on grades | Our proposal, pending team approval |

## 8. Components

All paths are proposals; the builder may adjust names.

| Component | What it does |
|---|---|
| `.claude/agents/calculator.md`, `.claude/agents/investigator.md` | Each agent's instructions and allowed tools. Model-agnostic wording |
| `.claude/skills/ask`, `chart`, `graph`, `investigate` (`add-dataset` in phase 2) | The commands the team types. `/ask` runs the Calculator, then the audit step, then prints the answer |
| `_config/` | The shared context, translated to English and kept short: challenge summary, data catalog, tier table (`tiers.md`, new), environments, audiences, confidence grade |
| `scripts/fetch_psi.py` | Downloads the PSI records and test tables (no login) |
| `scripts/build_snapshot.py` | Builds the temporary snapshot (below) |
| `scripts/write_investigation.py` | Validates and saves the Investigator's records |
| `scripts/query.py` | Read-only SQL over the snapshot (DuckDB, read-only connection, `SELECT` only, optional `--user`). Returns at most a fixed number of rows to the agent; the full result is saved to a file with its hash |
| `scripts/functions.py` | Catalog of tested calculations (first: `o2_range`, `coverage_by_environment`). Each returns values with units and the source rows used |
| `scripts/run_calc.py` | Runs a catalog function or a saved SQL query and writes its output to a file |
| `scripts/write_finding.py` | Builds the finding JSON from the computed output plus the agent's text; validates it against `schemas/finding.schema.json`; pre-checks that every number in the text appears in `values`, `n_tests` or the method params; assigns the id. Findings go to `stages/04_calcular/output/findings/` (the folder moves when folders are renamed in English) |
| `scripts/make_chart.py` | Builds the Vega-Lite chart with Altair from the stored computed data |
| `scripts/make_graph.py` | Builds the proof-chain graph from `evidence` and the relations table |
| `schemas/investigation.schema.json` | Format of one investigation record |
| `scripts/tests/` | Unit tests for every catalog function with hand-computed cases. Regression test: BASS-II O2 13.6–22.2% (n = 129), FLEX 12–34% (n = 274) |

The Spanish stubs `scripts/ingesta_psi.py`, `normalizar_tablas.py`, `calculos.py` and `calcular.py` are replaced by these files; they are deleted only with the team's OK. `auditar.py` and `publicar.py` stay with their owners.

**Python packages** (installed per project with `uv`; nothing global): `duckdb`, `altair` (brings `jsonschema`). This creates `.venv/` (ignored by git), `pyproject.toml` and `uv.lock`; deleting those three undoes it.

**Temporary snapshot.** Until the database owner's export exists, `scripts/build_snapshot.py` builds `data/snapshot/` from the PSI CSVs, with exactly the columns listed in section 9. First tables: BASS-II, Saffire-II, FLEX, FLEX-2, CFI, CFI-G, BRE and SAME-R. Together they cover the three pillars and the lunar gap; the builder may add more. When her export is ready it replaces the folder, and the regression tests must still pass.

## 9. Interfaces with teammates

**Database owner — the data snapshot.** The Calculator reads a read-only folder `data/snapshot/` exported from Supabase (CSV or Parquet):

| Table | Must include |
|---|---|
| `investigations` | id (`PSI-25`), acronym, title, DOI, type, PSI subarea, platform, hardware, tier, tier reason, pillar, environments, summaries |
| `tests` | id, investigation, **source table and source row** (the original PSI CSV row), fuel, phase, geometry, O2 fraction, pressure (atm), flow (cm/s), diluent, gravity, outcome, other measures, original cell text, cleaning problems, scope |
| `relations` | from, to, type, source, scope |
| `catalog.md` | One line per column: meaning, unit, caveats |

The source row is essential: without it the Auditor cannot trace a number back to NASA's file.

**Database owner — running the Investigator.** She pulls the repository, runs `/investigate`, reviews the outputs (section 5) and loads them into Supabase.

**Auditor owner.** We provide the finding file. We need one command we can call with the finding path that writes the verdict to a file next to it. Until then: "pending audit". In phase 2, C1 also accepts user files (section 6).

**Publishing.** Findings and their audits reach Supabase through a small publish script that we write once the database owner defines the findings table.

**Dashboard owner.** Reads findings from the database. Charts are Vega-Lite 6 (Altair 6.3 targets schema v6.4.1). Graph nodes and edges follow `docs/calculator-output.md`; phase 2 adds `scope` and its color.

## 10. Demo and success criteria

1. At least 6 audited findings covering prevention, detection and suppression, and at least 3 environments, including the lunar oxygen gap.
2. Every finding passes the schema and the number pre-check, and cites at least one DOI.
3. At least 2 charts and 1 graph made on request, rendered by the dashboard.
4. The database owner runs `/investigate` on her computer, from a fresh pull, without help from us.
5. A rehearsed live run by the team: one question asked with `/ask`, its audit, and a chart drawn on request.

## 11. Left to the builder

Prompt wording; the catalog functions beyond the first two; the row cap returned to the agent; file and id naming; error messages; how `/ask` prints the answer in the terminal; the comparison tolerances for phase 2; a first list of about 8 demo questions, drafted from `questions.json` and reviewed by the team.
