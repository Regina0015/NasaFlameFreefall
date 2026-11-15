# Design handoff: FlameTrace dashboard

Read-only pass. Nothing was edited, installed, staged, committed, pushed or deployed. I did not read `.env*`, `node_modules`, `dist`, `.claude/agents/*`, or `_config/challenge.md`. Facts below come from the files and from counts I computed on `data/snapshot/`. I did not query the live Supabase project, run Ollama, or run any tests.

## 1. Working vs mocked, disconnected or planned

| Feature | State (verified) |
|---|---|
| Login, Student/Professional toggle, theme, 3D intro | Working. Auth is Supabase if configured, else browser-only demo accounts, else disconnected. |
| Shell: station viewer (conceptual models) | Working, decorative. Its note says "No telemetry". |
| Research assistant | Works only with `npm run dev`, Ollama, `uv` and the repo on the same machine. On Vercel the panel shows a notice. |
| "Environments" panel | Placeholder: "Not built yet". |
| Legacy sections (Investigaciones, Ranking, Hallazgos, Grafo) | Prototype, Spanish, collapsed in a `<details>`. Ranking is a stub. |
| Findings, charts, proof graph, interpretation lab | Not built in the UI. |
| Findings table and publish step (`scripts/publicar.py`) | Stub that prints "Pendiente" and exits 1. `supabase/schema.sql` has no findings table. |

## 2. Data, units, audit states, limitations

**Snapshot (verified by counting):**
- 1,982 tests, 24 investigations (19 flight, 5 ground), 95 relations (42 same_hardware, 35 same_fuel, 12 related_in_psi, 6 reuses_flight_data).
- Only 19 investigations have test rows; the 5 ground studies have none.
- Phases: gas 1,230, droplet 369, solid 264, smoke 117, none 2.
- **All 1,982 rows are `microgravity`.** There are zero `earth` rows, although the schema, the chat filter and DASHBOARD.md all treat Earth gravity as available.
- 808 rows (41%) have no O2, 974 (49%) have no pressure, 607 have an outcome, and 562 have a flow value.
- O2 is stored in %, with mole and volume fraction treated as equal. Pressure is stored in atm (0.43–5.0); the chat and UI work in psi. O2 goes up to 85%, which is the CFI-G burner stream, not the room.
- The snapshot covers 21 of 22 PSI tables; `PSI-142` Data Summary is missing (stated in the audit).

**Findings and audits (10 findings):**

| Audit state | Findings |
|---|---|
| Grade C (all failed C8) | F-003, F-004, F-005, F-010 |
| Rejected | F-002 (C3), F-009 (C3), F-007 (C8) |
| Pending (no audit file) | F-001, F-006, F-008 |
| Grade A or B | none |

- The one audit run I read (F-010) ran with the Auditor model unavailable, so C8 was unreviewed. I assume the other Cs have the same cause.
- Only 2 of 24 investigations carry summaries, pillar and environments in the snapshot CSV. Stage 03 has 24 local records, none with `reviewed_by` set.
- Environment atmospheres are sourced only for `lunar_base` and `pressurized_rover` (O2 ≥30%, ≤10.2 psi). `space_station`, `transit_vehicle` and `mars_base` return "no source" in the chat tool.

**Doc/code mismatches:**
- DASHBOARD.md calls F-001 "grade C, only C8 open"; it has no audit.
- It cites F-002 "v5"; the current version is v3, rejected.
- It offers F-007 as the knowledge-gap example; F-007 is rejected.
- It lists vega-embed and a graph library; neither is in `package.json` (only react, three, supabase).
- DASHBOARD.md names a 34% / 8.2 psi threshold, which comes from `tier-review.md` and not from the sourced atmosphere table.
- `stages/06_publicar` uses Spanish table names (`pruebas`, `hallazgos`, `ranking`); the schema uses English names.
- `dashboard/README.md` is in Spanish and outdated. View ids are still `estudiante`/`cientifico`.
- Sample data in `public/data/` is a 2-row investigations file and a 1-row Spanish findings file (`afirmacion`, `grado`). Neither matches `finding.schema.json`.
- `design/*.md` reference images that are deleted in the working tree (`earth-reference.png`, `motion-reference*.png`).

## 3. Student vs Professional, and access

**What differs today (verified):**
- The toggle only changes the chat prompt wording.
- Professional also sees failed checks and a "Queries run" list in the chat.
- It changes the `vista` prop of the legacy sections. I did not read their bodies.
- The login mode sets the initial view only.

**Access:**
- RLS is "public read" for `anon` and `authenticated`, with no writes from the browser.
- Login gates nothing, and "Explore demo" needs no account.
- Local demo accounts are visible in the bundle, so they are not real security.
- The `scope` column (`psi` or `user:<name>`) has no policy behind it. A permissive `using (true)` would expose user datasets to everyone.

## 4. Assistant

