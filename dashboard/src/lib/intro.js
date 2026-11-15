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

// Opening shot (before the Earth approach above): a satellite-style view over Monterrey, Mexico that pulls away to the
// full Earth, then hands over to the stages above. All values are editable. Times are in seconds.
export const OPEN = {
  DURATION: 3.6, // total length of the opening; the stages above start after it
  START_ALTITUDE: 0.14, // camera height above the surface at the start, in Earth radii (about 900 km)
  LOAD_WAIT: 2.5, // how long to wait for the regional imagery before skipping the opening
  PIN: { lat: 25.6866, lon: -100.3161 }, // Monterrey, Mexico
  LABEL: 'Monterrey, Mexico',
  // The regional imagery covers exactly this latitude/longitude box (see public/textures/SOURCES.md).
  PATCH: { lonMin: -107, lonMax: -95, latMin: 21, latMax: 31 },
  IMAGE: 'textures/northern-mexico-regional.jpg',
  OUTLINE: 'data/geo/nuevo-leon.geojson', // the state outline (see public/data/geo/SOURCES.md)
  // Fractions of the opening (0 to 1).
  PATCH_FADE: [0.2, 0.55], // the regional imagery gives way to the global Earth map
  GEO_FADE: [0.22, 0.52], // the label, marker and outline fade as they become too small to read
  LOOK_SHIFT: [0.1, 0.9], // the view slides from Monterrey to the centre of the globe
  UP_SHIFT: [0.15, 0.95], // north-up turns into the scene's own up direction (no sudden roll)
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

// Post-login docking transition (seconds from the moment sign-in or Explore demo is confirmed).
// About 5 s in total. Everything on screen follows these constants; adjust them here.
export const DIVE = {
  FORM_OUT: 0.45, // the login panel fades out
  FLIGHT: 3.8, // camera flight: accelerates, then eases into the docking position
  RING_IN_START: 0.2, // the conceptual docking ring fades in
  RING_IN_END: 1.6,
  WELCOME_IN: 2.4, // the welcome panel appears while the camera slows down
  WELCOME_FADE: 0.55,
  WELCOME_OUT: 4.3, // and leaves after a short, readable hold
  REVEAL: 4.4, // the scene fades out and the dashboard content starts its entrance
  FADE_OUT: 0.65,
  TOTAL: 5.1, // the scene layer is removed
  SKIP_FADE: 0.3, // when the person skips
  STREAK_SHIFT: 70, // how far the star field streams past the camera over the flight (scene units)
}

// Flight progress 0..1 and normalized speed 0..1 (the derivative of the same curve).
export const diveProgress = (t) => smoother(t / DIVE.FLIGHT)
export const diveSpeed = (t) => {
  const u = clamp01(t / DIVE.FLIGHT)
  return (30 * u * u * (1 - u) * (1 - u)) / 1.875
}

/**
 * Finds the flat, forward-facing end cap of a module near the station core from surface samples in
 * unit space (the +Z side is the front). Purely geometric: no mesh names. Returns
 * { center: [x, y, z], radius } or null when no such cap exists, so the camera falls back to the core.
 */
export function findDockingTarget(points) {
  const count = points.length / 3
  let zMax = -Infinity
  for (let i = 0; i < count; i++) if (points[i * 3 + 2] > zMax) zMax = points[i * 3 + 2]
  if (!Number.isFinite(zMax)) return null
  let n = 0
  let sx = 0
  let sy = 0
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  for (let i = 0; i < count; i++) {
    const x = points[i * 3]
    const y = points[i * 3 + 1]
    const z = points[i * 3 + 2]
    if (Math.abs(x) > 0.03 || y < -0.3 || y > 0.12 || z < zMax - 0.004) continue
    n += 1
    sx += x
    sy += y
    xMin = Math.min(xMin, x)
    xMax = Math.max(xMax, x)
    yMin = Math.min(yMin, y)
    yMax = Math.max(yMax, y)
  }
  if (n < 40) return null
  const radius = Math.max(xMax - xMin, yMax - yMin) / 2
  if (!(radius > 0.004)) return null
  return { center: [sx / n, sy / n, zMax], radius }
}

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
