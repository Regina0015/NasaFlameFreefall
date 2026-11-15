# Q8 review guide (prepared 2026-11-15)

Q8 is the one question the Auditor leaves to a person: *does the SQL in `method.params` answer the finding's question, and do its filters keep every test they should?* Until a person answers it, C8 fails and the grade stays at C or below.

**How to answer.** Read the finding, check the suggestion below, then open `F-XXX.json` in this folder and set the Q8 flag:
- `"decision": "dismiss"` if the SQL answers the question (false alarm), or `"confirm"` if there is a real problem.
- `"reviewer"`: your own name. `"note"`: what you checked. A `dismiss` without both is ignored.

The suggestions below were checked against `data/snapshot/tests.csv`. They are a starting point, not a decision: the reviewer signs, so the reviewer must agree.

**About the note in every Q8 ("the snapshot covers 21 of 22 PSI tables").** The missing table, `PSI-142_Experimental table_Data Summary Table.csv`, has no tests: it lists 8 links to figures in papers (cool-flame data). It cannot change any count or range below.

| Finding | Suggested decision | What was checked (suggested note) |
|---|---|---|
| F-005 | dismiss | The SQL counts SAME-R (PSI-101) tests per fuel. All 109 PSI-101 rows have a fuel, so `fuel IS NOT NULL` drops none; the five counts add up to 109. |
| F-010 | dismiss | All 186 FLEX (PSI-69) extinction tests have an O2 value, so the O2 filters drop none. The 8 FLEX-2 (PSI-68) rows have no outcome, as the claim says. |
| F-011 | dismiss | Counts per fuel for PSI-101 (109), PSI-102 (8) and PSI-47 (2). No row of these investigations lacks a fuel, so every test is in a group. |
| F-012 (v2) | dismiss | `phase = 'solid' AND o2_pct_max IS NOT NULL` over every table keeps 140 tests (PSI-25: 129, PSI-99: 9, PSI-98: 2). The 124 solid tests without O2 (PSI-26: 122, PSI-100: 2) are left out, and the limitations say so. 14 tests are at the highest value, 22.2% O2, all in PSI-25. |
| F-013 | dismiss | `lower(fuel) LIKE '%nomex%'` finds the 10 Nomex tests in every table, including "PMMA & Nomex". 4 state O2 and none states pressure, as the claim says. |
| F-014 | dismiss | Every row of PSI-98 (2), PSI-99 (9) and PSI-100 (2) has phase `solid`, so `phase = 'solid'` drops none. |
| F-016 | dismiss | `fuel ILIKE '%kapton%'` over every table finds 30 tests: 29 in PSI-101 and 1 in PSI-102. |
| F-017 | dismiss | All 8 FLEX-2 rows have a pressure, so `pressure_atm_min IS NOT NULL` drops none; the minimum is 0.5 atm. |
| F-018 | dismiss | PSI has no extinguisher tests, and the claim says so. The FLEX counts per diluent add up: 123 + 50 + 101 = 274 tests, of which 88 + 40 + 58 = 186 ended in extinction. Judgment call: the diluent atmospheres are presented as the closest data, not as extinguishers. |
| F-019 | dismiss | All 91 PMMA tests have gravity `microgravity` and none is empty, so `gravity <> 'microgravity'` (which would skip empty values) drops nothing: the count of 0 is right. This finding stays rejected until its model flags (C8 Q3, Q4, Q6) pass or are dismissed. |
| F-020 | dismiss | Flow ranges per investigation and per table give the same order: SPICE (PSI-107) 84.62 cm/s wide, next PSI-101 at 8.1. `HAVING max > min` only leaves out tables with a single flow value. |
| F-021 | dismiss | Only Saffire-II (PSI-99) has a spread-rate column in microgravity ("?-g Spread Length"). Of its 9 tests, 2 hold a number (2.1 and 2.6 mm/s); the others say "n/a" or "Note 4", so `try_cast` leaves them out on purpose. The "1-g Spread Rate" column is Earth gravity, outside the question. |

After editing, commit and push; the Auditor PC pulls, and the next audit of each finding uses the decision (`uv run python -m scripts.audit_client F-XXX --reaudit` from the Calculator PC).
