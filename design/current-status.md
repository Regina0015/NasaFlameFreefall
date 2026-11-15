# FlameTrace — current status handoff

Prepared for a design collaborator. Read-only inspection: nothing was edited, installed, staged, committed, pushed, deployed or run (no agents, no tests, no builds). The only file written is this one. `.env*` contents were not read.

**How to read the status column**
- **RT-today**: seen on the running page (`http://localhost:5173`) or in a read-only data check during this inspection.
- **RT-earlier**: verified in the browser in earlier sessions of this work, against a local mock database and a simulated chat backend (not real Supabase, not real Ollama). Not re-checked today.
- **CI**: code inspection only.
- **Assumption**: inferred, not verified.

## 1. Git state (verified with git commands)

| Item | State |
|---|---|
| Branch | `integration-main-v2` |
| Merge | **In progress.** `MERGE_HEAD` = `origin/main` (8c1641d, "Cambios y errores"), merge base 17fad12 ("Login prooved"). Message: "Merge remote-tracking branch 'origin/main' into integration-main-v2". |
| Unresolved paths (index shows `UU`) | `dashboard/.env.example`, `dashboard/index.html`, `dashboard/src/App.jsx`, `dashboard/src/components/StationViewer.jsx`, `dashboard/src/main.jsx`, `dashboard/src/pages/DemoShell.jsx`, `dashboard/src/pages/Login.jsx`, `dashboard/src/styles/app.css` |
| Conflict markers in those files | **None** (searched for `<<<<<<<`, `=======`, `>>>>>>>`). The working files are already hand-resolved, but the index still marks them unmerged, so a person must review and mark them resolved. |
| Staged from main | 71 added, 53 modified: new `api/` (Auditor gateway), `postman/`, new findings F-011 to F-020, new scripts and Python tests, changed `CLAUDE.md`, `DASHBOARD.md`, `README.md`, `.gitattributes`. |
| Other | `stash@{0}` exists ("Reference image deletions before main merge"). Latest commit on this branch: 4f6695e "Save dashboard progress before integrating main". |

**Needs a human decision:** which side wins in the 8 files. My working copies are the Phase A–C dashboard; `Login.jsx` should be compared against main's version before resolving, because the login is the approved screen.

## 2. Feature status

