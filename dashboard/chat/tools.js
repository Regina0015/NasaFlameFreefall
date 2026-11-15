// The chat's 3 tools. The model picks one; scripts/chat_tools.py (Python, read-only) computes the answer.
// This file only describes the tools to the model and tidies the model's arguments.

import { execFile } from 'node:child_process'

const PHASES = ['solid', 'droplet', 'gas', 'smoke']
const ENVIRONMENTS = [
  'lunar_base', 'pressurized_rover', 'earth_sea_level', 'spacesuit', 'space_station', 'transit_vehicle', 'mars_base',
]

export const DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'query_tests',
      description:
        'Count PSI tests and give their O2 and pressure ranges, with optional filters and grouping. Use it for any number about tests. O2 is in percent, pressure in psi.',
      parameters: {
        type: 'object',
        properties: {
          investigation: { type: 'string', description: 'PSI id like "PSI-25" or acronym like "BASS-II"' },
          phase: { type: 'string', enum: PHASES, description: 'Fuel phase' },
          fuel: { type: 'string', description: 'Fuel or material name, partial match, e.g. "PMMA"' },
          gravity: { type: 'string', enum: ['microgravity', 'earth'] },
          o2_min_pct: { type: 'number', description: 'Keep tests that reached at least this O2 percent' },
          o2_max_pct: { type: 'number', description: 'Keep tests with O2 at or below this percent' },
          pressure_min_psi: { type: 'number' },
          pressure_max_psi: { type: 'number', description: 'Keep tests at or below this pressure in psi' },
          group_by: { type: 'string', enum: ['none', 'phase', 'fuel', 'investigation', 'gravity'], description: 'Default none' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_environment',
      description:
        'Check which PSI tests fall inside a crewed environment atmosphere (O2 and pressure together), per fuel phase, and list the gaps. Use it for the lunar base, pressurized rover, spacesuit, Earth, space station or Mars.',
      parameters: {
        type: 'object',
        required: ['environment'],
        properties: { environment: { type: 'string', enum: ENVIRONMENTS } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_findings',
      description:
        'Get the findings (with their audit grade) and investigation summaries. Use it for qualitative questions: what was learned, why it matters, uses on Earth, and to cite graded findings.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Keywords, e.g. "flame spread solid oxygen"' },
          investigation: { type: 'string', description: 'PSI id or acronym' },
          environment: { type: 'string', enum: ENVIRONMENTS },
        },
      },
    },
  },
]

// Words a small model tends to use instead of the exact enum values.
const SYNONYMS = {
  phase: { solids: 'solid', liquid: 'droplet', liquids: 'droplet', droplets: 'droplet', gases: 'gas', gaseous: 'gas' },
  gravity: { micro: 'microgravity', '0g': 'microgravity', '1g': 'earth', normal: 'earth', ground: 'earth' },
  environment: {
    moon: 'lunar_base', lunar: 'lunar_base', moon_base: 'lunar_base', rover: 'pressurized_rover',
    iss: 'space_station', station: 'space_station', international_space_station: 'space_station',
    mars: 'mars_base', earth: 'earth_sea_level', suit: 'spacesuit', space_suit: 'spacesuit',
  },
  group_by: { fuel_type: 'fuel', fuel_phase: 'phase' },
}

const PHASE_WORDS = new Set(['solid', 'solids', 'droplet', 'droplets', 'liquid', 'liquids', 'gas', 'gases', 'gaseous', 'smoke'])

export function tidyArguments(args) {
  const out = {}
  // A small model often writes the phase as the fuel ("fuel": "solid"); no fuel is named that.
  if (args && typeof args.fuel === 'string' && PHASE_WORDS.has(args.fuel.trim().toLowerCase()) && !args.phase) {
    args = { ...args, phase: args.fuel, fuel: undefined }
  }
  for (const [key, value] of Object.entries(args && typeof args === 'object' ? args : {})) {
    if (value === null || value === undefined || value === '') continue
    if (typeof value === 'string' && SYNONYMS[key]) {
      const word = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
      out[key] = SYNONYMS[key][word] ?? word
    } else if (typeof value === 'string' && /_(pct|psi)$/.test(key) && value.trim() !== '' && !Number.isNaN(Number(value))) {
      out[key] = Number(value) // "30" -> 30
    } else {
      out[key] = value
    }
  }
  return out
}

// Runs: uv run python -m scripts.chat_tools <tool> '<json>'. No shell, fixed command.
export function runPython(config, name, args) {
  return new Promise((resolve) => {
    execFile(
      config.uvCommand,
      ['run', '--quiet', 'python', '-m', 'scripts.chat_tools', name, JSON.stringify(args)],
      { cwd: config.repoRoot, timeout: config.toolTimeoutMs, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        try {
          return resolve(JSON.parse(stdout))
        } catch {
          const reason = error?.code === 'ENOENT' ? `${config.uvCommand} not found; install uv and run "uv sync"` : (stderr || error?.message || 'no output')
          return resolve({ error: `The tool could not run: ${String(reason).trim().slice(0, 300)}` })
        }
      },
    )
  })
}

export function createTools(config, run = runPython) {
  const names = DEFINITIONS.map((d) => d.function.name)
  return {
    definitions: DEFINITIONS,
    async execute(name, args) {
      if (!names.includes(name)) return { error: `Unknown tool "${name}". Use: ${names.join(', ')}.` }
      return run(config, name, tidyArguments(args))
    },
  }
}
