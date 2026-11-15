// Habitat scenarios that may be used as presets for the browser filters. Values are copied from the project's
// sourced definitions (_config/environments.md, "Sourced atmospheres"); they are not assumptions. Environments
// without a sourced atmosphere are not listed, so they cannot be compared numerically.
export const SCENARIOS = [
  {
    id: 'lunar_base',
    label: 'Lunar base definition',
    o2Min: 30,
    pressureMaxPsi: 10.2,
    source: 'Challenge text, "Spacesuits and oxygen concentration" (via _config/environments.md)',
    limitation: 'PSI has no partial-gravity combustion data: every test here is microgravity, which does not directly describe lunar gravity.',
  },
]
