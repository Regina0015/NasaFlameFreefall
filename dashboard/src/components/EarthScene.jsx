import { useEffect, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  LinearMipmapLinearFilter,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  TorusGeometry,
  PerspectiveCamera,
  Quaternion,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'

import {
  DIVE,
  T,
  cameraWaypoints,
  clamp01,
  diveProgress,
  diveSpeed,
  easeOut,
  findDockingTarget,
  mulberry32,
  pathParam,
  range,
  smooth,
  smoother,
} from '../lib/intro.js'
import { analyseStation, applyHologram, loadStation, makeAssembly, makeWordTargets } from '../lib/stationParticles.js'

// NASA SVS 3615 equirectangular map (see public/textures/SOURCES.md). Clouds are baked in.
const EARTH_MAP = 'textures/earth-surface-2k.jpg'

// ---------- Earth ----------

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(uSun);
    vec3 albedo = texture2D(uMap, vUv).rgb; // linear

    // Ocean mask from colour: blue-dominant and not white (clouds and ice stay untouched).
    float blueness = albedo.b - max(albedo.r, albedo.g * 0.85);
    float whiteness = min(albedo.r, min(albedo.g, albedo.b));
    float ocean = smoothstep(0.0, 0.07, blueness) * (1.0 - smoothstep(0.3, 0.55, whiteness));

    // Deepen the ocean toward a natural deep blue.
    vec3 deep = albedo * vec3(0.38, 0.56, 0.95);
    albedo = mix(albedo, deep, ocean * 0.85);

    float ndl = dot(N, L);
    float day = smoothstep(-0.14, 0.3, ndl);   // soft terminator
    float lit = max(ndl, 0.0);
    vec3 nightTint = vec3(0.012, 0.02, 0.04);
    vec3 color = albedo * (0.05 + 1.15 * lit * day) + nightTint * (1.0 - day);

    // Subtle ocean reflection: broad and dim so it never reads as plastic.
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0) * ocean * day * 0.22;
    color += vec3(0.75, 0.85, 1.0) * spec;

    // Thin blue limb on the lit side.
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);
    color += vec3(0.22, 0.48, 0.95) * rim * 0.28 * smoothstep(-0.35, 0.45, ndl);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

const ATMOSPHERE_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 4.0);
    gl_FragColor = vec4(uColor, rim * 0.42);
  }
`

// ---------- Particles (orbiting stardust) ----------

const PARTICLE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPixel;
  attribute vec4 aOrbit;   // radius, phase, speed, tilt index
  attribute vec3 aMisc;    // vertical offset, size, cyan mix
  varying float vCyan;
  varying float vAlpha;

  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

  void main() {
    float angle = aOrbit.y + uTime * aOrbit.z;
    // Slightly elliptical, wobbling radius keeps the streams curved rather than circular.
    float r = aOrbit.x * (1.0 + 0.08 * sin(angle * 2.0 + aOrbit.y));
    vec3 p = vec3(cos(angle) * r * 1.15, aMisc.x, sin(angle) * r);
    p = rotZ(aOrbit.w * 0.45 - 0.5) * rotX(aOrbit.w * 0.7 + 0.9) * p;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aMisc.y * uPixel * (13.0 / -mv.z), 4.0 * uPixel);
    vCyan = aMisc.z;
    vAlpha = uFade;
  }
`

const PARTICLE_FRAG = /* glsl */ `
  uniform vec3 uSilver;
  uniform vec3 uCyan;
  varying float vCyan;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d) * vAlpha * 0.85;
    gl_FragColor = vec4(mix(uSilver, uCyan, vCyan), a);
  }
`

function makeParticles(count, pixelRatio, rng) {
  const orbit = new Float32Array(count * 4)
  const misc = new Float32Array(count * 3)
  const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5
  for (let i = 0; i < count; i++) {
    const tilt = Math.floor(rng() * 5)
    orbit[i * 4] = 1.3 + rng() * 1.1 + tilt * 0.06
    orbit[i * 4 + 1] = rng() * Math.PI * 2
    orbit[i * 4 + 2] = (0.05 + rng() * 0.1) * (tilt % 2 ? 1 : 0.8)
    orbit[i * 4 + 3] = tilt
    misc[i * 3] = gauss() * 0.07
    misc[i * 3 + 1] = 0.6 + rng() * 1.1
    misc[i * 3 + 2] = rng() < 0.22 ? 1 : 0
  }
  const geometry = new BufferGeometry()
  // `position` is required by three for draw-range bookkeeping; real positions come from the shader.
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aOrbit', new BufferAttribute(orbit, 4))
  geometry.setAttribute('aMisc', new BufferAttribute(misc, 3))
  const material = new ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 0 },
      uPixel: { value: pixelRatio },
      uSilver: { value: new Color('#dfe7ee') },
      uCyan: { value: new Color('#5fdcf0') },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  return points
}

