# Demo questions

**Draft for team review.** Eight questions the Calculator answers from the PSI snapshot, for the demo and the judges. Each one names the calculation it uses, so anyone can rerun it with `/ask "<question>"`. The Investigator's `stages/03_investigar/output/questions.json` (after the database owner runs `/investigate`) can replace or extend this list.

| # | Question | Pillar | Environments | Calculation | Visual |
|---|---|---|---|---|---|
| 1 | Did any BASS-II or FLEX test reach the lunar habitat oxygen level (30% or more)? | prevention | lunar_base, pressurized_rover | `o2_range` PSI-25, PSI-69, threshold 30 | chart |
| 2 | How many tests of each fuel phase reached the lunar habitat atmosphere (30% oxygen or more, at or below 10.2 psi)? | prevention | lunar_base | `coverage_by_environment` lunar_base | chart |
| 3 | How did FLEX droplet flames end with each diluent gas (nitrogen, carbon dioxide, helium)? | suppression | space_station, transit_vehicle | `sql_query`: tests and extinctions per diluent in PSI-69 | offered |
| 4 | How many CFI-G normal gas flames went out by themselves, and over what oxygen range? | suppression | space_station | `sql_query`: outcome `se` in the CFI-G normal-flames table | none |
| 5 | Which materials did SAME-R heat to make smoke, and how many tests did each get? | detection | space_station, transit_vehicle | `sql_query`: tests per material in PSI-101 | offered |
| 6 | Did BASS-II or Saffire-II burn solid materials at Earth's 21% oxygen level or more? | prevention | space_station, transit_vehicle | `o2_range` PSI-25, PSI-99, threshold 21 | graph |
| 7 | Is there any PSI combustion test at lunar or Mars gravity? | none | lunar_base, mars_base | `sql_query`: tests whose gravity is not microgravity or earth (expected: no data) | none |
| 8 | How high did oxygen go in the ACME gas-flame tests (BRE and CFI-G), and did any reach 30%? | prevention | lunar_base, pressurized_rover | `o2_range` PSI-20, PSI-159, threshold 30 | offered |

Notes for the reviewers:

- Questions 1 and 2 are the **lunar oxygen gap**: the challenge gives the lunar habitat 30% oxygen at 10.2 psi, and no solid-fuel test in the snapshot (BASS-II, Saffire-II) reached 30% oxygen.
- Question 7 shows that **no data is an answer**: PSI has no partial-gravity combustion tests.
- Question 8: in CFI-G inverse flames the oxygen value is the burner stream, not the surrounding air, so its maximum is not an ambient atmosphere.
- `space_station`, `transit_vehicle` and `mars_base` have no sourced atmosphere yet (`_config/environments.md`), so `coverage_by_environment` runs only for `lunar_base` and `pressurized_rover`.
