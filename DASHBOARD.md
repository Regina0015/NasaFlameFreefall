# Dashboard spec: what to show, and where it comes from

For the teammate building the dashboard. It lists every section, the data behind it (real field names and real examples from this repository), and the rules each section must keep. The two views (student and professional) are defined in `_config/audiences.md`; the grades in `_config/confidence.md`.

**The one rule above all:** nothing reaches the screen without its source and its grade. The dashboard never calculates and never calls a model (the local chat and the lab are the exceptions, and both say so on screen).

## 0. Where the data comes from

| Data | Where | Status |
|---|---|---|
| Investigations (24) | Supabase table `investigations` | Ready. Summaries, pillar and environments arrive after the team reviews the Investigator output and runs `push_investigations --apply` (today only 2 of 24 have them) |
| Tests (1982) | Supabase table `tests` (also `tests_clean`, `measurements`) | Ready. Supabase returns at most 1000 rows per request: page with `.range()` or filter |
| Relations between investigations (95) | Supabase table `relations` | Ready |
| Findings and their audits | A findings table in `supabase/schema.sql` | **Not yet.** The database owner is adding it. Until then use `dashboard/public/data/` sample files with the same fields as `schemas/finding.schema.json` |
| Chart of a finding | `finding.chart` (Vega-Lite 6 JSON) | Ready in the finding file; draw it with `vega-embed` |
| Proof graph of a finding | `finding.graph` | Ready in the finding file |
| Chat | `/api/chat` (local only, `npm run dev`) | Ready; needs the Ollama model |

Keys: only `VITE_SUPABASE_URL` and the publishable key `VITE_SUPABASE_ANON_KEY` in `dashboard/.env.local`. Never the secret key.

## 1. Findings (Calculator + Auditor)

A finding is one answer to one question. The Calculator writes it, code checks every number, and the Auditor grades it. Format: `schemas/finding.schema.json`; full spec: `docs/calculator-output.md`.

### Fields to show

| Field | Student view | Professional view |
|---|---|---|
| `question` | Yes, as the title | Yes, as the title |
| grade (from the audit) | Badge + one sentence | Badge + full list of checks (C0 to C9) with pass or fail and `detail` |
| `claim` | Yes | Yes |
| `summary_student` / `summary_professional` | `summary_student` | `summary_professional` |
| `values` | Only through the chart | Table: name, value, unit |
| `n_tests` | "Checked against N tests" | Yes |
| `method` (`function`, `params`, `formula`) | No | Yes, collapsible |
| `evidence` (investigation, DOI, table, columns, rows) | "From BASS-II and FLEX (NASA PSI)", DOIs as links | Full proof chain: claim → calculation → table and rows → DOI |
| `assumptions`, `limitations` | Limitations, in plain words | Both, as lists |
| `warnings` | Always visible, never collapsed | Always visible, never collapsed |
| `environments`, `pillar`, `tier` | Chips | Chips |
| `visual_offer` | The footnote ("Want a visual? ...") | Same |
| `chart` / `graph` | Drawn when present | Drawn when present |
| `version` | No | "v3" with link to earlier versions |

### Real examples (from `stages/04_calcular/output/findings/`)

**F-001, grade C** (only C8, the model text review, is still open):
- Question: "Did any BASS-II or FLEX test reach the lunar habitat oxygen level (30% or more)?"
- Claim: "None of the 129 BASS-II solid-fuel tests reached 30% oxygen (highest 22.2%), while 24 of the 274 FLEX droplet tests did, up to 34%."
- Student: "Solid materials such as plastics and fabrics were never burned in space at the oxygen level planned for a Moon base. Only some liquid fuel droplet tests reached that level."
- Warning: "PSI has no partial-gravity combustion data. Lunar and Mars conclusions are bounded by microgravity and Earth-gravity results only."
- Chart: range bars of tested O2 per investigation, with a dashed line at 30%.