| Feature | Verified status | Missing work | File path |
|---|---|---|---|
| Cinematic login (Earth → Twisters word → NASA ISS assembly → glass form) | CI + RT-earlier (login rendered with `?t=15.6`, form, Skip, Replay). Not viewed this inspection. File is in the merge conflict set. | Confirm it survived the merge unchanged; real Supabase sign-in/register/recovery never exercised (no project configured). | `dashboard/src/pages/Login.jsx`, `components/AuthPanel.jsx`, `components/EarthScene.jsx`, `lib/auth.js`, `lib/stationParticles.js`, `styles/login.css` |
| Welcome transition (black screen, typed line, upward exit, Skip, reduced motion) | CI + RT-earlier (timings, once-per-entry flag, reduced-motion path via matchMedia override). | "Welcome back" vs "aboard" is only demo-vs-account, not real returning-user detection (by design). | `components/Welcome.jsx`, `App.jsx` (clears flag on login page), `styles/overview.css` |
| Top research search + suggestion chips | RT-today (input and 4 chips visible, honest "Assistant unavailable… Retry"). Send/Enter/Shift+Enter/chip-once behavior RT-earlier with a simulated backend. | Never verified with real Ollama answers. Chips are fixed text, not data-driven. | `components/ResearchSearch.jsx`, `chat/useChat.js`, `chat/statusText.js` |
| Research results view | CI + RT-earlier (question, loading, error/retry, answer sections, warnings, sources, audit status, "Open in the dashboard"). | Real model output untested; no streaming; answer is plain paragraphs. | `components/ResearchResults.jsx`, `chat/actions.js` |
| "See status" / back navigation | CI + RT-earlier (restores overview filters and scroll; browser Back/Forward walk history). | None known. Keyboard-only pass not done. | `pages/DemoShell.jsx` (`navigate`, `restoreOverview`) |
| Floating assistant popover | CI + RT-today (launcher visible) + RT-earlier (opens only on click, Escape, focus return, badge, mobile). | Popover only shows history; no composer by design. | `components/AssistantLauncher.jsx`, `chat/ChatPanel.jsx` |
| Assistant actions (validated buttons) | CI + unit tests + RT-earlier. Backend builds `actions` from tool results; browser re-validates. | Real tool results from a live model not seen; no comparison view exists to open. | `chat/references.js`, `chat/agent.js`, `src/chat/actions.js` |
| Evidence overview + coverage + "Where data is thin" | RT-today shows the honest "No database connection" state. RT-earlier with mock DB: counts matched snapshot (1,982 tests, 24 investigations). | Needs real Supabase; fetch pages past 1,000 rows tested only against a mock. | `components/Evidence.jsx`, `CoverageGaps.jsx`, `lib/evidenceData.js`, `lib/evidence.js` |
| Investigation browser + details + table + CSV | CI + RT-earlier (filters, details drawer, table, CSV 1,982 rows). RT-today: "needs the database". | Same DB dependency; details drawer not exercised at phone width. | `components/InvestigationBrowser.jsx`, `InvestigationDetails.jsx`, `lib/browse.js`, `lib/investigation.js`, `lib/csv.js` |
| Findings list, evidence drawer, cited rows, charts, proof graph | RT-today: `/api/findings` returns 19 findings; verdict computed by code (below). Charts and proof graph verified only with **synthetic** audits written outside the repo. | No real finding has grade A or B, so verified/chart views never seen on real data. No table view of findings. Gateway (`api/`) not connected. | `components/FindingsView.jsx`, `EvidenceDrawer.jsx`, `FindingChart.jsx`, `ProofGraph.jsx`, `lib/findings/*`, `findings/server.js` |
| Findings summary on overview | CI + RT-today (shows "0 verified · 9 indications · 0 knowledge gaps · 9 not audited yet · 1 withheld"). | None beyond the audit-state issue in section 4. | `components/FindingsSummary.jsx` |
| Investigation map (relationship graph) | CI + RT-earlier (24 nodes, 95 edges, filters, zoom/pan, table, details, mobile). | **`pillar = none`** (documented in DASHBOARD.md as a hollow gray circle) is not handled: it is treated as "Not reviewed yet". Dense ACME cluster overlaps labels until zoomed. | `components/MapView.jsx`, `lib/graph.js` |
| "Conditions tested" chart | CI + RT-earlier. | Burner-stream vs chamber oxygen is only a caveat; data cannot separate them. | `components/OxygenChart.jsx` |
| Interpretation lab | CI + unit tests + RT-earlier. | Client-side recount of loaded rows, not a backend tool, so not auditable. Initial/mean/final pressure, oxygen unit, inverse flames and saving are listed as unavailable. | `components/LabView.jsx`, `lib/lab.js` |
| Visual explorer: NASA ISS, Concept, Hologram | CI + RT-earlier (all three reached `ready`; clear errors on fetch failure). The reported "Failed to fetch" was **not reproduced**. | Contextual illustration only; no research data maps onto the models. | `components/StationViewer.jsx`, `lib/fetchGlb.js`, `public/models/` (SOURCES.md) |
| 3D conceptual habitat (cutaway + interior, demo marker) | CI + RT-earlier (compartment selection, enter/back/reset, safe camera route test, mobile, reduced motion). GLB exported and re-loaded (255 meshes, about 9,800 triangles). | Invented layout, not an ISS replica; no interior data mapping; red demo marker is illustrative only. Not re-checked after the merge. | `components/HabitatViewer.jsx`, `lib/habitat/*`, `tools/export-habitat.mjs`, `public/models/flametrace-habitat-concept.glb` |
| Student / Professional | CI + RT-earlier. Presentation only. | Not an access control (database policy is public read). | `pages/DemoShell.jsx` |

