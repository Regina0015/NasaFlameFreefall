# Crewed environments

Atmosphere of each environment, used to rank investigations by how close their tests came to those conditions. Only sourced values are used.

`scripts/functions.py` (`coverage_by_environment`) reads the table under "Sourced atmospheres". Keep its columns. Environment ids match `schemas/finding.schema.json`.

## Sourced atmospheres

| environment | o2_min_pct | o2_max_pct | pressure_min_psi | pressure_max_psi | source |
|---|---|---|---|---|---|
| lunar_base | 30 | | | 10.2 | Challenge text, "Spacesuits and oxygen concentration" |
| pressurized_rover | 30 | | | 10.2 | Challenge text, "Spacesuits and oxygen concentration" |

## Reference atmospheres (not crewed-environment ids)

| Environment | Oxygen | Pressure | Source |
|---|---|---|---|
| Earth, sea level | 21% (implied) | 14.7 psi | Challenge text, same section |
| Spacesuit | 100% | 4.3 psi | Challenge text, same section |

## Needs a source before use

| Environment | Status |
|---|---|
| `space_station` (International Space Station) | Atmosphere not given in the challenge |
| `transit_vehicle` | Atmosphere not given in the challenge |
| `mars_base` | Atmosphere not given in the challenge |
| Lunar and Mars gravity | Not given in the challenge |

## What the challenge warns

- PSI has no partial-gravity data. Microgravity and normal-gravity results can serve as bounds.
- The E-FIELD Flames experiment imitated partial gravity with an electric field.
- The highest-oxygen tests are in CFI-G: up to 85% in the burner stream.
- Rockets and propellants are out of scope.

## Ranking criteria (proposal, to approve)

Each investigation's score for an environment is built from visible criteria, each with its evidence:

1. How close the tested oxygen is to the environment's.
2. How close the tested pressure is.
3. Fuel type: solids weigh more for material selection.
4. Fire-safety pillar it addresses: prevention, detection or suppression.
5. Number of tests.