**F-002 v5, "no data" inside a result:**
- Claim: "Of the PSI tests that reached 30% O2 or more, only 8 of 32 droplet tests and 20 of 262 gas tests also ran at or below 10.2 psi, while 16 of those gas tests report no pressure and no solid-fuel test in the data reaches that oxygen level."
- Show solids and smoke as **"No data"**, never as 0 (a gray, hatched bar or an empty slot with the label "No data"). A zero and a "no data" must never look the same.

**F-005, a list result:** "SAME-R made smoke from five spacecraft materials: Kapton in 29 tests, silicone in 22, lampwick and Pyrell in 20 each, and Teflon in 18." Good for a simple horizontal bar chart.

**F-007, a knowledge gap:** "No PSI combustion test in the snapshot ran at lunar or Mars gravity." `status: "no_data"`. Show it in a "Knowledge gaps" list, as a finding in its own right, not as an error.

### Grades: how they look

Status colors are fixed and always come with an icon and a word, never color alone (checked with the data-viz palette rules; on the light theme the yellow and orange are below 3:1 contrast, so the word is required).

| Grade | Meaning (`_config/confidence.md`) | Color | Icon + label | Student sentence (example) |
|---|---|---|---|---|
| A | Every check passes, broad support, clean data | good `#0ca30c` | ✓ "High confidence" | "Checked against 129 tests; every check passed." |
| B | Passes, with limited support or minor data problems | warning `#fab219` | ! "Medium confidence" | "Checked, but based on few tests." |
| C | An indication, not a conclusion | serious `#ec835a` | ~ "Indication only" | "Use with care: some checks did not pass." |
| No data | No test answers the question | neutral gray (`--text-faint`) | ∅ "No data (knowledge gap)" | "NASA has not tested this yet." |
| Rejected | Failed a core check | critical `#d03b3b` | ✕ "Not published" | Not shown in the public views |

Rules: no claim without its grade; "pending" (no audit yet) shows as a gray "Not audited yet" and never as a grade.

## 2. Investigations (Investigator)