## 3. Data, audit, API, chat and authentication gaps

| Area | Status | Evidence type |
|---|---|---|
| Supabase | The running dev server has **no database connection**: overview, browser, map and lab show "needs the database" (RT-today). `.env.local` exists; contents not read. | RT-today |
| Findings source | Dashboard reads repo files through a dev-only endpoint (`/api/findings`, returns 19 today). There is **no findings table** in the database and `scripts/publicar.py` is a stub. On a deployed site Findings would be empty. | RT-today + CI |
| Auditor gateway (`api/`) | Exists (FastAPI, `X-API-Key`), with captured responses in `dashboard/public/data/api/`. The dashboard does **not** use it or those files. DASHBOARD.md section 8 says never call it from the browser; a server-side proxy (like the chat endpoint) is not built. | CI |
| Audit matching | **7 of the old findings are "stale" only because of line endings** (see section 4). | RT-today (hash check) |
| Chat backend | Ollama is not running: `/api/chat/status` returns `available: false`, model not installed (RT-today). Chat reads a **local snapshot**, not Supabase, and does not use gateway grades. Local-only (dev server). | RT-today + CI |
| Chat contract | Responses carry `warnings`, `tools`, `findings`, `check`, `actions`. No navigation beyond the validated `actions`. | CI + unit tests |
| Authentication | Supabase Auth code exists (sign-in, register, recovery, neutral reset message). Never run against a real project. Local demo accounts come from `.env.local` and are bundle-visible (no real security). RLS is public read for anon. | CI |
| User datasets | `scope` column exists but no policy distinguishes `user:*` rows. | CI |

## 4. Current findings and audits (read-only check of repo files)

Classified by the dashboard's own eligibility code over the 19 files in `stages/04_calcular/output/findings/`:

| Result | Count | Which |
|---|---|---|
| Verified (grade A or B, matching audit) | 0 | — |
| Indication (grade C, matching audit) | 9 | F-002, F-011, F-012, F-013, F-014, F-016, F-017, F-018, F-020 |
| Withheld (rejected) | 1 | F-019 |
| Not audited yet (audit does not match) | 9 | F-001, F-003 to F-010 |

**Root cause of the nine "not audited yet" rows (verified by hashing, read-only):** F-001 and F-003 match their audits' SHA-256 only after converting CRLF to LF. The working-tree files have CRLF endings (`core.autocrlf=true`), while the Auditor hashed LF bytes. The merge added `.gitattributes` rules (`-text` for findings and audits) that keep future checkouts byte-exact, but existing working-tree copies are still CRLF. The new findings (e.g. F-011) are LF and match. This is likely a **data/repo fix, not a dashboard bug** (assumption on the exact remedy: re-checkout or renormalize those files so their bytes equal the audited bytes; a person must do it).

## 5. Tests and startup commands

| What | Command (from docs) | Status |
|---|---|---|
| Dashboard dev | `cd dashboard && npm install && npm run dev` (dashboard/README.md, DASHBOARD.md) | Server is running on 5173 (RT-today). A second server on 5199 serves the older `C:\Users\maria\NasaTwisters` checkout. |
| Dashboard build | `npm run build` | Passed in earlier sessions; not run now (it writes `dist/`). |
| JS tests | `npm test` runs only `chat/*.test.js` (agent tests). Other node tests are **not in the script**: `src/chat/actions.test.js`, `src/lib/browse.test.js`, `evidenceData.test.js`, `graph.test.js`, `phaseC.test.js`, `findings/findings.test.js`, `findings/chartSpec.test.js`, `habitat/camera.test.js`. Run them with `node --test <file>`. | Passed earlier (14 chat + 40 others). Not re-run now. |
| Python tests | `uv run python -m unittest discover -s scripts/tests -t .` and `uv run python -m unittest scripts.test_auditar` (CLAUDE.md). Merge adds `test_api.py`, `test_audit_client.py`, `test_load_snapshot.py`, `test_env_example.py`. | Not run (read-only). |
| Chat (local) | Needs Ollama with `gemma4:e4b-it-qat`, `uv sync`, and `npm run dev` (README, `_config/models.md`). | Ollama is not running. |
| Auditor gateway | `uv run uvicorn api.main:app --host <LAN IP>` with `API_KEY` in `.env`; `uv run python -m scripts.audit_client F-001` (CLAUDE.md). | Not run. |
| 3D habitat export | `npm run export:habitat` | Run earlier; output file exists. |
| Snapshot sync | `uv run python -m scripts.pull_db` (`--check` compares only) | Not run. |

