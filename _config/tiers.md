# Relevance tiers

Source: the team's data-scope document (2026-11-14). The tier of each investigation is a **team decision**: the Investigator does not choose it. It only checks each tier against the rules below and lists disagreements in `stages/03_investigar/output/tier-review.md` for the team to decide.

`scripts/investigations.py` reads the table below. Keep its columns: `investigation | acronym | tier | reason | boost`. `boost` lists the environments where the tier is raised to 1, separated by commas.

## Tier table

| investigation | acronym | tier | reason | boost |
|---|---|---|---|---|
| PSI-102 | SAME | 1 | Team list, Tier 1. PSI subarea: Spacecraft Fire Safety. Smoke detection. | |
| PSI-101 | SAME-R | 1 | Team list, Tier 1. PSI subarea: Spacecraft Fire Safety. Smoke detection. | |
| PSI-47 | DAFT / DAFT-2 | 1 | Team list, Tier 1. PSI subarea: Spacecraft Fire Safety. Dust versus smoke. | |
| PSI-98 | SAFFIRE-I | 1 | Team list, Tier 1. PSI subarea: Spacecraft Fire, Smoke Distribution. Large-scale solid fire. | |
| PSI-99 | SAFFIRE-II | 1 | Team list, Tier 1. PSI subarea: Surface Combustion. Large-scale solid fire. | |
| PSI-100 | SAFFIRE-III | 1 | Team list, Tier 1. PSI subarea: Spacecraft Fire Safety. Large-scale solid fire. | |
| PSI-107 | SPICE | 1 | Team list, Tier 1. PSI subarea: Fire Safety. | |
| PSI-26 | BASS | 1 | Team list, Tier 1. PSI subarea: Spacecraft Fire Safety. Burning and suppression of solids. | |
| PSI-25 | BASS-II | 1 | Team list, Tier 1. PSI subarea: Spacecraft Fire Safety. Burning and suppression of solids. | |
| PSI-69 | FLEX | 1 | Team list, Tier 1. PSI subarea: Spacecraft Fire Safety. Flame extinguishment of droplets. | |
| PSI-68 | FLEX-2 | 1 | Team list, Tier 1. PSI subarea: Spacecraft Fire Safety. Flame extinguishment of droplets. | |
| PSI-62 | | 1 | Team list, Tier 1. Ground study; PSI subarea: Spacecraft Fire Safety. Models BASS flight data. | |
| PSI-142 | | 1 | Team list, Tier 1. Ground study; PSI subarea: Spacecraft Fire Safety. Uses FLEX flight data. | |
| PSI-20 | ACME BRE | 2 | Team list, Tier 2. PSI subarea: Flames of Gaseous Fuels. Gas burner that emulates burning solids; raised to Tier 1 for transit vehicles and the lunar base. | transit_vehicle, lunar_base |
| PSI-106 | SLICE | 2 | Team list, Tier 2. PSI subarea: not stated in PSI. | |
| PSI-39 | CFI | 2 | Team list, Tier 2. PSI subarea: Droplets. | |
| PSI-159 | ACME CFI-G | 2 | Team list, Tier 2. PSI subarea: Flames of Gaseous Fuels. | |
| PSI-10 | ACME/Flame Design | 2 | Team list, Tier 2. PSI subarea: Flames of Gaseous Fuels. | |
| PSI-21 | ACME CLD Flame | 2 | Team list, Tier 2. PSI subarea: Flames of gaseous fuel. | |
| PSI-22 | ACME E-FIELD Flames | 2 | Team list, Tier 2. PSI subarea: Laminar Flames. | |
| PSI-23 | ACME s-Flame | 2 | Team list, Tier 2. PSI subarea: Flames of gaseous fuels. | |
| PSI-115 | | 2 | Team list, Tier 2. Ground study; PSI subarea: Smoke Aerosol, Combustion Simulation. | |
| PSI-117 | | 2 | Team list, Tier 2. Ground study; PSI subarea: Droplet. | |
| PSI-60 | | 2 | Team list, Tier 2. Ground study; PSI subarea: Gaseous. | |

## Tier rules (from the team document)

- **Tier 1 (direct):** the challenge brief names the investigation, or its PSI subarea mentions fire.
- **Tier 2 (supporting):** other combustion investigations.
- **Environment boost:** an investigation can be raised to Tier 1 for a specific environment when its conditions match that environment (column `boost`).
- **Lunar warning:** any result for the lunar base carries the warning that PSI has no partial-gravity combustion data.

## Not used

PSI-179 (ASE), PSI-181 and PSI-108 are outside the data scope.
