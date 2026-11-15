# Data schema

The columns of the snapshot tables (`tests`, `investigations`, `relations`) are defined in **`scripts/contract.py`**, the single source of truth. `scripts/build_snapshot.py` generates `data/snapshot/catalog.md` from it: name, type, unit and meaning of every column, plus the caveats of each PSI table.

The database owner's export must use the same column names. Column order and extra columns do not matter: `scripts/query.py` loads columns by name and stops with a clear message if one is missing.

## Rules

- A field that does not exist in the source table, or could not be read, stays empty. It is never filled in.
- A cell with several values ("0.17; 0.21; 0.25") is not split into several tests: the row keeps its minimum and maximum (`o2_pct_min`, `o2_pct_max`) and `problems` says so.
- Tables that list test days or condition matrices instead of individual tests are marked in `problems`.
- The original text of every cell is always kept in `raw`, so the Auditor can compare.
- `source_table` and `source_row` point to the exact row of NASA's file; the first data row after the header is row 1.
- `scope` is `psi` for NASA data and `user:<name>` for a user's dataset.
