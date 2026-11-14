# Stage 04 — Calculate (Calculator agent + scripts)

Answers each question with code over the snapshot and records exactly which rows it used. Run with `/ask "<question>"` (instructions: `.claude/agents/calculator.md`).

## Inputs
- `../../data/snapshot/` (`tests.csv`, `investigations.csv`, `relations.csv`, `catalog.md`)
- `../../_config/challenge.md`, `../../_config/tiers.md`, `../../_config/environments.md`
- `../../docs/calculator-output.md` (the finding format) and `references/calculos.md` (the catalog)

## Process
1. Explore with `uv run python -m scripts.query "<SELECT ...>"` (read-only; returns at most a fixed number of rows).
2. Compute with `uv run python -m scripts.run_calc <function> ...`: a catalog function, or a SQL query saved verbatim (`sql_query`). The model never writes a result by hand.
3. Write the text and save it with `uv run python -m scripts.write_finding`, which checks every number in the text against the computed values and validates the schema.
4. If no test answers the question, the finding is `no_data`. A gap is a valid result.
5. On request: `/chart F-001` or `/graph F-001` (new version, audited again).

## Limits
- No number that does not come from the calculation output or `_config/`.
- No filling of missing values, no extrapolation beyond the tested range without saying so in `limitations`.

## Outputs
- `output/findings/F-XXX.json` (format: `schemas/finding.schema.json`), earlier versions in `output/findings/history/`
- `output/calcs/C-*.json` (calculation outputs)

## Human review
Read the claims: are they clear, and do they say something useful for fire safety?