## 6. Outdated or contradictory documentation

- **`dashboard/README.md`** is in Spanish and describes the old structure (`src/secciones/`, "estudiante/científico", ranking). Superseded.
- **`README.md`** line about the dashboard ("login and demo view, 3D station model, investigations section, local chat in the Research assistant panel") predates the current workspace.
- **`DASHBOARD.md`**:
  - Section 1's examples (F-001 grade C, F-002 "v5", F-007 as a knowledge-gap example) do not match current artifacts.
  - Section 0 says the findings table is "not yet" and to use sample files; section 8 now points to gateway captures, but the dashboard uses repo files instead.
  - Section 2 documents `pillar = none`, which the map does not implement.
  - Section 7 (login) is consistent with the code.
- **`CLAUDE.md`** says the dashboard "reads from Supabase only"; in practice it also reads repo files (`/api/findings`) and a local snapshot (chat), both dev-server only.
- **`design/repo-handoff.md`** is stale (10 findings, F-002 rejected, no gateway); superseded by this file.
- **Design briefs conflict by age:** `dashboard-brief.md` (permanent sidebar and bottom dock) is superseded by `flametrace-dashboard-v2.md` and then by the later assistant revision (top search + popover). Treat the **latest implemented UX** as truth.
- **Leftovers:** `dashboard/src/secciones/*` (Spanish prototype, unused) and `estilos.css`; `package.json` name is still `nasatwisters-dashboard`; session keys still use `nasatwisters-*` for login and `flametrace-*` for the welcome.
- **`.gitignore`** excluded `models/` (hid `dashboard/public/models/`); a negation was added earlier. Confirm it survived the merge.

## 7. Prioritized next steps

**A. Needs a person first (repo and data)**
1. Resolve and commit the merge: review the 8 `UU` files, especially `Login.jsx`.
2. Fix the CRLF mismatch so existing findings match their audits (re-checkout or renormalize findings and audits so bytes equal the audited bytes). This alone should move F-001 and F-003 to F-010 out of "not audited yet".
3. Decide the team policy for Grade C with unreviewed checks (nine findings are now indications; none is verified).

**B. Backend and data work**
1. Configure Supabase in `dashboard/.env.local` and verify the evidence, browser, map and lab against the real database.
2. Add a findings table and finish the publish step (stage 06), or build a dev-server proxy to the Auditor gateway that keeps the API key off the browser.
3. Run Ollama and exercise the chat end to end (real tool calls, `actions`, number check). Decide whether the chat should read Supabase instead of the local snapshot.
4. Verify real Supabase Auth flows (sign-in, registration, recovery redirect allow-list).
5. Add RLS policy for `user:*` rows before any user datasets.

**C. Design fixes (no backend needed)**
1. Handle `pillar = none` in the map (hollow gray circle with the documented meaning).
2. Mobile: the header takes about 150–165 px on a phone; the assistant popover and launcher can overlap content at the bottom right; review the ACME cluster label overlap on the map.
3. Run a keyboard-only and screen-reader pass of the drawers, results view, map and lab; check the light theme across all new panels.
4. Add a table view to the Findings list; consider a contextual "show the calculation and its audit" flow.
5. Retire the Spanish prototype files, update `dashboard/README.md`, and rename package and session keys for consistency.
6. Re-verify the login, welcome and 3D viewers visually after the merge is resolved.
