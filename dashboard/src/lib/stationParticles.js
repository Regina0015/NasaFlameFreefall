import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Matrix4,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

// Loads the NASA station model, samples its surfaces for the particle silhouette and builds
// the holographic material. Nothing here assumes mesh names, scale or orientation: the model is
// measured, aligned by its own principal axes and normalised to a unit length.

export const STATION_URL = 'models/iss-b.glb'

export function loadStation(baseUrl) {
  return new Promise((resolve, reject) => {
    const draco = new DRACOLoader()
    draco.setDecoderPath(baseUrl + 'draco/')
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)
    loader.load(
      baseUrl + STATION_URL,
      (gltf) => {
        draco.dispose()
        resolve(gltf.scene)
      },
      undefined,
      (error) => {
        draco.dispose()
        reject(error)
      },
    )
  })
}

// ---------- measuring and sampling ----------

// Hides meshes that float far from the main structure (the model contains a few detached
// parts). The rule is purely geometric: a mesh is detached when its bounding-box centre is
// farther from the largest mesh's centre than that mesh's own half-diagonal.
export function pruneDetached(root) {
  root.updateMatrixWorld(true)
  const meshes = []
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return
    const box = new Box3().setFromObject(obj)
    meshes.push({ obj, center: box.getCenter(new Vector3()), diag: box.getSize(new Vector3()).length() })
  })
  if (!meshes.length) return
  const main = meshes.reduce((a, b) => (b.diag > a.diag ? b : a))
  const reach = main.diag / 2
  for (const m of meshes) if (m.center.distanceTo(main.center) > reach) m.obj.visible = false
}

function worldTriangles(root) {
  root.updateMatrixWorld(true)
  const chunks = []
  let total = 0
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.visible || !obj.geometry?.attributes?.position) return
    const pos = obj.geometry.attributes.position
    const index = obj.geometry.index
    const count = index ? index.count / 3 : pos.count / 3
    const out = new Float32Array(count * 9)
    for (let t = 0; t < count; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
      a.fromBufferAttribute(pos, i0).applyMatrix4(obj.matrixWorld)
      b.fromBufferAttribute(pos, i1).applyMatrix4(obj.matrixWorld)
      c.fromBufferAttribute(pos, i2).applyMatrix4(obj.matrixWorld)
      out.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], t * 9)
    }
    chunks.push(out)
    total += count
  })
  const tris = new Float32Array(total * 9)
  let offset = 0
  for (const chunk of chunks) {
    tris.set(chunk, offset)
    offset += chunk.length
  }
  return tris
}

// Area-weighted sampling of triangle surfaces using each mesh's world transform.
function sampleSurface(tris, count, rng) {
  const n = tris.length / 9
  const cum = new Float64Array(n)
  let sum = 0
  for (let t = 0; t < n; t++) {
    const o = t * 9
    const ux = tris[o + 3] - tris[o]
    const uy = tris[o + 4] - tris[o + 1]
    const uz = tris[o + 5] - tris[o + 2]
    const vx = tris[o + 6] - tris[o]
    const vy = tris[o + 7] - tris[o + 1]
    const vz = tris[o + 8] - tris[o + 2]
    const cx = uy * vz - uz * vy
    const cy = uz * vx - ux * vz
    const cz = ux * vy - uy * vx
    sum += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz)
    cum[t] = sum
  }
  const points = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const target = rng() * sum
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] < target) lo = mid + 1
      else hi = mid
    }
    const o = lo * 9
    let u = rng()
    let v = rng()
    if (u + v > 1) {
      u = 1 - u
      v = 1 - v
    }
    const w = 1 - u - v
    points[i * 3] = tris[o] * w + tris[o + 3] * u + tris[o + 6] * v
    points[i * 3 + 1] = tris[o + 1] * w + tris[o + 4] * u + tris[o + 7] * v
    points[i * 3 + 2] = tris[o + 2] * w + tris[o + 5] * u + tris[o + 8] * v
  }
  return points
}

// Eigenvectors of a symmetric 3x3 matrix by Jacobi rotations. Returns [values, vectors(columns)].
function eigenSymmetric(m) {
  const a = m.map((row) => row.slice())
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 40; sweep++) {
    let off = 0
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) off += a[i][j] * a[i][j]
    if (off < 1e-18) break
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p]
          const vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
    }
  }
  return [[a[0][0], a[1][1], a[2][2]], v]
}

