// Investigation relationship graph: nodes are investigations, edges are rows of the relations table.
// Pure functions only. Nothing here is invented: a relation whose ends are not loaded investigations is
// dropped and counted, and a missing pillar stays "unreviewed".

export const PILLARS = ['prevention', 'detection', 'suppression']
export const RELATION_TYPES = ['same_hardware', 'same_fuel', 'related_in_psi', 'reuses_flight_data']

const has = (value) => value !== null && value !== undefined && value !== ''

// The label drawn on the graph: the acronym when there is one, else a short label, else the PSI id. A ground study
// without an acronym is labeled with its long title, so it falls back to its id; the full title stays on hover,
// focus and in the details. Nothing here is cut with an ellipsis: what is drawn is a complete name or an id.
const MAX_SHORT = 18
export function shortLabel(i) {
  if (has(i.acronym) && i.acronym.length <= MAX_SHORT) return i.acronym
  if (has(i.label) && i.label.length <= MAX_SHORT) return i.label
  return i.id
}

// Up to two short lines for a label, split at the space nearest the middle, so a name like "ACME E-FIELD Flames"
// is complete and narrow instead of cut.
export function labelLines(text, oneLine = 12) {
  if (text.length <= oneLine || !text.includes(' ')) return [text]
  const spaces = [...text].map((c, i) => (c === ' ' ? i : -1)).filter((i) => i >= 0)
  const mid = text.length / 2
  const at = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best), spaces[0])
  return [text.slice(0, at), text.slice(at + 1)]
}

