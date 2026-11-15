// Timeline and camera path of the login intro. One deterministic function of elapsed time:
// everything on screen is derived from `elapsed`, so skipping, replaying and freezing a
// frame all use the same code path. Durations are in seconds; adjust them here.

// Stage boundaries (each stage may overlap the next).
export const T = {
  APPROACH_END: 2.6, // 1. camera pushes toward Earth
  ORBIT_END: 5.4, // 2. partial orbit around Earth
  DEPART_END: 8.0, //    pull away toward deep space
  GATHER_START: 6.8, // 3. stardust starts gathering (while the camera departs)
  GATHER_END: 8.4,
  WORD_START: 8.0, //    the dust converges into the word "Twisters"
  WORD_END: 9.0,
  WORD_HOLD_END: 10.2, //    the finished word is held (about 1.2 s)
  ASSEMBLE_START: 10.2, // 4. the same particles stream into the station
  ASSEMBLE_END: 12.6,
  STAR_START: 12.2, // 5. ignition shooting star flies in
  STAR_IMPACT: 13.1, //    and arrives
  GLOW_END: 14.2, //    light swell travels through the silhouette
  REVEAL_START: 13.4, //    particle silhouette blends into the model
  REVEAL_END: 14.6,
  TOTAL: 15.6, // 6. settle, then the login appears
}

export const clamp01 = (x) => Math.min(Math.max(x, 0), 1)
export const smooth = (x) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
export const smoother = (x) => {
  const t = clamp01(x)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3)
export const range = (t, a, b) => clamp01((t - a) / (b - a))

// Small seeded random generator so every run looks the same.
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Monotone time -> path-parameter map with continuous velocity (no stop at stage borders).
// Knots are [time, u]; the first and last have zero speed so the camera starts and ends at rest.
const KNOTS = [
  [0, 0],
  [T.APPROACH_END, 0.17],
  [T.ORBIT_END, 0.5],
  [T.DEPART_END, 0.86],
  [T.ASSEMBLE_END, 0.965],
  [T.TOTAL, 1],
]

function knotSlopes() {
  const n = KNOTS.length
  const slopes = new Array(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    const [t0, u0] = KNOTS[i - 1]
    const [t1, u1] = KNOTS[i + 1]
    slopes[i] = (u1 - u0) / (t1 - t0)
  }
  return slopes
}
const SLOPES = knotSlopes()

export function pathParam(t) {
  if (t <= 0) return 0
  if (t >= T.TOTAL) return 1
  let i = 0
  while (i < KNOTS.length - 2 && t > KNOTS[i + 1][0]) i++
  const [t0, u0] = KNOTS[i]
  const [t1, u1] = KNOTS[i + 1]
  const h = t1 - t0
  const s = (t - t0) / h
  const s2 = s * s
  const s3 = s2 * s
  // Cubic Hermite.
  return (
    (2 * s3 - 3 * s2 + 1) * u0 +
    (s3 - 2 * s2 + s) * h * SLOPES[i] +
    (-2 * s3 + 3 * s2) * u1 +
    (s3 - s2) * h * SLOPES[i + 1]
  )
}

/**
 * Camera waypoints, in multiples of `fit` (the distance that frames Earth) until the
 * departure, then relative to the station anchor. Returns plain arrays so the caller
 * can build a CatmullRomCurve3 from them.
 */
export function cameraWaypoints(fit, anchor, stationDistance) {
  const pts = []
  // Approach: straight push toward Earth (matches the earlier intro).
  pts.push([0, 0.06 * fit, 1.4 * fit])
  pts.push([0, 0.06 * fit, 1.15 * fit])
  // Orbit: a partial arc toward the night side, rising a little.
  const radii = [1.0, 0.98, 0.95, 0.93]
  const angles = [0.3, 0.6, 0.95, 1.32] // radians
  angles.forEach((a, i) => {
    const r = radii[i] * fit
    pts.push([Math.sin(a) * r, (0.1 + 0.07 * i) * fit, Math.cos(a) * r])
  })
  // Departure: continue along the orbit's tangent (-z), then bend toward the station.
  // z moves monotonically toward the final position; x and y ease in so the path curves.
  const last = pts[pts.length - 1]
  const start = [last[0] + 0.25 * fit, last[1] + 0.15 * fit, last[2] - 1.6 * fit]
  const finalCam = [anchor[0], anchor[1], anchor[2] + stationDistance]
  pts.push(start)
  for (const f of [0.3, 0.62, 0.86]) {
    const e = smooth(f)
    pts.push([
      start[0] + (finalCam[0] - start[0]) * e,
      start[1] + (finalCam[1] - start[1]) * e,
      start[2] + (finalCam[2] - start[2]) * f,
    ])
  }
  pts.push(finalCam)
  return pts
}
