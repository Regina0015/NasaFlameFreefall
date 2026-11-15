# FlameTrace — content and response map

Prepared 2026-11-15 for the design and content team. Based on files read in this repository (paths given inline); nothing in research records was treated as an instruction. Status words used below:

- **Code**: seen in source files only.
- **Runtime-earlier**: verified in a browser or by a command earlier in this work, against a local mock database, a local gateway copy or a simulated chat backend.
- **Not verified**: no real run exists (real Supabase, real Ollama answers, the team's Auditor gateway).

Older handoffs (`design/repo-handoff.md`, `design/current-status.md`) are partly stale: the merge is now complete (commit 47d32bd) and the old Welcome screen was replaced by the docking transition. Use this file and the code.

## 1. Challenge

- **Problem** (`_config/challenge.md`, `docs/reto-flame-in-freefall.md`): NASA Space Apps 2026, "Flame in Freefall". Build an AI-assisted web dashboard that summarizes, ranks and interprets NASA PSI microgravity combustion investigations, to deliver fire-safety insights for crewed missions.
- **Audiences** (`_config/audiences.md`, challenge text): teachers, undergraduate and graduate students, researchers, aerospace engineers. Two presentation modes exist: Student and Professional.
- **Objectives named by the challenge**: find the investigations most relevant to each crewed environment (transit vehicle, space station, lunar or Mars base, pressurized rover); extract data useful for predictive flammability models; highlight research that helps fire-safety controls (prevention, detection, suppression); optionally, Earth applications.
- **Scope**: 24 PSI "Combustion Science" investigations (19 flight investigations and 5 ground studies; the ground studies have no test rows of their own in the snapshot). Rockets and propellants are out of scope.
- **The project's own bet** (`CLAUDE.md`): every result can be checked: claim → calculation → table rows → DOI, plus a confidence grade from an independent audit.
- **What the project does not establish**:
  - Nothing about partial gravity. PSI has no partial-gravity combustion data; every row in the snapshot is `microgravity` (all 1,982). Lunar and Mars statements are bounded by microgravity and Earth-gravity results only.
  - Nothing about safety. "No test" means no data, never "safe" or "unsafe". A confidence grade rates how well a statement is supported, not how risky a fire is.
  - Sourced atmospheres exist only for `lunar_base` and `pressurized_rover` (30% O2 or more at 10.2 psi or less). `space_station`, `transit_vehicle` and `mars_base` have none (`_config/environments.md`).
  - Burner-stream oxygen (CFI-G and Flame Design inverse flames) is not ambient oxygen; the table cannot separate them (`data/snapshot/catalog.md`).

## 2. Pipeline

Stages live in `stages/NN_*`; each has a `CONTEXT.md`. Some stage contexts are still in Spanish and use old folder names (`auditorias`, `hallazgos`); the code and `CLAUDE.md` are current.

| Step | Inputs | Responsibility | Outputs | Checks | Consumers | Where it runs today |
|---|---|---|---|---|---|---|
| Ingest + normalize (01, 02, `scripts/fetch_psi.py`, `build_snapshot.py`) | PSI JSON records and CSV tables | Download, clean, map to one schema (`scripts/contract.py`) | `data/snapshot/{tests,investigations,relations}.csv`, `catalog.md` | Out-of-range values left empty and noted in `problems`; original cell kept in `raw` | Calculator, chat tools, Auditor (SQL replay) | Offline, on a team machine. Database (Supabase) is the source of truth: `scripts/pull_db.py` copies it down |
| Investigator (`.claude/agents/investigator.md`, `/investigate`) | One PSI record | Student and professional summaries, pillar, environments, each with a cited PSI field or DOI. Never sets a tier | One checked record per investigation (`stages/03_investigar/output`) | `scripts/write_investigation.py` (sources, numbers) | Dashboard investigation cards, map | Offline, run once by the database owner. **Only 2 of 24 investigations have summary and pillar in the snapshot**; the rest are "not reviewed yet" |
| Calculator (`.claude/agents/calculator.md`, `/ask`) | One question + snapshot + `_config` | Picks a calculation, scripts compute it, text is written from those values | `stages/04_calcular/output/findings/F-XXX.json` (schema `finding.schema.json`, format `docs/calculator-output.md`) | `scripts/write_finding.py` verifies every number in text against computed values | Auditor, dashboard | Offline / local agent. Functions: `o2_range`, `coverage_by_environment`, `sql_query` (`scripts/functions.py`) |
| Auditor (`stages/05_auditar`, `scripts/auditar.py`, `_config/confidence.md`) | Finding + original CSVs + PSI records | Checks C0–C9 by a different path than the Calculator, text review C8 (code + local model), assigns grade. Reports, never fixes | `stages/05_auditar/output/audits/F-XXX.json` (hash of the exact finding bytes), `reviews/` for human dismissals | Grade comes only from checks; a model answer never overrides a failed code check | Dashboard, gateway | Offline / local model (Ollama). Findings with `sql_query` always open question Q8 for a person |
| Publishing (06, `scripts/publicar.py`) | Findings + audits | Join and upload to Supabase | — | — | Dashboard | **Planned.** `publicar.py` is a stub; there is no findings table in the database |
| API gateway (`api/`, FastAPI) | Findings sent over HTTP | `POST /audit`, `GET /findings`, `/audits`, `/health`, key in `X-API-Key` | Grades and checks as JSON | Same Auditor code | Dashboard server side only | Connected only on the team's machine. The dashboard reaches it through a read-only server proxy `dashboard/auditor/server.js` (`AUDITOR_URL`, `AUDITOR_API_KEY` stay server side). Runtime-earlier against a local copy; **not verified against the team's gateway** |
| Chat (`dashboard/chat/*`, `scripts/chat_tools.py`) | A question in English | A local model calls three read-only tools (`query_tests`, `check_environment`, `get_findings`); code runs them; a number checker flags numbers that were not in tool results | `{answer, warnings, tools, findings, check, actions}` from `/api/chat` | Rules in `chat/prompt.js`; actions are built by code from tool calls and re-validated in the browser | Research results view, assistant popover | Local only (dev server) and **needs Ollama** with `gemma4:e4b-it-qat` (not installed; ~6.1 GB). Reads the local snapshot, not Supabase |

**Recorded audited findings versus conversational answers.** A finding is a stored file with a version, a hash and a matching audit. A chat answer is generated per question, is **not audited**, carries live counts from the snapshot without a grade, and the UI says so. Chat may quote a finding's grade only as returned by `get_findings`. Findings and chat answers read different copies of the data (database vs local snapshot) and are never merged on screen.

## 3. Data inventory

| Source | Entities and fields | Notes and limits | Status |
|---|---|---|---|
| `data/snapshot/tests.csv` (1,982 rows; `catalog.md`) | `test_id`, `investigation`, `source_table`, `source_row`, `fuel`, `phase` (gas 1,230; droplet 369; solid 264; smoke 117; 2 empty), `geometry`, `o2_pct_min/max` (%), `pressure_atm_min/max` (atm), `flow_cm_s`, `diluent`, `gravity`, `outcome`, `other`/`raw` (JSON), `field_sources`, `problems`, `scope` | O2 present in 1,174 rows; pressure in 1,029; all `microgravity`. Only FLEX, FLEX-2, CFI, CFI-G and Flame Design give pressure. BASS, SPICE, SLICE, SAME, SAME-R, Saffire-III, DAFT and several ACME tables give no O2. Several tables list test days, not tests (flagged in `problems`). Burner-stream oxygen is not chamber oxygen. Row numbers start at 1 after the header | Code + runtime-earlier (counts matched the mock DB) |
| `investigations.csv` (24) | `id`, `acronym`, `label`, `title`, `doi`, `type` (flight/ground), `platform`, `hardware`, `tier`, `tier_reason`, `boost_environments`, `pillar`, `environments`, `summary_student`, `summary_professional` | 5 ground studies have no rows of their own: say "ground study: analysis of flight data", never "0 tests". Tiers are a team decision (`_config/tiers.md`) | Code |
| `relations.csv` (95) | `from_id`, `to_id`, `type` (same_hardware 42, same_fuel 35, related_in_psi 12, reuses_flight_data 6), `source` | Every edge has a source | Code |
| Findings | 19 files `F-001…F-020` (no F-015) in `stages/04_calcular/output/findings` | Current versions 1–5. Questions listed in section 4 | Code |
| Audits | `stages/05_auditar/output/audits/F-XXX.json`, matched by id, version and SHA-256 | In the working tree 9 old findings looked "not audited" only because of CRLF line endings; the hash matches after LF normalization (`.gitattributes` now stops this for new checkouts). Through a gateway copy with LF bytes: 17 grade C, 2 rejected (F-007, F-019). **Needs a person to renormalize the repo files** | Runtime-earlier |
| Conditions per environment | `_config/environments.md` | Only two sourced atmospheres (see section 1) | Code |
| Supabase | Tables `investigations`, `tests` (also `tests_clean`, `measurements`), `relations` (`supabase/schema.sql`) | Max 1,000 rows per request (the dashboard pages through). No findings table. `scope` column exists, no policy yet separates `user:*` rows. **No project is configured on this machine**: no runtime run against the real database | Not verified |
| Provenance | Every `tests` row carries source table + row; every investigation carries a DOI; PSI data is CC0, citation by DOI requested | `docs/datos-psi-inventario.md` (Spanish, dated 2026-11-14) | Code |
| Raw experiment media | About 10 TB of video and images | Not usable; the project uses only the experimental tables | Code |

## 4. Supported questions and answer types

Question files: `docs/demo-questions.md` (8 demo questions, "draft for team review"); the 19 finding files above; chips in `dashboard/src/components/ResearchSearch.jsx` (four fixed suggestion strings); chat tool contract `dashboard/chat/tools.js`; Calculator functions `scripts/functions.py`; client-side recount `dashboard/src/lib/lab.js`, `browse.js`. The code rule set decides what "available" means; nothing below is a scientific answer.

| Question or example | Required fields / tool | Output shape | Best display | Evidence and warnings | Status |
|---|---|---|---|---|---|
| Highest O2 per investigation, did any reach a threshold (demo 1, 6, 8; F-001, F-008, F-009, F-012, F-010) | `o2_pct_max`; `o2_range` or `sql_query` | Range per investigation + count reaching threshold | Range-bar chart with a dashed threshold line (F-001 has one stored) | Rows, DOI, tested range; lunar warning if lunar | Findings exist (all grade C); chart stored for F-001 only; chat: `query_tests` |
| Coverage of an environment's atmosphere per phase (demo 2; F-002) | `coverage_by_environment` (O2 ≥ 30% and ≤ 10.2 psi) | Per phase: tests reaching, tests with no pressure, "no data" phases | Compact table or bar chart with **No data drawn differently from zero** | Partial-gravity warning always; missing O2/pressure counts | Lunar base and rover only; others blocked (no sourced atmosphere) |
| Filtered counts in the browser (phase, fuel, O2 ≥, pressure ≤ psi) | `tests` rows loaded from the database | Counts per investigation, "no own rows" for ground studies | Table with matching/total/missing-O2 columns; CSV export | Missing values never match a filter; burner-stream tests excluded by default (matches the project's tool: 28 lunar-atmosphere tests) | Code + runtime-earlier with a mock database; **blocked on a real database** |
| Counts by material or outcome (demo 3, 4, 5; F-003, F-004, F-005, F-011, F-016) | `sql_query` over `fuel`, `outcome`, `diluent` | Name → count list | Horizontal bar chart plus table | Table text is data; DAFT is dust, not smoke (F-011 warning) | Findings exist; no chart stored for them |
| Single number or lowest/highest value (F-017, F-020) | `sql_query` | One value with unit | Big value with its conditions, no chart | Units conversion stated (atm→psi) | Finding exists |
| Comparison of investigations or relationships (F-006 has a graph) | `relations`, finding `graph` | Nodes and sourced edges | Proof graph; investigation map for the wider network | Edge source (PSI field or DOI) | Component exists; real-data views tested only with synthetic audits |
| No-data / gap (demo 7; F-007, F-019) | `status: no_data` | Statement + why nothing can be said | "Knowledge gaps" entry, neutral gray with ∅ | Never "safe"; F-007 and F-019 are currently **rejected** by their audits | Rejected → withheld, not published |
| Questions that ask for a recommendation or safety call (F-013 "Is Nomex safe…", F-018 "best extinguisher for Mars", F-019) | — | The data can state tested conditions only | Limits and no-data answer, not a verdict | Must not become advice | Stored as indications / rejected; policy needed (section 5) |
| Free-text research question in the top search | Chat tools | `{answer, warnings, tools, findings, check, actions}` | Results view (section 7) | Not audited; number check result; source list | Blocked: needs Ollama |
| Chart or proof graph of a finding on request (`/chart`, `/graph`, `scripts/make_chart.py`, `make_graph.py`) | Stored `chart` (Vega-Lite 6) / `graph` | Drawn from stored values | Chart as the main visual only when it adds comparison | Drawn only if audit passed C9 and category allowed (`lib/findings/policy.js`) | Code; a new version needs a new audit |
| Interpretation lab: what if the data were read differently | Client-side recount (`lib/lab.js`) | Official vs lab count, who changed | Side-by-side values | "Exploration, ungraded"; not auditable | Partly built; pressure choice, O2 unit, inverse flames and saving unavailable |

## 5. Publication eligibility

Rules in `_config/confidence.md` and the code in `dashboard/src/lib/findings/{eligibility,policy}.js`.

| Result | When (as implemented) | May be shown as |
|---|---|---|
| Verified conclusion | Audit grade A or B, audit matches the finding's version and SHA-256 | A conclusion, with grade, checks and warnings visible. B carries a visible warning |
| Indication | Grade C (check C6 or C8 failed, or many unreadable cells), matching audit | "Indication only", with the failed checks; never as verified. Charts allowed if C9 passed |
| Knowledge gap | Grade `no_data` (no test answers; C0, C1, C8 passed) | A finding in its own right, neutral gray with ∅ |
| Pending | No audit or a stale/mismatching audit (including the CRLF case), gateway unreachable | "Not audited yet", no grade, no chart |
| Exploratory | Chat answers, lab recounts, live counts from `tests` | Always labeled ungraded; never given a grade |
| Withheld | `rejected`, or the file fails the schema, or grade and status disagree | Not shown as a result; the reason is shown to the team |

**Unresolved policies** (marked in `policy.js` and `confidence.md`): (1) whether a Grade C finding whose model-alert reviews are still pending may be published at all (currently listed apart as an indication); the confidence thresholds (30 tests for "broad support", 90% readable) are provisional; (2) who may ask for a chart or graph, users or only the team before the demo (`docs/calculator-output.md`, question 4); (3) whether rejected findings appear in the Professional view; (4) how question wording that asks for a safety verdict or recommendation should be handled; (5) a rule for user-provided datasets (graded B at most, no RLS policy yet).

Hard limits: no data is not safety; a confidence grade is not fire risk; lunar, Mars and rover statements always carry the partial-gravity warning.

## 6. Audience presentation

**Current behavior** (code): Student and Professional switch the wording of chat answers (`chat/prompt.js`) and which view opens first (`pages/DemoShell.jsx`). `DASHBOARD.md` section 7 states they never change what someone can read; database access is public read. `_config/audiences.md` and the table in `DASHBOARD.md` section 1 list *what each view shows first or hides* (for example `values` and `method` only in Professional). That table reads like a restriction and conflicts with section 7: **treat it as an open decision for the team, not as an access rule.** This document does not decide who may see which record.

**Recommended presentation of the same evidence, for both views:**
1. One plain-language sentence first: what was counted and what it means.
2. The claim, the number of tests and the tested range, with units, next to a visible audit-state label (grade word + icon, or "Not audited yet" / "Exploratory").
3. Warnings, always visible and never collapsed (partial gravity, no-data, burner-stream oxygen).
4. Progressive disclosure below: definitions (a short glossary of O2 %, atm/psi, phase, burner stream), calculation and parameters, source table and rows, DOI, audit checks C0–C9 with details, optional full table and CSV.
5. Student wording shortens and defines terms; Professional wording leads with values and conditions. Both open the same details on demand.

## 7. Response-layout recommendation

**Reference read:** `dashboard/dashboard-references/05-main-layout.png` (a security-operations dashboard). Take its hierarchy: charcoal ground; a large title at upper left with a short subtitle; one dominant central visual; a compact row of filter pills above it; a bottom strip of four labeled status cards with one large number each, an icon and a "/ total" caption. Do not take its unrelated metrics, gauges or the very small type; keep body text at 16 px and labels at 12 px or more.

**Layout when a question is submitted** (replaces the overview with focused results; "See status" restores the previous overview, filters and scroll):

1. **Top, in normal flow:** research input with rounded suggestion chips below it (not fixed to the screen).
2. **Question as the title**, then a concise answer (1–3 sentences) and an audit-state label.
3. **Main visual, only when it adds comparison:** range bars, a grouped bar chart or a table. A single number, a yes/no or a no-data answer gets a plain statement block, not a chart.
4. **Compact supporting strip** (like the bottom cards): number of tests, tested range, conditions (O2 %, pressure in psi), investigations.
5. **Warnings, visible** directly under the answer; audit state and failed checks next to the grade.
6. **Expandable detail:** calculation and parameters, source table and rows, DOI links, audit checks, "Open in the dashboard" actions.
7. **Optional floating conversation history** (existing popover), never a permanent sidebar.

Do not force a spacecraft, map, gauge or chart into every answer. The red demonstration marker in the habitat viewer is illustrative only.

| Component | State | Path |
|---|---|---|
| Top search and chips | Exists; chips are fixed text, not data-driven | `components/ResearchSearch.jsx` |
| Results view (question, answer, warnings, sources, audit status, "See status") | Exists; adjust to the layout above (supporting strip, answer-type-dependent main visual) | `components/ResearchResults.jsx`, `chat/actions.js` |
| Chart from stored Vega-Lite | Exists; needs a table twin and "no data ≠ 0" styling per answer | `components/FindingChart.jsx`, `lib/findings/chartSpec.js` |
| Evidence drawer with cited rows, checks, DOI | Exists | `components/EvidenceDrawer.jsx`, `GradeBadge.jsx` |
| Proof graph, investigation map | Exist | `components/ProofGraph.jsx`, `MapView.jsx` (`pillar = none` not handled) |
| Overview evidence, coverage gaps, findings summary | Exist, need the database | `Evidence.jsx`, `CoverageGaps.jsx`, `FindingsSummary.jsx` |
| Floating assistant history | Exists | `components/AssistantLauncher.jsx`, `chat/ChatPanel.jsx` |
| Answer-type renderer (count, range, list, comparison, no-data, finding) | **Missing**: today answers are plain paragraphs | new, driven by the tool results and `answer_type` in the chat contract |
| Glossary and unit definitions | **Missing** | new |
| Findings table view | **Missing** | `components/FindingsView.jsx` |

## 8. Priorities

**Frontend**
1. Answer-type renderer and supporting-values strip in `ResearchResults.jsx`; table twin for every chart; "No data" hatch style.
2. Glossary, units and a progressive-disclosure pattern shared by both views.
3. Handle `pillar = none` in the map; mobile header height and assistant overlap; keyboard and screen-reader pass of drawers, results, map, lab; light theme check.
4. Findings table view; retire the Spanish prototype (`src/secciones/*`, `estilos.css`) and update `dashboard/README.md`.

**Backend and data dependencies**
1. Real Supabase project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), then verify evidence, browser, map, lab and auth against it.
2. Findings table and finishing `scripts/publicar.py`, or keep the server proxy to the Auditor gateway (`AUDITOR_URL`, `AUDITOR_API_KEY` in the server environment only).
3. Renormalize CRLF findings/audits so bytes match the audited hashes.
4. Ollama with `gemma4:e4b-it-qat` (needs the team's approval to download) to exercise the chat; decide whether chat reads Supabase instead of the local snapshot.
5. Investigator output for the other 22 investigations (summaries, pillar, environments).
6. RLS policy for `user:*` rows before any user dataset.

**Scientific decisions (team)**
1. Publication of Grade C, confidence thresholds, treatment of recommendation-style questions (section 5).
2. Sourced atmospheres for station, transit vehicle and Mars base.
3. Whether the burner-stream oxygen should be separated from chamber oxygen in the data.
4. Whether Student/Professional differ only in wording (recommended) or in access.

**Questions for the team**
- Who may request a chart or a graph: users or only the team?
- Should rejected findings be visible anywhere?
- Is the demo question list in `docs/demo-questions.md` final, or will `/investigate` output replace it?
- Should chips be generated from the question catalog and the data instead of fixed text?

## Deferred idea (not implemented): app-wide red emergency treatment

Recorded as a future design idea only. First establish whether any actual risk signal, validated threshold or location mapping exists. Today none does: PSI contains experiment tables, not live sensors; no fire-detection data feed exists; the habitat viewer's red marker is illustrative. Do not invent fire detection, do not flash the whole screen, do not send notifications. Any future demonstration must be explicitly labeled as a demonstration and be accessible (no flashing, text and icon alongside color, reduced-motion respected, dismissible). `--danger` in `dashboard/src/styles/tokens.css` is already reserved for critical alerts and labeled demonstrations.

## Changes made in the same session (visual only)

- Dark mode background deeper charcoal (`--bg #080b0f`, `--bg-raised`, `--surface-inset` in `dashboard/src/styles/tokens.css`), grid cells 24 px with slightly stronger lines in dark mode (`styles/workspace.css`). Light mode unchanged.
- Post-login welcome: the frosted glass now covers the whole viewport while the message shows, with the same text centered and width-constrained (`styles/login.css`); it fades out before the dashboard becomes interactive.
