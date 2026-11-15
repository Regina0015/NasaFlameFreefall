---
name: investigate
description: Run the Investigator agent over NASA PSI combustion investigations (all 24, or the ids given) to write checked investigation records, a tier review and candidate questions, then rebuild the data snapshot. Use when someone types /investigate.
---

# /investigate [PSI ids]

Runs the Investigator once over PSI. Run from the repository root. Everything is written in English.

1. **Data present?** If `stages/01_ingesta/output/psi/` has no `PSI-*.json` files, run `uv run python -m scripts.fetch_psi`.
2. **Ids:** the ids given after the command, or else every id in the tier table of `_config/tiers.md` (24).
3. **Records:** for each id, have the `investigator` agent (`.claude/agents/investigator.md`) write its draft and run `uv run python -m scripts.write_investigation <id>`, fixing and retrying on problems (at most 2 retries; then list it as failed). Batches of several ids per agent run are fine.
4. **Tier review:** write `stages/03_investigar/output/tier-review.md`. For each investigation, check its tier against the rules in `_config/tiers.md` and the saved record. List only disagreements, each with the rule, the evidence (PSI field) and the suggested tier. Never change `_config/tiers.md`: the team decides.
5. **Candidate questions:** write `stages/03_investigar/output/questions.json`, a list of questions the snapshot can answer, each as `{"question", "tables", "columns", "pillar", "environments"}`. Cover prevention, detection and suppression, and include the lunar oxygen gap.
6. **Snapshot:** run `uv run python -m scripts.build_snapshot` so the reviewed fields reach `data/snapshot/investigations.csv`.
7. **Tell the person** what to review before loading anything into Supabase: three complete records against PSI (`stages/03_investigar/output/investigations/`), every line of `tier-review.md`, and any failed id.