// ---------- Stars: layered silver-white and icy blue, with a faint twinkle ----------

const STAR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixel;
  uniform float uDim;
  attribute float aSize;
  attribute float aTint;
  attribute float aPhase;
  varying float vTint;
  varying float vAlpha;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixel;
    float twinkle = 0.82 + 0.18 * sin(uTime * (0.6 + aPhase * 0.5) + aPhase * 40.0);
    vTint = aTint;
    vAlpha = twinkle * uDim * (0.6 + 0.4 * min(aSize / 2.4, 1.0));
  }
`

const STAR_FRAG = /* glsl */ `
  uniform vec3 uSilver;
  uniform vec3 uIce;
  varying float vTint;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(mix(uSilver, uIce, vTint), core * core * vAlpha);
  }
`

function makeStars(count, pixelRatio, rng) {
  const pos = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const tint = new Float32Array(count)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1
    const t = rng() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = 40
    pos.set([s * Math.cos(t) * r, u * r, s * Math.sin(t) * r], i * 3)
    // Three layers: many faint pinpoints, some medium, a few bright.
    const roll = rng()
    size[i] = roll < 0.86 ? 1.5 + rng() * 0.7 : roll < 0.985 ? 2.0 + rng() * 0.8 : 3.6 + rng() * 1.2
    tint[i] = rng() < 0.35 ? 1 : rng() * 0.25
    phase[i] = rng()
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(pos, 3))
  geometry.setAttribute('aSize', new BufferAttribute(size, 1))
  geometry.setAttribute('aTint', new BufferAttribute(tint, 1))
  geometry.setAttribute('aPhase', new BufferAttribute(phase, 1))
  const material = new ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uPixel: { value: pixelRatio },
      uDim: { value: 1 },
      uSilver: { value: new Color('#eef3f8') },
      uIce: { value: new Color('#a8d2f5') },
    },
    transparent: true,
    depthWrite: false,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  return points
}

// ---------- Nebula: faint blue-gray depth behind the stars ----------

const NEBULA_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const NEBULA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  varying vec3 vDir;

  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 p = vDir * 2.2 + vec3(uTime * 0.004, 0.0, 0.0);
    float n = fbm(p);
    float cloud = smoothstep(0.5, 0.82, n);
    // Keep it faint and cool: blue-gray, never bright.
    vec3 color = mix(vec3(0.05, 0.08, 0.12), vec3(0.28, 0.4, 0.55), cloud);
    gl_FragColor = vec4(color, cloud * 0.34 * uDim);
  }
`

// ---------- Shooting stars: tapered trails, only during the intro ----------

const SHOOT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SHOOT_FRAG = /* glsl */ `
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    // vUv.x runs tail (0) to head (1). The trail is a sliver that widens toward the head.
    float halfWidth = 0.5 * pow(vUv.x, 1.6);
    float across = abs(vUv.y - 0.5);
    float edge = smoothstep(halfWidth, halfWidth * 0.2, across);
    float glow = pow(vUv.x, 2.4);
    vec3 color = mix(vec3(0.7, 0.85, 1.0), vec3(1.0), pow(vUv.x, 6.0));
    gl_FragColor = vec4(color, edge * glow * uAlpha);
  }
`

// Fixed, hand-placed schedule so the intro is the same every time: start (s), head start/end in world units.
const SHOOTING = [
  { at: 1.4, from: [-4.6, 2.6], to: [-1.6, 1.6], len: 1.5 },
  { at: 2.9, from: [4.6, 3.0], to: [1.4, 1.4], len: 1.8 },
  { at: 4.1, from: [-3.6, -0.2], to: [-5.4, -2.6], len: 1.2 },
  { at: 5.2, from: [5.2, 0.8], to: [2.2, -1.8], len: 1.6 },
]
const SHOOT_DURATION = 0.9

