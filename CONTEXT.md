# Work route

The pipeline runs in order. Each stage leaves files in its `output/` and the next one reads them.

| # | Stage | Who does it | What it produces |
|---|---|---|---|
| 01 | `stages/01_ingesta` | Script, no AI (`scripts/fetch_psi.py`) | PSI records (trimmed) and test tables, untouched, with `manifest.csv` |
| 02 | `stages/02_normalizar` | Database owner; until then `scripts/build_snapshot.py` | Every test in one common format: `data/snapshot/` |
| 03 | `stages/03_investigar` | **Investigator agent** (`/investigate`) | One record per investigation, relations, tier review, candidate questions |
| 04 | `stages/04_calcular` | **Calculator agent** + scripts (`/ask`) | Findings with their evidence; charts and graphs on request |
| 05 | `stages/05_auditar` | **Auditor agent** (teammate) | One audit per finding version, with a confidence grade |
| 06 | `stages/06_publicar` | Script, no AI | The Supabase tables the dashboard reads |

Between stages there is human review: someone on the team opens the `output/`, reads it and corrects it if needed before moving on.

## Where to go for each task

| I want to… | Go to |
|---|---|
| Bring new data from PSI | `stages/01_ingesta`, `scripts/fetch_psi.py` |
| Fix how a table is read | `scripts/mappers.py` (and its tests) |
| Change how an investigation is summarized | `stages/03_investigar`, `.claude/agents/investigator.md` |
| Add a calculation | `stages/04_calcular`, `scripts/functions.py` (with a test) |
| Change what is checked or how it is graded | `stages/05_auditar` and `_config/confidence.md` |
| Change which model runs each agent | `_config/models.md` |
| Change what each kind of user sees | `_config/audiences.md` and `dashboard/` |

## Shared rules (`_config/`)

- `challenge.md`: what the challenge asks.
- `tiers.md`: the team's relevance tier for each investigation.
- `environments.md`: atmosphere of each crewed environment, with sources.
- `audiences.md`: the two views (student and professional).
- `confidence.md`: how the confidence grade is assigned.
- `data-schema.md`: where the snapshot columns are defined.
- `models.md`: which model runs each agent.