export function buildGraph({ investigations, relations, testCounts }) {
  const ids = new Set(investigations.map((i) => i.id))
  const nodes = investigations.map((i) => ({
    id: i.id,
    label: has(i.label) ? i.label : has(i.acronym) ? i.acronym : i.id,
    short: shortLabel(i),
    title: i.title ?? '',
    doi: has(i.doi) ? i.doi : null,
    type: i.type ?? null,
    platform: has(i.platform) ? i.platform : null,
    hardware: has(i.hardware) ? i.hardware : null,
    tier: i.tier === 1 || i.tier === 2 ? i.tier : null,
    tierReason: has(i.tier_reason) ? i.tier_reason : null,
    // 'none' is a reviewed result (PSI states no fire-safety use) and is kept apart from 'unreviewed' (not reviewed yet).
    pillar: PILLARS.includes(i.pillar) ? i.pillar : i.pillar === 'none' ? 'none' : 'unreviewed',
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

// A hollow ring is drawn for a ground study with no tests of its own, and for pillar = none (reviewed, no stated use).
export function isHollowRing(node) {
  return isHollow(node) || node.pillar === 'none'
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
  const degree = new Map(nodes.map((n) => [n.id, 0]))
  for (const key of pairs.keys()) for (const id of key.split('|')) degree.set(id, (degree.get(id) ?? 0) + 1)
  // Densely connected groups (all the ACME tables share hardware) would otherwise collapse into one clump, so the
  // pull between two well-connected nodes is eased. Distance on the page carries no scientific meaning.
  const links = [...pairs].map(([key, weight]) => {
    const [a, b] = key.split('|')
    const ease = 4 / Math.max(4, Math.sqrt((degree.get(a) ?? 1) * (degree.get(b) ?? 1)))
    return [a, b, (1 + Math.min(weight - 1, 2) * 0.4) * ease]
  })

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
      f.x -= p.x * 0.3 // gravity toward the middle (weaker sideways, so a wide frame is used)
      f.y -= p.y * 0.75
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

  // Fitting can shrink the picture, so circles are separated again in the final coordinates (with room for a label
  // below each one) and kept inside the frame. Deterministic: same data, same picture.
  const ids = sorted.map((n) => n.id)
  const gap = 26
  const lo = padding * 0.6
  for (let pass = 0; pass < 200; pass += 1) {
    let moved = false
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = positions[ids[i]]
        const b = positions[ids[j]]
        const need = radii[ids[i]] + radii[ids[j]] + gap
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.max(Math.hypot(dx, dy), 0.01)
        if (d < need) {
          const shift = (need - d) / 2
          const ux = dx === 0 && dy === 0 ? 1 : dx / d
          const uy = dx === 0 && dy === 0 ? 0 : dy / d
          a.x -= ux * shift
          a.y -= uy * shift
          b.x += ux * shift
          b.y += uy * shift
          moved = true
        }
      }
    }
    for (const id of ids) {
      const p = positions[id]
      p.x = Math.min(Math.max(p.x, lo + radii[id]), width - lo - radii[id])
      p.y = Math.min(Math.max(p.y, lo + radii[id]), height - lo - radii[id] - 14)
    }
    if (!moved) break
  }
  return { positions, radii, width, height }
}

/**
 * Label placement without overlaps, in graph units. A label goes below its circle when it fits, else above, else to
 * the right or left; when none fits at this zoom, the label is hidden (the name is still on hover, focus and in the
 * table). Larger investigations are placed first, the selected one always shows. `pxPerUnit` is screen pixels per
 * graph unit including zoom, so labels free up as the person zooms in.
 */
export function placeLabels(nodes, positions, radii, pxPerUnit, { fontPx = 12, force = [] } = {}) {
  const forced = new Set(force)
  const order = [...nodes].sort((a, b) => radii[b.id] - radii[a.id] || a.id.localeCompare(b.id, 'en', { numeric: true }))
  const placed = []
  const circles = nodes.map((n) => ({ id: n.id, x: positions[n.id].x, y: positions[n.id].y, r: radii[n.id] + 3 }))
  const result = {}
  const hit = (box, other) => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0
  const circleHit = (box, c) => {
    const cx = Math.min(Math.max(c.x, box.x0), box.x1)
    const cy = Math.min(Math.max(c.y, box.y0), box.y1)
    return Math.hypot(cx - c.x, cy - c.y) < c.r
  }
  for (const n of order) {
    const lines = labelLines(n.short)
    const w = (Math.max(...lines.map((l) => l.length)) * fontPx * 0.6 + 6) / pxPerUnit
    const h = (lines.length * fontPx * 1.15 + 3) / pxPerUnit
    const p = positions[n.id]
    const r = radii[n.id]
    const gap = 4 / pxPerUnit
    const candidates = [
      { anchor: 'middle', x: p.x, top: p.y + r + gap },
      { anchor: 'middle', x: p.x, top: p.y - r - gap - h },
      { anchor: 'start', x: p.x + r + gap, top: p.y - h / 2 },
      { anchor: 'end', x: p.x - r - gap, top: p.y - h / 2 },
    ]
    let chosen = null
    for (const c of candidates) {
      const x0 = c.anchor === 'middle' ? c.x - w / 2 : c.anchor === 'start' ? c.x : c.x - w
      const box = { x0, x1: x0 + w, y0: c.top, y1: c.top + h }
      if (placed.some((o) => hit(box, o)) || circles.some((circ) => circ.id !== n.id && circleHit(box, circ))) continue
      chosen = { ...c, box }
      break
    }
    if (chosen) {
      placed.push(chosen.box)
      result[n.id] = { hidden: false, anchor: chosen.anchor, x: chosen.x, y: chosen.top, lines }
    } else if (forced.has(n.id)) {
      const c = candidates[0]
      result[n.id] = { hidden: false, anchor: c.anchor, x: c.x, y: c.top, lines }
    } else {
      result[n.id] = { hidden: true, anchor: 'middle', x: p.x, y: p.y + r + gap, lines }
    }
  }
  return result
}

// The transform (scale and offset in graph units) that fits the given positions into the frame with a margin.
export function fitTransform(points, { width, height, margin = 70, kMin = 0.6, kMax = 4 }) {
  if (!points.length) return { k: 1, x: 0, y: 0 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const k = Math.min(Math.max(Math.min((width - margin * 2) / Math.max(maxX - minX, 1), (height - margin * 2) / Math.max(maxY - minY, 1)), kMin), kMax)
  return { k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k }
}