function makeShootingStars() {
  const geometry = new PlaneGeometry(1, 0.06)
  geometry.translate(-0.5, 0, 0) // head at the origin, trail extends toward -x
  const meshes = SHOOTING.map((s) => {
    const material = new ShaderMaterial({
      vertexShader: SHOOT_VERT,
      fragmentShader: SHOOT_FRAG,
      uniforms: { uAlpha: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    })
    const mesh = new Mesh(geometry, material)
    mesh.visible = false
    mesh.scale.x = s.len
    mesh.rotation.z = Math.atan2(s.to[1] - s.from[1], s.to[0] - s.from[0])
    return mesh
  })
  return { geometry, meshes }
}

// ---------- Docking flight: star streaks (one batched LineSegments, driven by two uniforms) ----------

const STREAK_DEPTH = 46 // streaks live between 1 and this many units ahead of the camera, in camera space
const STREAK_VERT = /* glsl */ `
  uniform float uShift;
  uniform float uSpeed;
  uniform float uDepth;
  attribute float aEnd;     // 0 head (nearer), 1 tail (farther)
  attribute float aLen;
  attribute float aTint;
  varying float vAlpha;
  varying float vTint;
  void main() {
    float d = mod(position.z - uShift, uDepth) + 1.0;
    float z = d + aEnd * aLen * uSpeed * 5.0;
    vec4 mv = modelViewMatrix * vec4(position.x, position.y, -z, 1.0);
    gl_Position = projectionMatrix * mv;
    float near = smoothstep(1.0, 4.0, d);
    float far = 1.0 - smoothstep(uDepth * 0.55, uDepth, d);
    vAlpha = uSpeed * near * far * (1.0 - 0.9 * aEnd) * 0.7;
    vTint = aTint;
  }
`
const STREAK_FRAG = /* glsl */ `
  uniform vec3 uSilver;
  uniform vec3 uIce;
  varying float vAlpha;
  varying float vTint;
  void main() {
    gl_FragColor = vec4(mix(uSilver, uIce, vTint), vAlpha);
  }
`

function makeStreaks(count, rng) {
  const pos = new Float32Array(count * 6)
  const end = new Float32Array(count * 2)
  const len = new Float32Array(count * 2)
  const tint = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2
    // Outside the central cone, so streaks sweep past the edges and never pile up at screen centre.
    const r = 0.9 + Math.pow(rng(), 1.7) * 13
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    const z = rng() * STREAK_DEPTH
    const l = 0.6 + rng() * 1.1
    const c = rng() < 0.35 ? 1 : rng() * 0.2
    for (let k = 0; k < 2; k++) {
      pos.set([x, y, z], i * 6 + k * 3)
      end[i * 2 + k] = k
      len[i * 2 + k] = l
      tint[i * 2 + k] = c
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(pos, 3))
  geometry.setAttribute('aEnd', new BufferAttribute(end, 1))
  geometry.setAttribute('aLen', new BufferAttribute(len, 1))
  geometry.setAttribute('aTint', new BufferAttribute(tint, 1))
  const material = new ShaderMaterial({
    vertexShader: STREAK_VERT,
    fragmentShader: STREAK_FRAG,
    uniforms: {
      uShift: { value: 0 },
      uSpeed: { value: 0 },
      uDepth: { value: STREAK_DEPTH },
      uSilver: { value: new Color('#eef3f8') },
      uIce: { value: new Color('#9fdcf0') },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  })
  const lines = new LineSegments(geometry, material)
  lines.frustumCulled = false
  lines.renderOrder = 5
  lines.visible = false
  return lines
}

// A restrained, conceptual docking ring placed on the measured end cap (in the station's unit space).
// It is an exterior detail only: a closed hatch cover with a ring and a thin cyan accent. Nothing
// suggests an opening or an interior.
function makeDock(target) {
  const R = target.radius * 1.35
  const tube = R * 0.09
  const group = new Group()
  group.position.set(target.center[0], target.center[1], target.center[2] + tube * 0.5)
  group.visible = false
  const make = (geometry, color, base) => {
    const material = new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
    const mesh = new Mesh(geometry, material)
    mesh.renderOrder = 3
    group.add(mesh)
    return { geometry, material, base }
  }
  const parts = [
    make(new CircleGeometry(R * 0.72, 48), '#08131b', 0.6),
    make(new TorusGeometry(R, tube, 12, 72), '#b8c8d8', 0.9),
    make(new RingGeometry(R * 0.74, R * 0.79, 72), '#53d8ed', 0.75),
  ]
  parts[0].geometry.translate(0, 0, -tube * 0.3)
  return {
    group,
    radius: R,
    geometries: parts.map((p) => p.geometry),
    materials: parts.map((p) => p.material),
    base: parts.map((p) => p.base),
  }
}

const STATION_DISTANCE = 14 // camera distance to the station at the end of the intro
const CAMERA_PLANE = 9 // depth of camera-space effects (shooting stars)
const SEED = 20260921

/**
 * Full-screen cinematic intro: Earth approach, orbit and departure, stardust gathering,
 * particle assembly of the NASA station model, a shooting-star ignition, then a settled
 * composition behind the login. Everything is a pure function of `elapsed` (see lib/intro.js).
 *
 * Props: reducedMotion and startFinal show the settled end state at once; skipSignal jumps to
 * it; replaySignal restarts the sequence. onIntroDone fires when the login may appear;
 * onFail fires if WebGL is unavailable. diveSignal starts the one-way docking flight that follows a
 * confirmed sign-in (it continues from the settled composition and never replays the intro).
 */
export default function EarthScene({
  reducedMotion,
  startFinal,
  ambientPaused,
  skipSignal,
  replaySignal,
  diveSignal = 0,
  onIntroDone,
  onFail,
}) {
  const hostRef = useRef(null)
  const skipRef = useRef(skipSignal)
  const replayRef = useRef(replaySignal)
  const diveRef = useRef(diveSignal)
  const diveFnRef = useRef(null)
  const doneRef = useRef(onIntroDone)
  const failRef = useRef(onFail)
  const startFinalRef = useRef(startFinal)
  const skipFnRef = useRef(null)
  const pausedRef = useRef(ambientPaused)
  const pauseFnRef = useRef(null)
  const replayFnRef = useRef(null)
  doneRef.current = onIntroDone
  failRef.current = onFail

  useEffect(() => {
    if (skipRef.current !== skipSignal) {
      skipRef.current = skipSignal
      skipFnRef.current?.()
    }
  }, [skipSignal])

  // Pausing or resuming the ambient background motion.
  useEffect(() => {
    pausedRef.current = ambientPaused
    pauseFnRef.current?.()
  }, [ambientPaused])

  useEffect(() => {
    if (replayRef.current !== replaySignal) {
      replayRef.current = replaySignal
      replayFnRef.current?.()
    }
  }, [replaySignal])

  useEffect(() => {
    if (diveRef.current !== diveSignal) {
      diveRef.current = diveSignal
      diveFnRef.current?.()
    }
  }, [diveSignal])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    let renderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch {
      failRef.current?.()
      return undefined
    }
    if (!renderer.getContext()) {
      failRef.current?.()
      return undefined
    }

    const rng = mulberry32(SEED)
    const small = window.matchMedia('(max-width: 700px)').matches
    const pixelRatio = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2)
    renderer.setPixelRatio(pixelRatio)
    renderer.setClearColor('#06080b', 1)
    host.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('aria-hidden', 'true')

    const scene = new Scene()
    const camera = new PerspectiveCamera(38, 1, 0.1, 600)
    scene.add(camera) // camera-space effects are children of the camera

    // Dev only: ?t=<seconds> freezes the sequence on one frame for inspection.
    const debugParam = import.meta.env.DEV ? parseFloat(new URLSearchParams(window.location.search).get('t')) : NaN
    const frozen = Number.isFinite(debugParam)

    // Background layers follow the camera so the sky never parallaxes during the long flight.
    const nebulaGeometry = new SphereGeometry(60, 32, 24)
    const nebulaMaterial = new ShaderMaterial({
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      uniforms: { uTime: { value: 0 }, uDim: { value: 1 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: BackSide,
    })
    const nebula = new Mesh(nebulaGeometry, nebulaMaterial)
    nebula.renderOrder = -2
    scene.add(nebula)

    const stars = makeStars(small ? 1800 : 4200, pixelRatio, rng)
    stars.renderOrder = -1
    scene.add(stars)
    // A second, sparser layer turning at its own pace gives the ambient drift some depth.
    const starsNear = makeStars(small ? 500 : 1300, pixelRatio, rng)
    starsNear.renderOrder = -1
    starsNear.scale.setScalar(0.82)
    scene.add(starsNear)

    const shooting = makeShootingStars()
    shooting.meshes.forEach((m) => {
      m.position.z = -CAMERA_PLANE
      camera.add(m)
    })

    // Ignition shooting star: one bright, tapered streak that arcs into the station.
    const igniteGeometry = new PlaneGeometry(1, 0.1)
    igniteGeometry.translate(-0.5, 0, 0)
    const igniteMaterial = new ShaderMaterial({
      vertexShader: SHOOT_VERT,
      fragmentShader: SHOOT_FRAG,
      uniforms: { uAlpha: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    })
    const ignite = new Mesh(igniteGeometry, igniteMaterial)
    ignite.visible = false
    ignite.scale.x = 2.8
    ignite.position.z = -CAMERA_PLANE
    camera.add(ignite)

    // Docking flight (only after a confirmed sign-in): its own random stream, so the opening is untouched.
    const streaks = makeStreaks(small ? 420 : 900, mulberry32(SEED + 7))
    camera.add(streaks)
    let dock = null // { group, radius, materials, geometries, base } once the station is loaded
    let diving = false
    let diveStart = 0
    let diveT = 0
    const diveFrom = new Vector3()
    const diveLook = new Vector3()
    const diveFocus = new Vector3()
    const diveEnd = new Vector3()
    const diveNormal = new Vector3()
    const diveSide = new Vector3()
    const worldUp = new Vector3(0, 1, 0)

    // Earth.
    let finished = false
    let disposed = false
    let earthTexture = null
    const sun = new Vector3(-0.75, 0.38, 0.62)
    const earthGeometry = new SphereGeometry(1, 128, 96)
    const earthMaterial = new ShaderMaterial({
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
      uniforms: { uMap: { value: null }, uSun: { value: sun } },
    })
    const earth = new Mesh(earthGeometry, earthMaterial)
    earth.visible = false
    const tilt = new Group()
    tilt.rotation.z = 0.2
    tilt.rotation.x = 0.28
    tilt.add(earth)
    scene.add(tilt)
    const baseRotation = -Math.PI / 3

    const atmosphereMaterial = new ShaderMaterial({
      vertexShader: ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      uniforms: { uColor: { value: new Color('#5aa9e0') } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: BackSide,
    })
    const atmosphereGeometry = new SphereGeometry(1.03, 96, 64)
    scene.add(new Mesh(atmosphereGeometry, atmosphereMaterial))

    const particles = makeParticles(small ? 3200 : 7000, pixelRatio, rng)
    scene.add(particles)

    // Station: the group holds position, scale and tilt; the particle silhouette and the
    // model both live in the same unit space inside it.
    const stationGroup = new Group()
    stationGroup.rotation.set(0.2, -0.32, 0)
    stationGroup.visible = false
    scene.add(stationGroup)
    const holoShared = {
      uAnchor: { value: new Vector3() },
      uInvScale: { value: 1 },
      uReveal: { value: 0 },
      uTime: { value: 0 },
    }
    const wordInverse = new Quaternion().setFromEuler(stationGroup.rotation).invert()
    let station = null // { assembly, root, pivot, materials, size }
    let stationState = 'loading' // 'loading' | 'ready' | 'failed'

    // Layout depends on the screen shape.
    let fitDistance = 4
    let curve = null
    let aim = new Vector3()
    const lookAt = new Vector3()
    const impact = new Vector3()
    const layout = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      renderer.setSize(width, height, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = width / height
      const vHalf = (camera.fov * Math.PI) / 360
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect)
      fitDistance = 1 / Math.sin(Math.min(vHalf, hHalf)) / 0.78
      camera.updateProjectionMatrix()

      const visibleW = 2 * STATION_DISTANCE * Math.tan(hHalf)
      const visibleH = 2 * STATION_DISTANCE * Math.tan(vHalf)
      const sizeY = station ? Math.max(station.size.y, 0.15) : 0.4
      // Wide enough that the solar arrays stay visible around the login panel.
      const scale = Math.min(visibleW * 0.92, (visibleH * 0.78) / sizeY)
      // On tall screens the station sits in the upper part, above the form.
      const shiftY = camera.aspect < 0.9 ? visibleH * 0.2 : 0
      const stationPos = new Vector3(2.6 * fitDistance, 0.6 * fitDistance, -9 * fitDistance)
      stationGroup.position.copy(stationPos)
      stationGroup.scale.setScalar(scale)
      holoShared.uAnchor.value.copy(stationPos)
      holoShared.uInvScale.value = 1 / scale
      // The word faces the camera and sits at screen centre, even though the station group is tilted.
      if (station) {
        const wu = station.assembly.material.uniforms
        wu.uWordScale.value = camera.aspect < 0.9 ? 0.92 : 0.6
        wu.uWordCenter.value.set(0, -shiftY / scale, 0).applyQuaternion(wordInverse)
      }
      aim = stationPos.clone().add(new Vector3(0, -shiftY, 0))
      const points = cameraWaypoints(fitDistance, [aim.x, aim.y, aim.z], STATION_DISTANCE).map(
        (p) => new Vector3(p[0], p[1], p[2]),
      )
      curve = new CatmullRomCurve3(points, false, 'centripetal')
    }
    layout()

    let elapsed = 0
    let frame = 0
    let last = 0
    let announced = false

    const announce = () => {
      if (announced) return
      announced = true
      doneRef.current?.()
    }

    // Draws the frame for time `t`. A pure function of t and the loaded assets.
    const draw = (t, ambient = 0) => {
      const fallback = stationState === 'failed'
      const tt = fallback ? Math.min(t, T.ORBIT_END) : t

      // Camera: continuous position and look-at along one curve.
      camera.position.copy(curve.getPoint(pathParam(tt)))
      const swing = smoother(range(tt, T.ORBIT_END + 0.9, T.DEPART_END + 0.8))
      lookAt.set(0, 0, 0).lerp(aim, swing)
      camera.lookAt(lookAt)

      // Docking flight: starts from the settled composition above and ends in front of the hatch.
      let ringFade = 0
      if (diving) {
        const s = diveProgress(diveT)
        const speed = diveSpeed(diveT)
        diveFrom.copy(camera.position)
        diveLook.copy(lookAt)
        if (dock && !fallback) {
          stationGroup.updateMatrixWorld(true)
          diveFocus.copy(dock.group.position)
          stationGroup.localToWorld(diveFocus)
          diveNormal.set(0, 0, 1).applyQuaternion(stationGroup.quaternion)
          diveEnd.copy(diveFocus).addScaledVector(diveNormal, 5.5 * dock.radius * stationGroup.scale.x)
        } else {
          // No suitable hatch (or no station): push gently toward the station core, or toward Earth.
          diveFocus.copy(fallback ? earth.position : aim)
          diveNormal.copy(diveFrom).sub(diveFocus).normalize()
          diveEnd.copy(diveFocus).addScaledVector(diveNormal, fallback ? 2.6 : diveFrom.distanceTo(diveFocus) * 0.4)
        }
        camera.position.lerpVectors(diveFrom, diveEnd, s)
        // A very slight lateral arc keeps the flight from reading as a flat zoom.
        diveSide.subVectors(diveEnd, diveFrom).cross(worldUp).normalize()
        camera.position.addScaledVector(diveSide, Math.sin(Math.PI * s) * 0.02 * diveFrom.distanceTo(diveEnd))
        lookAt.lerpVectors(diveLook, diveFocus, smoother(range(s, 0, 0.85)))
        camera.lookAt(lookAt)
        streaks.material.uniforms.uSpeed.value = speed
        streaks.material.uniforms.uShift.value = s * DIVE.STREAK_SHIFT
        ringFade = smooth(range(diveT, DIVE.RING_IN_START, DIVE.RING_IN_END))
      }
      streaks.visible = diving && streaks.material.uniforms.uSpeed.value > 0.002
      if (dock) {
        dock.group.visible = ringFade > 0.002 && !fallback
        dock.materials.forEach((m, i) => {
          m.opacity = dock.base[i] * ringFade
        })
      }
      camera.updateMatrixWorld(true)

      earth.rotation.y = baseRotation + Math.min(tt, T.ORBIT_END) * 0.02

      const settle = smooth(range(tt, T.REVEAL_END, T.TOTAL))
      const oldFade = 1 - smooth(range(tt, T.ORBIT_END - 0.4, T.DEPART_END))
      particles.visible = oldFade > 0.002
      particles.material.uniforms.uTime.value = Math.min(tt, T.ORBIT_END + 1)
      particles.material.uniforms.uFade.value = easeOut(tt / 3) * 0.8 * oldFade

      stars.position.copy(camera.position)
      nebula.position.copy(camera.position)
      // Background drift: after the intro only the stars keep moving, slowly.
      const sky = Math.min(tt, T.TOTAL) + ambient
      stars.material.uniforms.uTime.value = sky
      stars.material.uniforms.uDim.value = 1 - 0.4 * settle
      stars.rotation.y = sky * 0.004
      starsNear.position.copy(camera.position)
      starsNear.material.uniforms.uTime.value = sky * 1.3 + 7
      starsNear.material.uniforms.uDim.value = 1 - 0.4 * settle
      starsNear.rotation.y = -sky * 0.007
      starsNear.rotation.x = sky * 0.002
      nebulaMaterial.uniforms.uTime.value = sky
      nebulaMaterial.uniforms.uDim.value = 1 - 0.35 * settle

      // Small shooting stars during the Earth stages only.
      shooting.meshes.forEach((mesh, i) => {
        const s = SHOOTING[i]
        const p = (tt - s.at) / SHOOT_DURATION
        const active = tt < T.DEPART_END && p >= 0 && p <= 1
        mesh.visible = active
        if (!active) return
        const k = easeOut(p)
        mesh.position.x = s.from[0] + (s.to[0] - s.from[0]) * k
        mesh.position.y = s.from[1] + (s.to[1] - s.from[1]) * k
        mesh.material.uniforms.uAlpha.value = Math.sin(Math.PI * Math.min(p * 1.15, 1)) * 0.85
      })

      // Station sequence.
      const showStation = station !== null && !fallback && tt >= T.GATHER_START - 0.1
      stationGroup.visible = showStation
      ignite.visible = false
      if (showStation) {
        const u = station.assembly.material.uniforms
        u.uGather.value = smoother(range(tt, T.GATHER_START, T.GATHER_END))
        u.uAssemble.value = range(tt, T.ASSEMBLE_START, T.ASSEMBLE_END)
        // The gathering cloud turns slowly until assembly starts, then holds still.
        u.uWord.value = smoother(range(tt, T.WORD_START, T.WORD_END))
        u.uSpin.value = 0.35 * clamp01(tt - T.GATHER_START) * Math.min(1, T.WORD_START - T.GATHER_START)
        const g = range(tt, T.STAR_IMPACT, T.GLOW_END)
        u.uGlowAmt.value = Math.pow(Math.sin(Math.PI * g), 1.3)
        u.uGlowPos.value = -0.62 + 1.24 * smooth(g)
        const reveal = smoother(range(tt, T.REVEAL_START, T.REVEAL_END))
        u.uFade.value = 0.85 * (1 - 0.45 * reveal) * (1 - 0.35 * settle)
        holoShared.uReveal.value = reveal
        holoShared.uTime.value = Math.min(tt, T.TOTAL)
        station.root.visible = reveal > 0.001

        // Ignition: one tapered star arcs into the left end of the silhouette.
        const k = range(tt, T.STAR_START, T.STAR_IMPACT)
        if (k > 0 && k < 1) {
          impact.set(-0.42, 0.02, 0)
          stationGroup.updateMatrixWorld(true)
          stationGroup.localToWorld(impact)
          impact.applyMatrix4(camera.matrixWorldInverse)
          const depth = Math.max(-impact.z, 0.5)
          const ex = (impact.x * CAMERA_PLANE) / depth
          const ey = (impact.y * CAMERA_PLANE) / depth
          const sx = 6.6
          const sy = 3.5
          const cx = 0.8
          const cy = 4.4
          const kk = Math.pow(k, 1.45)
          const m = 1 - kk
          ignite.position.x = m * m * sx + 2 * m * kk * cx + kk * kk * ex
          ignite.position.y = m * m * sy + 2 * m * kk * cy + kk * kk * ey
          const dx = 2 * m * (cx - sx) + 2 * kk * (ex - cx)
          const dy = 2 * m * (cy - sy) + 2 * kk * (ey - cy)
          ignite.rotation.z = Math.atan2(dy, dx)
          igniteMaterial.uniforms.uAlpha.value = smooth(k / 0.15) * (1 - smooth((k - 0.9) / 0.1))
          ignite.visible = true
        }
      }

      renderer.render(scene, camera)
    }

    function stopLoop() {
      cancelAnimationFrame(frame)
      frame = 0
    }

    // Gentle ambient motion (stars only) runs after the intro unless it is paused or reduced.
    let ambientTime = 0
    let skipFrame = false
    const ambientOn = () => !reducedMotion && !frozen && !pausedRef.current && stationState !== 'failed'

    const finish = () => {
      finished = true
      stopLoop()
      draw(T.TOTAL, ambientTime)
      announce()
      if (ambientOn()) startLoop()
    }

    const tick = (now) => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000 || 0, 0.05)
      last = now
      if (finished) {
        if (diving) {
          // Docking flight: timed from the real clock so it stays in step with the page timeline.
          diveT = Math.max(0, (now - diveStart) / 1000)
          ambientTime += dt
          draw(T.TOTAL, ambientTime)
          return
        }
        // Ambient phase: same loop, stars only. Mobile renders every other frame.
        ambientTime += dt
        if (small) {
          skipFrame = !skipFrame
          if (skipFrame) return
        }
        draw(T.TOTAL, ambientTime)
        return
      }
      if (stationState === 'failed') {
        elapsed = T.ORBIT_END
        finish()
        return
      }
      // The station has to be ready before the gathering begins; wait for it if it is not.
      if (stationState === 'loading' && elapsed + dt >= T.GATHER_START) {
        elapsed = T.GATHER_START
      } else {
        elapsed += dt
      }
      if (elapsed >= T.TOTAL) {
        elapsed = T.TOTAL
        finish()
        return
      }
      draw(elapsed)
    }

    function startLoop() {
      if (frame || frozen || (finished && !ambientOn() && !diving)) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
    // Do no work while the tab is hidden.
    const onVisibility = () => (document.hidden ? stopLoop() : startLoop())
    diveFnRef.current = () => {
      if (diving || reducedMotion || frozen) return
      if (!finished) {
        elapsed = T.TOTAL
        finish()
      }
      diving = true
      diveT = 0
      diveStart = performance.now()
      stopLoop()
      startLoop()
    }
    pauseFnRef.current = () => {
      if (diving) return
      if (pausedRef.current) {
        stopLoop()
        if (finished) draw(T.TOTAL, ambientTime)
      } else {
        startLoop()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    skipFnRef.current = () => {
      elapsed = T.TOTAL
      finish()
    }
    replayFnRef.current = () => {
      stopLoop()
      elapsed = 0
      finished = false
      announced = false
      ambientTime = 0
      if (reducedMotion) {
        finish()
        return
      }
      draw(0)
      startLoop()
    }

    const requestRedraw = () => {
      if (frozen) draw(debugParam)
      else if (finished) draw(T.TOTAL)
      else if (!frame) draw(elapsed)
    }

    const observer = new ResizeObserver(() => {
      layout()
      requestRedraw()
    })
    observer.observe(host)

    // Assets. The Earth texture and the station model load in parallel.
    new TextureLoader().load(
      import.meta.env.BASE_URL + EARTH_MAP,
      (texture) => {
        if (disposed) {
          texture.dispose()
          return
        }
        texture.colorSpace = SRGBColorSpace
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        texture.minFilter = LinearMipmapLinearFilter
        earthTexture = texture
        earthMaterial.uniforms.uMap.value = texture
        earth.visible = true
        requestRedraw()
      },
      undefined,
      () => {
        if (disposed) return
        earthMaterial.fragmentShader = 'void main(){ gl_FragColor = vec4(0.05, 0.1, 0.16, 1.0); }'
        earthMaterial.needsUpdate = true
        earth.visible = true
        requestRedraw()
      },
    )

    loadStation(import.meta.env.BASE_URL)
      .then((root) => {
        if (disposed) return
        const count = small ? 16000 : 36000
        const analysis = analyseStation(root, count, rng)
        const word = makeWordTargets(count, rng, wordInverse)
        const assembly = makeAssembly(analysis, word, rng, pixelRatio)
        const materials = applyHologram(root, holoShared)
        const pivot = new Group()
        pivot.matrixAutoUpdate = false
        pivot.matrix.copy(analysis.normMatrix)
        pivot.add(root)
        root.visible = false
        stationGroup.add(pivot, assembly)
        station = { assembly, root, pivot, materials, size: analysis.size }
        const target = findDockingTarget(analysis.targets)
        if (target) {
          dock = makeDock(target)
          stationGroup.add(dock.group)
          if (import.meta.env.DEV) console.info('[dive] docking target', target.center.map((n) => +n.toFixed(3)), +target.radius.toFixed(3))
        } else if (import.meta.env.DEV) console.info('[dive] no docking cap found; the flight falls back to the station core')
        stationState = 'ready'
        if (import.meta.env.DEV) console.info('[intro] station size', analysis.size.toArray().map((n) => +n.toFixed(3)))
        layout()
        requestRedraw()
      })
      .catch((error) => {
        if (disposed) return
        if (import.meta.env.DEV) console.warn('[intro] station failed', error)
        // Fall back to the Earth view and show the login.
        stationState = 'failed'
        elapsed = T.ORBIT_END
        finish()
      })

    const onContextLost = (event) => {
      event.preventDefault()
      stopLoop()
      failRef.current?.()
    }
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)

    // Start: the final state at once for reduced motion, a returning visit or a frozen debug frame.
    if (frozen) {
      elapsed = debugParam
      if (elapsed >= T.TOTAL) announce()
      draw(elapsed)
    } else if (reducedMotion || startFinalRef.current) {
      elapsed = T.TOTAL
      finish()
    } else {
      draw(0)
      startLoop()
    }

    return () => {
      disposed = true
      stopLoop()
      skipFnRef.current = null
      replayFnRef.current = null
      pauseFnRef.current = null
      document.removeEventListener('visibilitychange', onVisibility)
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      observer.disconnect()
      earthGeometry.dispose()
      earthMaterial.dispose()
      earthTexture?.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      particles.geometry.dispose()
      particles.material.dispose()
      stars.geometry.dispose()
      stars.material.dispose()
      starsNear.geometry.dispose()
      starsNear.material.dispose()
      nebulaGeometry.dispose()
      nebulaMaterial.dispose()
      shooting.geometry.dispose()
      shooting.meshes.forEach((m) => m.material.dispose())
      igniteGeometry.dispose()
      igniteMaterial.dispose()
      diveFnRef.current = null
      streaks.geometry.dispose()
      streaks.material.dispose()
      if (dock) {
        dock.geometries.forEach((g) => g.dispose())
        dock.materials.forEach((m) => m.dispose())
      }
      if (station) {
        station.assembly.geometry.dispose()
        station.assembly.material.dispose()
        station.root.traverse((obj) => obj.geometry?.dispose())
        station.materials.forEach((m) => m.dispose())
      }
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [reducedMotion])

  return <div className="earth-scene" ref={hostRef} />
}
