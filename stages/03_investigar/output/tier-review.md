# Tier review

The Investigator checked the tier of all 24 investigations against the rules in `_config/tiers.md`. Only disagreements are listed. The team decides; `_config/tiers.md` was not changed.

## Suggested Tier 1 (the challenge brief names them)

Rule: "Tier 1 (direct): the challenge brief names the investigation". The brief is `_config/challenge.md`.

| investigation | current tier | evidence (PSI field) | brief line | suggested |
|---|---|---|---|---|
| PSI-20 ACME BRE | 2 (boost: transit_vehicle, lunar_base) | `investigationAcronym` = "ACME BRE" | "ACME (6 experiments, gases, CIR): includes BRE, CFI-G (up to 85% O2) and E-FIELD Flames" | 1 |
| PSI-159 ACME CFI-G | 2 | `investigationAcronym` = "ACME CFI-G" | same line as BRE | 1 |
| PSI-22 ACME E-FIELD Flames | 2 | `investigationAcronym` = "ACME E-FIELD Flames" | same line as BRE | 1 (note: its `researchImpacts` says the work "is not being conducted to serve any space applications") |
| PSI-39 CFI | 2 | `investigationAcronym` = "CFI"; `experimentHardware` = MDCA, CIR | "MDCA (liquid fuel droplets, CIR): FLEX, FLEX-2, CFI" | 1 |
| PSI-106 SLICE | 2 | `investigationAcronym` = "SLICE"; `subResearchArea` empty | "MSG + SPICE flow duct (solids and gases): BASS, BASS-II, SPICE, SLICE" | 1 |

## Environment boost

- **PSI-20 ACME BRE:** add `pressurized_rover` to the boost (only matters if it stays Tier 2). Rule: environment boost when the conditions match the environment. Evidence: `objective` lists a tested condition of "8.2 psia, 34 % oxygen", inside the pressurized_rover atmosphere in `_config/environments.md` (30% O2 or more, 10.2 psi or less), the same atmosphere as lunar_base, which is already boosted.
- **PSI-68 FLEX-2:** worth a look for a lunar_base boost. Its record gives O2 between 0.1 and 0.4 mole fraction, which would include 30%; the Investigator did not convert units, so the team should check the test table.

## Reason text only (tier unchanged)

- **PSI-99 SAFFIRE-II:** Tier 1 holds because the brief names Saffire-II, but the reason in the table cites only the subarea ("Surface Combustion"), which does not mention fire. Suggest adding "named in the challenge brief" to the reason.

## Data problems found in PSI records (not instructions)

- PSI-39: `objective` says pressures "from 0.25 atm to 5 atm", `approach` says "from 0.25 to 0.5 atm"; the summary gives both with their sources. `hypothesis` spells the fuel "faresane" (farnesane).
- PSI-26: `approach` has an incomplete phrase ("fiberglass (by mass) measuring were used"); the sample size is missing.
- PSI-62: `flightProgram` is empty, so the record does not say where the BASS data were flown.
- PSI-60, PSI-106, PSI-26, PSI-100, PSI-102: some conditions (fuel, oxygen, pressure, sample size or materials) are "not stated in PSI".

No PSI record contained text that looked like an instruction.
