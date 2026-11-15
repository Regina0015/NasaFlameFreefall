# Calculation catalog

Every calculation lives as a function in `scripts/functions.py`, with its unit test in `scripts/tests/test_functions.py`. The Calculator chooses from here; when none fits it uses `sql_query`, and a calculation that keeps coming back is added here as a tested function.

| Function | What it answers | Inputs | Status |
|---|---|---|---|
| `o2_range` | Lowest and highest O2 tested per investigation, and how many tests reached a threshold | investigations, threshold_pct | built |
| `coverage_by_environment` | How many tests per fuel phase fall within an environment's sourced atmosphere (O2, and pressure when recorded) | environment | built |
| `sql_query` | Anything else, as one saved read-only SQL query that returns `name, value, unit, investigation, source_table, source_rows, source_columns` | sql | built |

## Ideas to evaluate (none approved)

- Pressure coverage against each environment's.
- Lowest oxygen at which each fuel kept burning (FLEX: 274 tests with composition and test end).
- Burn length in microgravity versus 1 g per material (Saffire-II).
- Map of which combinations of fuel, oxygen and flow have tests and which do not (gap map).
- Relevance score per environment, with its breakdown.