The Investigator reads each NASA PSI record and writes, with a source for every sentence: a student summary, a professional summary, a fire-safety pillar (prevention, detection or suppression), and the crewed environments it informs. It never changes the tier (that is the team's decision, `_config/tiers.md`).

### Investigation card

| Field (`investigations` table) | Student | Professional |
|---|---|---|
| `label`, `title` | Yes | Yes |
| `summary_student` / `summary_professional` | `summary_student` | `summary_professional` |
| `pillar` | Chip with icon | Chip |
| `environments` (comma-separated) | Chips: Space station, Transit vehicle, Lunar base, Mars base, Pressurized rover | Same |
| `tier`, `tier_reason` | "Directly about fire safety" (1) or "Supporting science" (2) | Tier + reason |
| `platform`, `hardware` | Platform only | Both |
| `doi` | Link "NASA data" | DOI link, and "cite this DOI" |
| Number of tests | "129 tests" (count from `tests`) | Count + tested O2 and pressure ranges + link to the filterable table |
| Related findings | Their claims with grade | Same |

Real example (PSI-25, BASS-II), student summary: "Astronauts burned plastic and fabric samples inside a small wind tunnel on the International Space Station to see how flames start, grow and go out without gravity. The results help engineers choose safer materials for spacecraft." Pillar: prevention. Environments: space_station, transit_vehicle.

Ground studies (PSI-60, PSI-62, PSI-115, PSI-117, PSI-142) have no test rows of their own; say "Ground study: analysis of flight data", not "0 tests".

### Map of investigations (the graph)

**Where:** its own tab "Map" in the main area (it can share the stage where the 3D station sits today, with a toggle "Station / Map"). Clicking a node opens that investigation's card in the side panel.

**Nodes:** the 24 investigations.
- **Color = pillar.** Three categories plus gray. Validated with the data-viz palette script against the dashboard surfaces (`#121a23` dark, `#ffffff` light), all pairs, colorblind-safe:

| Pillar | Dark theme | Light theme |
|---|---|---|
| Prevention | `#3987e5` (blue) | `#2a78d6` |
| Detection | `#d95926` (orange) | `#eb6834` |
| Suppression | `#199e70` (aqua) | `#1baf7a` |
| Not reviewed yet | `--text-faint` gray | `--text-faint` gray |
| None (`pillar = none`: PSI states no fire-safety use, e.g. PSI-22, PSI-159) | hollow gray circle | hollow gray circle |

  The light aqua is below 3:1 on white, so node labels must always be visible (or the table view offered).
- **Size = number of tests** (area proportional, `sqrt` scale). Ground studies: small hollow circle.
- **Ring = tier:** thick ring for Tier 1, thin for Tier 2.
- **Label:** the `label` (BASS-II, FLEX, SAME-R...), in text color, never in the pillar color.

**Edges:** the 95 rows of `relations`, one neutral color (`--border-strong`), the type shown by line style, not by hue (four hues on a network fail the colorblind check):

| `type` | Count | Line |
|---|---|---|
| `same_hardware` | 42 | solid |
| `same_fuel` | 35 | dashed |
| `related_in_psi` | 12 | dotted |
| `reuses_flight_data` | 6 | solid with an arrow (ground study → flight experiment) |

- A legend for both the pillar colors and the line styles; filters in one row above the graph: relation type, pillar, tier, environment.
- Hover on a node: name, pillar, tier, number of tests. Hover on an edge: type and `source` (where the link comes from).
- Professional view adds a table of the same data.

## 3. Ranking by environment

A selector (space station, transit vehicle, lunar base, Mars base, pressurized rover) that lists the investigations relevant to it, Tier 1 first (`boost_environments` raises a Tier 2 investigation to Tier 1 for that environment), each with its findings and grades. For lunar base, Mars base and pressurized rover, the partial-gravity warning is always on screen. No scores are invented: order by tier, then by number of tests.

## 4. Research assistant (the local chat)

Already built: `dashboard/src/chat/ChatPanel.jsx`, mounted in the "Research assistant" panel of `DemoShell.jsx`.
- Questions in English. The model answers only with numbers from three read-only tools (`query_tests`, `check_environment`, `get_findings`), and a checker flags any number that did not come from a tool.
- Each answer shows where its data came from and says it is **not an audited finding**.
- Phases with tests that report no oxygen come back as "No data for ...". Show that as text, not as a zero.
- It only exists with `npm run dev` and the Ollama model; on Vercel the panel shows a notice.

## 5. Interpretation lab (to build)

A panel next to the chat: "what if the data were read differently?". It shows whether a result holds when the reading choices change (a sensitivity check). Full idea: "Idea for the dashboard: an interpretation lab" in `README.md`.

- **Not a new agent:** one more read-only tool of the chat. Code recomputes; the model only explains the difference.
- **Label on screen, always:** "Exploration, ungraded. Not a finding."
- **Controls (one row):**
  1. Pressure column: initial / mean / final.
  2. Oxygen unit: fraction or percent; mole versus volume fraction.
  3. Oxygen threshold: 30% (lunar habitat), 34% (8.2 psi atmosphere of PSI-20), custom.
  4. Pressure limit: 10.2 psi, 8.2 psi, custom.
  5. Inverse flames (CFI-G and Flame Design inverse): include or exclude.
  6. Rows that are test days or ranges: minimum, maximum, or leave out.
  7. Tests with no oxygen or no pressure: leave out (no data) or show as their own group.
  8. Tier: Tier 1 only, or all.
  9. Material: one or more fuels from `tests.fuel` (Nomex, PMMA, SIBAL, Kapton, silicone...), grouped by phase.
- **Material map (graphic):** one row per material, one dot per test at its O2 (x axis), dashed lines at 30% and 34%. The empty space to the right of the lines is the knowledge gap (for example no Nomex test above 22.2%, F-013). Tests with no O2 go in a "No data" column at the end, never at 0.
- **Result:** the official value next to the lab value, how many tests each choice adds or drops, and from which investigations. One axis per chart; if the official and the lab number barely differ, say "robust to this choice".
- A lab result worth keeping becomes a real question through `/ask` (Calculator + Auditor).

## 6. Rules for every chart

- One y-axis only; two measures of different scale go in two charts.
- A legend whenever there are two or more series, plus direct labels when there are four or fewer.
- Text and numbers in the text colors (`--text`, `--text-muted`), never in the series color.
- Hover tooltip on every bar, dot or node; a table view next to every chart in the professional view.
- Dark and light themes each use their own colors from the tables above (the dashboard already has `data-theme`).
- "No data" is drawn differently from zero (hatched or empty, with the words "No data").
- The partial-gravity warning appears wherever lunar base, Mars base or pressurized rover appear.

## 7. Login and views

- Real accounts come from Supabase Auth (email and password). For the demo, create the accounts in Supabase (Authentication → Users → Add user, "Auto Confirm User"). "Explore demo" works without an account.
- Student and Professional only change how results are worded; they never change what someone can read (the database policies decide that).
- The local demo accounts in `.env.local` only work when Supabase is not configured; they can be removed.

## 8. Auditor API: real responses to build against

The Auditor runs on its own PC behind an HTTP gateway (`api/`). Real responses, captured from that gateway on 2026-11-15, are in `dashboard/public/data/api/` (one file per call: `{http_status, note, body}`). Build the findings views against these files first; the shapes are the contract.

**Never call the gateway from the browser.** Every route except `/health` needs the `X-API-Key` header, and anything in a `VITE_` variable ends up in the public bundle. Read grades through a server: the Vite dev server (like the chat in `dashboard/chat/`), or the `findings` table in Supabase once findings and audits are loaded there.

| Call | File | Use it for |
|---|---|---|
| `GET /health` (no key) | `health.json` | A status chip: "Auditor online / model ready". `status` is `ok` or `degraded` |
| `GET /findings` | `findings.json` | The findings list. Rejected findings are left out; `rejected_not_shown` says how many |
| `GET /findings?include_rejected=true` | `findings-include-rejected.json` | Professional view only, if you show rejected ones at all |
| `GET /findings/F-001` | `finding-F-001.json` | One finding with its grade |
| `GET /audits` | `audits.json` | Grade of every stored finding (no finding text) |
| `GET /audits/F-001` | `audit-F-001.json` | Full proof: `audit.checks` (C0 to C9 with `result` and `detail`), `audit.recalculation`, `audit.text_review` |
| `GET /audits/F-007`, `/audits/F-019` | `audit-F-007.json`, `audit-F-019.json` | Knowledge-gap findings (`status: no_data`) |
| wrong key | `error-401-wrong-key.json` | Show "Auditor not reachable", never a grade |
| unknown id | `error-404-unknown-finding.json` | Show "Not found" |

**Fields of a findings row:** `finding_id`, `finding_version`, `grade` (`A`, `B`, `C`, `no_data`, `rejected` or `pending audit`), `failed_checks` (list such as `["C5", "C8"]`), `stale_audit` (true: the finding changed after its audit, so show "Not audited yet"), `model_used` (false: the text review did not run), `audited_at`, and `finding` (the full finding, fields in section 1).

**Rules:**
- A grade is shown only when `grade` is one of the five grades and `stale_audit` is false. `pending audit`, an error or an unreachable gateway all show "Not audited yet", never a grade.
- `failed_checks` in plain words for the student view: C5 = "based on few tests", C7 = "some table cells were unclear", C8 = "the text review did not pass". The professional view lists every check with its `detail`.
- `rejected` findings are not published (section 1). A `no_data` finding with C8 failed comes back `rejected` until its text passes the review.
- Results of every finding sent through the gateway: `battery-results.json`.
