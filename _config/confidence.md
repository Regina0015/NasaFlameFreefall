# Confidence grade

The grade comes from checks that anyone can repeat. No model chooses it. The Auditor (`scripts/auditar.py`, built by a teammate) runs the checks.

## Checks

| ID | Check | By | Question it answers |
|---|---|---|---|
| C0 | Format | Code | Does the finding follow `schemas/finding.schema.json`? |
| C1 | Traceability | Code | Does every number point to real rows of a PSI CSV and to a DOI that exists? |
| C2 | Fidelity | Code | Does the value used match the original cell? |
| C3 | Recalculation | Code | Does a second calculation, made with separate code, give the same result? |
| C4 | Units and ranges | Code | Are the values physically possible and in the right unit? |
| C5 | Support | Code | How many tests back it? |
| C6 | Tested range | Code | Does the claim stay within the conditions that were actually tested? |
| C7 | Data quality | Code | What share of the needed cells could be read? |
| C8 | Faithful text | Code + model | Does the text say only what the evidence supports, and mention its limits? Code checks the numbers and units; the model checks the meaning |
| C9 | Chart | Code | Does every number in the chart come from the finding or the recalculation? (Not applicable when there is no chart) |

## Grades

| Grade | When | What happens |
|---|---|---|
| **A — High** | C0 to C9 pass, with broad support (C5) and clean data (C7: 100% readable) | Published |
| **B — Medium** | C0 to C4, C6, C8 and C9 pass; limited support or minor data problems | Published with the warning visible |
| **C — Low** | C0 to C4 and C9 pass; C6 fails (extrapolation), C8 fails, or many cells are unreadable | Published marked as an indication, not a conclusion |
| **No data** | No test answers the question, and C0, C1 and C8 pass | Published as a knowledge gap |
| **Rejected** | C0, C1, C2, C3, C4 or C9 fails; or a no-data finding fails C8 | Not published; goes back to stage 04 |

Findings that include user-provided data can be graded B at most (phase 2).

## Human review of the model's alerts

The local model is sometimes wrong, almost always by being too cautious (in the 2026-11-14 test: 14 of 17 right, 3 false alarms and no missed alert). So:

- A model alert (Q3 to Q7) makes C8 fail, as before.
- A team member can **dismiss** it as a false alarm in `stages/05_auditar/output/reviews/F-XXX.json`, with their name and the reason. `auditar.py` creates that file with every alert set to `pending`. Format: `schemas/review.schema.json`.
- On the next run, dismissed alerts no longer count, and the audit records who dismissed them and why.
- If the finding changes (a different SHA-256), the review no longer applies: it is saved as `.old.json` and reviewed again.
- **The code checks (C0 to C7, C9, Q1 and Q2) cannot be dismissed.**

## Thresholds (provisional)

Approved to start on 2026-11-14; the team can change them. They live as constants at the top of `scripts/auditar.py`.

| Threshold | Value |
|---|---|
| C3: recalculation tolerance | relative 1e-6; counts must be exact |
| C5: broad support | 30 tests or more |
| C7: clean data | 100% of the needed cells readable and exact |
| C7: minor problems | 90% or more readable, or some cell approximate (`~ 22.1`) or with several values (`21; 26.5; 40`); under 90% readable counts as "many unreadable cells" |

## On the dashboard

Next to each finding the grade is shown with the list of checks and their results. A grade without its checks in view is worthless.