- **Tools:** `query_tests`, `check_environment`, `get_findings`. All are read-only, run through Python and DuckDB on the local snapshot, and never take model-written SQL.
- **Limits:** 4 model steps per question, 6 turns of history.
- **Guards:** a regex-based English-only gate runs before the model; a number checker flags numbers that did not come from a tool.
- **Response:** `answer`, `warnings`, `notes`, `findings` (id, grade, failed checks), `tools`, `check`, `no_tools`. **There are no UI actions:** it cannot navigate, filter, highlight, draw charts or create findings. `/ask` is a separate Claude Code command.
- It reads local files, not Supabase, so its numbers can drift from what the dashboard shows from the database.
- Model: `gemma4:e4b-it-qat` via Ollama. It was unreachable during the 2026-11-15 audit run.

## 5. Editable experiment lab

Nothing exists beyond a spec (DASHBOARD.md §5 and README). The term "experiment lab" is ambiguous (see questions below). I read it as the interpretation lab.

**Supported today:**
- `query_tests` already accepts custom O2 and pressure thresholds, a fuel filter, a phase filter and an investigation filter.
- `tests` has min/max columns for ranges, a tier filter through `investigations`, and a "no data" group via NULLs.

**Missing:**
- A recompute tool that returns option A against option B.
- The "pressure column initial/mean/final" choice: only min/max are normalized, and pinit/pfinal sit in `raw`/`other` JSON, where I saw them only for PSI-10.
- Inverse-flame flags: seen only as a "Flame Type" cell in PSI-10; PSI-159 not checked.
- A chart library, any UI, a write path, user-dataset ingestion (`data/user/` does not exist), RLS for `user:*` rows, and a way to save a lab result as a question.

## 6. Spatial mappings and 3D assets

**Verified: no data-to-geometry mapping exists.** No test, investigation or finding carries coordinates, a module name or a room.

| Asset | Contents |
|---|---|
| `twisters-station-solid.glb`, `-hologram.glb` | Procedural, labeled "not an accurate ISS replica". 4 "Habitat-N" cylinders, docks, a cross module and solar wings. Named nodes, but no metadata mapping them to environments or hardware. |
| `iss-b.glb` | NASA / Michael D. Carbajal, Draco-compressed. 10 meshes with generic names (`bendedtru1`, `pCylinder1`…). 11 animations; I did not inspect them. Exterior only. |
| `iss-a.glb` | Single mesh, author credit unrecorded. |
| Interior assets | None. |
| Habitat configs | None found. The closest is the parameters in `crear-modelos.cjs`. |
| `dashboard-references/` | 9 PNGs. The two I viewed are stills of third-party videos (a parking-garage floorplan and a steam turbine), so style references only. I judged the other 7 by filename. |

The only plausible textual link is `investigations.platform` and `hardware` (MSG, CIR, MDCA), which could label the station but not place anything in 3D.

## 7. Recommended sections tied to real data

1. **Evidence overview:** counts of tests, investigations, phases and "no data" share, from `tests` and `investigations` (ready in Supabase).
2. **Environment coverage:** lunar and rover only, with the partial-gravity warning; the others shown as "no source". This logic currently exists only in the chat's Python path.
3. **Investigation map:** 24 nodes and 95 edges. Pillar and tier colors are limited by the 2 of 24 summaries.
4. **Material O2 dot plot:** `fuel` against O2, with a "No data" column for the 41% of rows without O2.
5. **Findings list with grades:** blocked until the findings table and publish step exist. Until then show "Not audited yet" or the rejected state honestly, with no A or B badges.
6. **Knowledge gaps:** needs F-007 rerun, since it is currently rejected.
7. **Assistant panel:** keep it, labeled as ungraded and local-only.
8. **Station stage:** keep it decorative or contextual (platform and hardware label), not spatial.
9. **Lab:** later, after sections 1–4 exist.

## 8. Questions for the team

- What does "editable experiment lab" mean: the interpretation lab, or a user-defined habitat/fire scenario editor? The second has no data or model support.
- Who owns the findings table, and when does `publicar.py` ship? Should a Grade C finding with an unreviewed C8 be shown?
- Should the Auditor re-run with Ollama up, or should humans dismiss the C8 flags?
- Who sources atmospheres for the space station, transit vehicle and Mars base?
- Is there any interior, per-module or per-room data, or is a purely visual station acceptable?
- Which ISS model is final (B only, plus attribution for A)?
- Should the chat read Supabase instead of the local snapshot, so Vercel can use it?
- Should login enforce anything? Today RLS is public. How are `user:<name>` datasets protected?
- Are the 0 `earth` rows intended? The `earth` filter in the chat and schema is currently unusable.
- Confirm the 34% / 8.2 psi threshold, and the mole-equals-volume assumption for O2.

## Key paths

- `DASHBOARD.md`
- `dashboard/src/pages/DemoShell.jsx`
- `dashboard/src/chat/ChatPanel.jsx`
- `dashboard/chat/{tools,prompt,agent,server}.js`
- `scripts/chat_tools.py`
- `scripts/functions.py`
- `scripts/auditar.py`
- `_config/{audiences,confidence,environments,tiers}.md`
- `supabase/schema.sql`
- `schemas/finding.schema.json`
- `stages/04_calcular/output/findings/`
- `stages/05_auditar/output/{audits,reviews}/`
- `data/snapshot/`
- `dashboard/public/{data,models}/`
- `crear-modelos.cjs`