/**
 * Measures the model and returns what the scene needs:
 *  - normMatrix: model space -> unit space (centred, principal axes aligned: longest on X,
 *    shortest on Z, longest extent scaled to 1)
 *  - targets: sampled surface points in unit space
 *  - delays: per point 0..1, core first and extremities later (from geometry, not names)
 *  - size: unit-space extents of the model
 */
export function analyseStation(root, count, rng) {
  pruneDetached(root)
  const tris = worldTriangles(root)
  const raw = sampleSurface(tris, count, rng)

  const centroid = new Vector3()
  for (let i = 0; i < count; i++) centroid.add(new Vector3(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]))
  centroid.multiplyScalar(1 / count)

  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < count; i++) {
    const d = [raw[i * 3] - centroid.x, raw[i * 3 + 1] - centroid.y, raw[i * 3 + 2] - centroid.z]
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r][c] += (d[r] * d[c]) / count
  }
  const [, vectors] = eigenSymmetric(cov)
  const axes = [0, 1, 2].map((k) => new Vector3(vectors[0][k], vectors[1][k], vectors[2][k]).normalize())
  // Order the axes by the model's real extent along each one: longest -> X, shortest -> Z.
  const spans = axes.map((ax) => {
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < count; i++) {
      const d = raw[i * 3] * ax.x + raw[i * 3 + 1] * ax.y + raw[i * 3 + 2] * ax.z
      if (d < lo) lo = d
      if (d > hi) hi = d
    }
    return hi - lo
  })
  const axis = [0, 1, 2].sort((p, q) => spans[q] - spans[p]).map((k) => axes[k])
  // Keep the basis right-handed so the model is never mirrored.
  if (new Vector3().crossVectors(axis[0], axis[1]).dot(axis[2]) < 0) axis[2].negate()

  const rotation = new Matrix4().set(
    axis[0].x, axis[0].y, axis[0].z, 0,
    axis[1].x, axis[1].y, axis[1].z, 0,
    axis[2].x, axis[2].y, axis[2].z, 0,
    0, 0, 0, 1,
  )
  const toCentred = new Matrix4().makeTranslation(-centroid.x, -centroid.y, -centroid.z)
  const aligned = new Matrix4().multiplyMatrices(rotation, toCentred)

  // Bounds in the aligned frame.
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  const p = new Vector3()
  for (let i = 0; i < count; i++) {
    p.set(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]).applyMatrix4(aligned)
    min.min(p)
    max.max(p)
  }
  const extent = new Vector3().subVectors(max, min)
  const longest = Math.max(extent.x, extent.y, extent.z)
  const center = new Vector3().addVectors(min, max).multiplyScalar(0.5)
  const normMatrix = new Matrix4()
    .makeScale(1 / longest, 1 / longest, 1 / longest)
    .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z))
    .multiply(aligned)

  const targets = new Float32Array(count * 3)
  const delays = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    p.set(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]).applyMatrix4(normMatrix)
    targets.set([p.x, p.y, p.z], i * 3)
    delays[i] = Math.min(Math.hypot(p.x * 0.8, p.y, p.z) / 0.5, 1)
  }
  // Order the targets left to right so they pair with the (also sorted) word targets.
  const order = Array.from({ length: count }, (_, i) => i).sort((p1, q1) => targets[p1 * 3] - targets[q1 * 3])
  const sortedTargets = new Float32Array(count * 3)
  const sortedDelays = new Float32Array(count)
  order.forEach((from, to) => {
    sortedTargets.set(targets.subarray(from * 3, from * 3 + 3), to * 3)
    sortedDelays[to] = delays[from]
  })
  return { normMatrix, targets: sortedTargets, delays: sortedDelays, size: extent.clone().multiplyScalar(1 / longest) }
}

// ---------- the word "Twisters" as particle targets ----------

const WORD = 'Twisters'

/**
 * Samples the word from a canvas into `count` points, normalised to width 1 and centred.
 * The points are sorted left to right so they pair with the station targets. `invRotation`
 * (a Quaternion) pre-rotates them so the word faces the camera inside the tilted station group.
 */
