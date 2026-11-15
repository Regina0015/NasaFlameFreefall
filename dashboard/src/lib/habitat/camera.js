// Camera helpers for the habitat viewer. Plain arrays and numbers only, so they are easy to test.
// The interior camera never moves freely: it follows routes through the passage and hatches,
// and every position is clamped to the walkable volumes, so it cannot pass through a wall.

import { CAMERA_MARGIN, COMPARTMENT_IDS, EYE, HATCH, HATCHES, HATCH_WAYPOINTS, HUB, INNER, VIEWPOINTS, WALL } from './layout.js'

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

// The openings through the walls: narrower than the hatch, and reaching the safe area on both sides.
function hatchVolumes(margin) {
  return HATCHES.map(({ axis, at, along }) => {
    const reach = WALL / 2 + margin
    const half = HATCH.width / 2 - margin
    const y = [margin, Math.min(HATCH.height - margin, EYE + 0.1)]
    return axis === 'x'
      ? { min: [at - reach, y[0], along - half], max: [at + reach, y[1], along + half] }
      : { min: [along - half, y[0], at - reach], max: [along + half, y[1], at + reach] }
  })
}

// Nearest point to `p` inside the union of the inner volumes (kept `margin` from the walls) and the hatch openings.
export function clampToInterior(p, margin = CAMERA_MARGIN) {
  let best = null
  let bestDistance = Infinity
  const consider = (min, max, shrink) => {
    const q = [0, 1, 2].map((i) => {
      const lo = min[i] + shrink
      const hi = max[i] - shrink
      // A volume thinner than twice the margin collapses to its middle.
      return lo > hi ? (min[i] + max[i]) / 2 : clamp(p[i], lo, hi)
    })
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2
    if (d < bestDistance) {
      best = q
      bestDistance = d
    }
  }
  for (const id of COMPARTMENT_IDS) consider(INNER[id].min, INNER[id].max, margin)
  for (const { min, max } of hatchVolumes(margin)) consider(min, max, 0)
  return best
}

// Is the point inside the union of the walkable volumes (with the margin)?
export function insideInterior(p, margin = CAMERA_MARGIN) {
  const q = clampToInterior(p, margin)
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-9
}

// Points from a compartment's viewpoint to the passage hub: through its hatch when it has one.
function toHub(id) {
  const start = VIEWPOINTS[id].position
  return id === 'central-passage' ? [start, HUB] : [start, HATCH_WAYPOINTS[id], HUB]
}

// The route between two viewpoints, always via the hub.
export function routeBetween(fromId, toId) {
  if (fromId === toId) return [VIEWPOINTS[toId].position]
  const up = toHub(fromId)
  const down = toHub(toId).slice().reverse()
  return [...up, ...down.slice(1)]
}

// A point at fraction s (0 to 1) of the way along a polyline, by length.
export function pointAlong(points, s) {
  if (points.length === 1) return points[0]
  const lengths = []
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2])
    lengths.push(d)
    total += d
  }
  let remaining = clamp(s, 0, 1) * total
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? Math.min(remaining / lengths[i], 1) : 1
      return points[i].map((v, k) => v + (points[i + 1][k] - v) * f)
    }
    remaining -= lengths[i]
  }
  return points[points.length - 1]
}

export const smoothstep = (s) => {
  const t = clamp(s, 0, 1)
  return t * t * (3 - 2 * t)
}

// Direction angles: yaw around Y (0 looks toward +Z), pitch up from the horizon.
export function anglesFrom(position, target) {
  const dx = target[0] - position[0]
  const dy = target[1] - position[1]
  const dz = target[2] - position[2]
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

export function directionFrom({ yaw, pitch }) {
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
}

// How far the person may look away from a viewpoint's first direction.
export const LOOK_LIMITS = { yaw: 1.2, pitch: 0.65 }

export function clampLook(look) {
  return { yaw: clamp(look.yaw, -LOOK_LIMITS.yaw, LOOK_LIMITS.yaw), pitch: clamp(look.pitch, -LOOK_LIMITS.pitch, LOOK_LIMITS.pitch) }
}
