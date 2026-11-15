// Code check: does every number in the answer appear in a tool result, in the question, or in the
// environment conditions? Same idea as the Auditor's Q1: a small model is not reliable with numbers.
// It does not change the answer; it only flags.

// Values from _config/environments.md that answers may repeat.
const ENVIRONMENT_VALUES = [30, 10.2, 21, 14.7, 100, 4.3]

// Remove things with digits that are not quantities: ids, DOIs, check names, "1g", gas formulas, dates.
function strip(text) {
  return String(text ?? '')
    .replace(/\b10\.\d{4,}\/\S+/g, ' ') // DOI
    .replace(/\bPSI-\d+(-T\d+-R\d+)?\b/gi, ' ')
    .replace(/\b(F|C|Q)-?\d+\b/g, ' ')
    .replace(/\b1\s?g\b/gi, ' ')
    .replace(/\b(O2|CO2|N2|C2H4|CH4|H2O?)\b/g, ' ')
    .replace(/\b(19|20)\d{2}-\d{2}-\d{2}\b/g, ' ')
}

export function numbersIn(text) {
  const found = strip(text).match(/\d+(?:\.\d+)?/g) ?? []
  return found.map(Number).filter((n) => Number.isFinite(n))
}

function collect(value, into = new Set()) {
  if (value == null) return into
  if (typeof value === 'number') into.add(value)
  else if (typeof value === 'string') numbersIn(value).forEach((n) => into.add(n))
  else if (typeof value === 'object') Object.values(value).forEach((v) => collect(v, into))
  return into
}

const close = (a, b) => [0, 1, 2].some((d) => Math.abs(Number(b.toFixed(d)) - a) < 1e-9) || Math.abs(a - b) < 1e-9

export function checkNumbers(answer, { results = [], questions = [] } = {}) {
  const known = [...collect([results, questions, ENVIRONMENT_VALUES])]
  const unsourced = []
  for (const n of numbersIn(answer)) {
    if (Number.isInteger(n) && n <= 10) continue // small counts and ordinals: too many false alarms
    if (!known.some((k) => close(n, k)) && !unsourced.includes(n)) unsourced.push(n)
  }
  return { ok: unsourced.length === 0, unsourced_numbers: unsourced }
}