export function makeWordTargets(count, rng, invRotation) {
  const w = 1600
  const h = 420
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const out = new Float32Array(count * 3)
  if (!ctx) return out
  // A locally installed font stack; weight 400 with open tracking reads as elegant and stays legible.
  ctx.font = '400 250px "Segoe UI Variable Display", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif'
  if ('letterSpacing' in ctx) ctx.letterSpacing = '14px'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(WORD, w / 2, h / 2)
  const data = ctx.getImageData(0, 0, w, h).data
  const pixels = []
  let minX = w
  let maxX = 0
  let minY = h
  let maxY = 0
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        pixels.push(x, y)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const n = pixels.length / 2
  if (!n) return out
  const width = maxX - minX
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const pts = []
  for (let i = 0; i < count; i++) {
    const k = Math.floor(rng() * n)
    const x = (pixels[k * 2] + (rng() - 0.5) * 2 - cx) / width
    const y = -(pixels[k * 2 + 1] + (rng() - 0.5) * 2 - cy) / width
    pts.push([x, y, (rng() - 0.5) * 0.008])
  }
  pts.sort((a, b) => a[0] - b[0])
  const v = new Vector3()
  pts.forEach((pt, i) => {
    v.set(pt[0], pt[1], pt[2]).applyQuaternion(invRotation)
    out.set([v.x, v.y, v.z], i * 3)
  })
  return out
}

// ---------- particle silhouette ----------

const ASSEMBLY_VERT = /* glsl */ `
  uniform float uGather;
  uniform float uAssemble;
  uniform float uWord;
  uniform float uWordScale;
  uniform vec3 uWordCenter;
  uniform float uSpin;
  uniform float uPixel;
  uniform float uFade;
  uniform float uGlowPos;
  uniform float uGlowAmt;
  attribute vec3 aFar;
  attribute vec3 aMid;
  attribute vec3 aTarget;
  attribute vec3 aWord;
  attribute vec3 aSwirl;
  attribute vec4 aRand; // gather stagger, size, cyan mix, assemble delay
  varying float vAlpha;
  varying float vCyan;
  varying float vGlow;

  void main() {
    // Quiet gathering cloud: the cloud turns slowly until assembly starts.
    float c = cos(uSpin), s = sin(uSpin);
    vec3 mid = vec3(aMid.x * c + aMid.z * s, aMid.y, -aMid.x * s + aMid.z * c);

    // 1. Gather: a curved path from deep space to the cloud.
    float gp = smoothstep(aRand.x * 0.45, aRand.x * 0.45 + 0.55, uGather);
    vec3 farToMid = mid - aFar;
    vec3 ctrl = (aFar + mid) * 0.5 + cross(farToMid, aSwirl) * 0.45;
    vec3 a = mix(aFar, ctrl, gp);
    vec3 b = mix(ctrl, mid, gp);
    vec3 gathered = mix(a, b, gp);

    // 2. Word: the gathered dust converges into the letters of "Twisters" and holds there.
    vec3 wordPos = aWord * uWordScale + uWordCenter;
    float wp = smoothstep(aRand.x * 0.4, aRand.x * 0.4 + 0.6, uWord);
    vec3 wordCurl = cross(wordPos - gathered, aSwirl) * 0.22 * sin(3.14159 * wp);
    vec3 base = mix(gathered, wordPos, wp) + wordCurl;

    // 3. Assemble: the same particles stream from the word onto the station surface.
    float ap = smoothstep(aRand.w * 0.5, aRand.w * 0.5 + 0.5, uAssemble);
    vec3 curl = cross(aTarget - wordPos, aSwirl) * 0.3 * sin(3.14159 * ap);
    vec3 p = mix(base, aTarget, ap) + curl;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float glow = uGlowAmt * exp(-pow((aTarget.x - uGlowPos) / 0.16, 2.0)) * step(0.9, ap);
    float size = aRand.y * (1.0 + 0.8 * glow);
    gl_PointSize = clamp(size * uPixel * (11.0 / -mv.z), 1.5 * uPixel, 3.6 * uPixel);

    float arrive = 0.3 + 0.7 * gp;
    vAlpha = uFade * arrive * (0.5 + 0.5 * ap) * (1.0 + 0.6 * wp * (1.0 - ap)) + glow * 0.55;
    vCyan = aRand.z;
    vGlow = glow;
  }
`

const ASSEMBLY_FRAG = /* glsl */ `
  uniform vec3 uSilver;
  uniform vec3 uCyan;
  varying float vAlpha;
  varying float vCyan;
  varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    vec3 color = mix(uSilver, uCyan, vCyan);
    color = mix(color, vec3(0.88, 0.98, 1.0), clamp(vGlow, 0.0, 1.0));
    gl_FragColor = vec4(color, a);
  }
`

