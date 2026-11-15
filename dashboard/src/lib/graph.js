// Investigation relationship graph: nodes are investigations, edges are rows of the relations table.
// Pure functions only. Nothing here is invented: a relation whose ends are not loaded investigations is
// dropped and counted, and a missing pillar stays "unreviewed".

export const PILLARS = ['prevention', 'detection', 'suppression']
export const RELATION_TYPES = ['same_hardware', 'same_fuel', 'related_in_psi', 'reuses_flight_data']

const has = (value) => value !== null && value !== undefined && value !== ''

// Long labels (a ground study without an acronym is labeled with its title) are cut on the graph only.
function shorten(text, max = 18) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function buildGraph({ investigations, relations, testCounts }) {
  const ids = new Set(investigations.map((i) => i.id))
  const nodes = investigations.map((i) => ({
    id: i.id,
    label: has(i.label) ? i.label : has(i.acronym) ? i.acronym : i.id,
    short: shorten(has(i.label) ? i.label : has(i.acronym) ? i.acronym : i.id),
    title: i.title ?? '',
    doi: has(i.doi) ? i.doi : null,
    type: i.type ?? null,
    platform: has(i.platform) ? i.platform : null,
    hardware: has(i.hardware) ? i.hardware : null,
    tier: i.tier === 1 || i.tier === 2 ? i.tier : null,
    tierReason: has(i.tier_reason) ? i.tier_reason : null,
    pillar: PILLARS.includes(i.pillar) ? i.pillar : 'unreviewed',
    summaryStudent: has(i.summary_student) ? i.summary_student : null,
    summaryProfessional: has(i.summary_professional) ? i.summary_professional : null,
    tests: testCounts[i.id] ?? 0,
  }))

  let dropped = 0
  const edges = []
  for (const r of relations) {
    if (!ids.has(r.from_id) || !ids.has(r.to_id) || r.from_id === r.to_id || !RELATION_TYPES.includes(r.type)) {
      dropped += 1
      continue
    }
    edges.push({ id: `${r.from_id}|${r.to_id}|${r.type}`, from: r.from_id, to: r.to_id, type: r.type, source: has(r.source) ? r.source : null })
  }

  // Parallel edges between the same pair (different types) get a lane so they can be drawn apart.
  const seen = new Map()
  for (const edge of edges) {
    const key = [edge.from, edge.to].sort().join('|')
    const list = seen.get(key) ?? []
    list.push(edge)
    seen.set(key, list)
  }
  for (const list of seen.values()) list.forEach((edge, i) => Object.assign(edge, { lane: i, lanes: list.length }))

  return { nodes, edges, dropped }
}

// Circle radius from the test count, so the AREA follows it. Ground studies with no tests of their own
// are small hollow circles.
export const HOLLOW_RADIUS = 8
export function nodeRadius(node, maxTests) {
  if (node.tests === 0) return HOLLOW_RADIUS
  return 9 + 25 * Math.sqrt(node.tests / Math.max(maxTests, 1))
}

export function isHollow(node) {
  return node.type === 'ground' && node.tests === 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deterministic force layout (the same data always gives the same picture). It runs once, up front,
// so nothing moves on screen, which also suits reduced motion.
export function layoutGraph(nodes, edges, { width = 1000, height = 640, padding = 70 } = {}) {
  if (!nodes.length) return { positions: {}, radii: {}, width, height }
  const maxTests = Math.max(...nodes.map((n) => n.tests), 1)
  const radii = Object.fromEntries(nodes.map((n) => [n.id, nodeRadius(n, maxTests)]))
  const rand = mulberry32(20261114)
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  const pos = new Map()
  sorted.forEach((n, i) => {
    const angle = (i / sorted.length) * Math.PI * 2
    pos.set(n.id, { x: Math.cos(angle) * 300 + (rand() - 0.5) * 20, y: Math.sin(angle) * 200 + (rand() - 0.5) * 20 })
  })

  // Each pair attracts once, with a little more pull when several relation types join it.
  const pairs = new Map()
  for (const e of edges) {
    const key = [e.from, e.to].sort().join('|')
    pairs.set(key, (pairs.get(key) ?? 0) + 1)
  }
  const links = [...pairs].map(([key, weight]) => [...key.split('|'), 1 + Math.min(weight - 1, 2) * 0.4])

  const k = Math.sqrt((width * height) / nodes.length) * 1.1
  const iterations = 320
  for (let step = 0; step < iterations; step += 1) {
    const temperature = 1 - step / iterations
    const force = new Map(sorted.map((n) => [n.id, { x: 0, y: 0 }]))
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = pos.get(sorted[i].id)
        const b = pos.get(sorted[j].id)
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d = Math.hypot(dx, dy)
        if (d < 0.01) {
          dx = rand() - 0.5
          dy = rand() - 0.5
          d = Math.hypot(dx, dy)
        }
        const push = (k * k) / d
        const fx = (dx / d) * push
        const fy = (dy / d) * push
        force.get(sorted[i].id).x += fx
        force.get(sorted[i].id).y += fy
        force.get(sorted[j].id).x -= fx
        force.get(sorted[j].id).y -= fy
      }
    }
    for (const [from, to, weight] of links) {
      const a = pos.get(from)
      const b = pos.get(to)
      const dx = a.x - b.x
      const dy = a.y - b.y
      const d = Math.max(Math.hypot(dx, dy), 0.01)
      const pull = ((d * d) / k) * 0.2 * weight
      force.get(from).x -= (dx / d) * pull
      force.get(from).y -= (dy / d) * pull
      force.get(to).x += (dx / d) * pull
      force.get(to).y += (dy / d) * pull
    }
    for (const n of sorted) {
      const p = pos.get(n.id)
      const f = force.get(n.id)
      f.x -= p.x * 0.45 // gravity toward the middle
      f.y -= p.y * 0.7
      const mag = Math.max(Math.hypot(f.x, f.y), 0.01)
      const move = Math.min(mag, 40 * temperature + 1)
      p.x += (f.x / mag) * move
      p.y += (f.y / mag) * move
    }
  }

  // Push overlapping circles apart (with room for labels), then fit everything into the view box.
  for (let pass = 0; pass < 120; pass += 1) {
    let moved = false
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = pos.get(sorted[i].id)
        const b = pos.get(sorted[j].id)
        const need = radii[sorted[i].id] + radii[sorted[j].id] + 44
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.max(Math.hypot(dx, dy), 0.01)
        if (d < need) {
          const shift = (need - d) / 2
          a.x -= (dx / d) * shift
          a.y -= (dy / d) * shift
          b.x += (dx / d) * shift
          b.y += (dy / d) * shift
          moved = true
        }
      }
    }
    if (!moved) break
  }

  const xs = sorted.map((n) => pos.get(n.id).x)
  const ys = sorted.map((n) => pos.get(n.id).y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const scale = Math.min((width - padding * 2) / Math.max(maxX - minX, 1), (height - padding * 2) / Math.max(maxY - minY, 1))
  const positions = {}
  for (const n of sorted) {
    const p = pos.get(n.id)
    positions[n.id] = {
      x: width / 2 + (p.x - (minX + maxX) / 2) * scale,
      y: height / 2 + (p.y - (minY + maxY) / 2) * scale,
    }
  }
  return { positions, radii, width, height }
}