export function makeAssembly(analysis, word, rng, pixelRatio) {
  const count = analysis.targets.length / 3
  const far = new Float32Array(count * 3)
  const mid = new Float32Array(count * 3)
  const swirl = new Float32Array(count * 3)
  const rand = new Float32Array(count * 4)
  const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5
  for (let i = 0; i < count; i++) {
    // Far shell: mostly ahead of the camera (negative z) so dust arrives from deep space.
    const u = rng() * 2 - 1
    const t = rng() * Math.PI * 2
    const sq = Math.sqrt(1 - u * u)
    const r = 2.2 + rng() * 2.6
    far.set([sq * Math.cos(t) * r * 1.3, u * r * 0.7, -Math.abs(sq * Math.sin(t)) * r - 0.6], i * 3)
    mid.set([gauss() * 0.42, gauss() * 0.2, gauss() * 0.22], i * 3)
    const sx = rng() - 0.5
    const sy = rng() - 0.5
    const sz = rng() - 0.5
    const sl = Math.hypot(sx, sy, sz) || 1
    swirl.set([sx / sl, sy / sl, sz / sl], i * 3)
    rand.set([rng(), 0.9 + rng() * 1.1, rng() < 0.25 ? 1 : 0, Math.min(analysis.delays[i] * 0.85 + rng() * 0.15, 1)], i * 4)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aFar', new BufferAttribute(far, 3))
  geometry.setAttribute('aMid', new BufferAttribute(mid, 3))
  geometry.setAttribute('aTarget', new BufferAttribute(analysis.targets, 3))
  geometry.setAttribute('aWord', new BufferAttribute(word, 3))
  geometry.setAttribute('aSwirl', new BufferAttribute(swirl, 3))
  geometry.setAttribute('aRand', new BufferAttribute(rand, 4))
  const material = new ShaderMaterial({
    vertexShader: ASSEMBLY_VERT,
    fragmentShader: ASSEMBLY_FRAG,
    uniforms: {
      uGather: { value: 0 },
      uAssemble: { value: 0 },
      uWord: { value: 0 },
      uWordScale: { value: 0.6 },
      uWordCenter: { value: new Vector3() },
      uSpin: { value: 0 },
      uPixel: { value: pixelRatio },
      uFade: { value: 0.85 },
      uGlowPos: { value: -1 },
      uGlowAmt: { value: 0 },
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

// ---------- holographic model material ----------

const HOLO_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const HOLO_FRAG = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uAnchor;
  uniform float uInvScale;
  uniform float uReveal;
  uniform float uTime;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

  void main() {
    vec3 unit = (vPosW - uAnchor) * uInvScale;
    // Dissolve in: the surface appears cell by cell, with a thin cyan edge at the front.
    float h = hash(floor(unit * 260.0));
    if (h > uReveal) discard;
    float edge = 1.0 - smoothstep(uReveal - 0.09, uReveal, h);

    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
    float diff = 0.3 + 0.7 * max(dot(N, L), 0.0);

    // Tint comes from the model's own material colour, pulled toward a cool metal.
    vec3 metal = mix(vec3(0.34, 0.41, 0.49), uBase * 1.1 + 0.05, 0.4);
    vec3 color = metal * diff * 0.62;
    float fres = pow(1.0 - abs(dot(N, V)), 2.4);
    color += vec3(0.2, 0.75, 0.9) * fres * 0.55;
    // Faint scan bands, in unit space so they scale with the model.
    float scan = 0.5 + 0.5 * sin(unit.y * 220.0 - uTime * 0.8);
    color *= 0.93 + 0.07 * scan;
    color += vec3(0.4, 0.9, 1.0) * edge * 0.9 * step(0.001, uReveal) * (1.0 - step(0.999, uReveal));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

/** Replaces every mesh material with a hologram material tinted from the original. */
export function applyHologram(root, shared) {
  const cache = new Map()
  const materials = []
  root.traverse((obj) => {
    if (!obj.isMesh) return
    const list = Array.isArray(obj.material) ? obj.material : [obj.material]
    const next = list.map((source) => {
      if (!cache.has(source)) {
        const base = source?.color ? source.color.clone() : new Color(0.4, 0.4, 0.4)
        const material = new ShaderMaterial({
          vertexShader: HOLO_VERT,
          fragmentShader: HOLO_FRAG,
          uniforms: { uBase: { value: new Vector3(base.r, base.g, base.b) }, ...shared },
          side: DoubleSide,
        })
        cache.set(source, material)
        materials.push(material)
      }
      return cache.get(source)
    })
    obj.material = Array.isArray(obj.material) ? next : next[0]
  })
  return materials
}
