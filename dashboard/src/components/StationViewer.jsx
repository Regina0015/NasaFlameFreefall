import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { pruneDetached } from '../lib/stationParticles.js'
import { fetchGlb } from '../lib/fetchGlb.js'

const MODELS = {
  iss: 'models/iss-b.glb', // NASA / Michael D. Carbajal; Draco-compressed
  solid: 'models/twisters-station-solid.glb',
  hologram: 'models/twisters-station-hologram.glb',
}

// Direction the camera looks from, relative to the model centre (Y-up).
const VIEW_DIRECTION = new Vector3(0.75, 0.5, 1).normalize()
const SPIN_RAD_PER_S = 0.1
const STEP_RAD = Math.PI / 8
const ZOOM_STEP = 0.8 // each zoom press scales the camera distance by this (or its inverse)
const ZOOM_MIN = 0.55 // closest, as a share of the framed distance
const ZOOM_MAX = 1.4 // farthest

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function cssColor(element, name) {
  return getComputedStyle(element).getPropertyValue(name).trim()
}

/**
 * The conceptual station model. `variant` picks the solid model (primary) or
 * the hologram (glTF LINES). The camera is framed from the model's real bounds.
 * With `interactive`, the viewer can be dragged to orbit, and rotate buttons give
 * the same control without dragging. The slow spin can always be paused, and
 * starts paused when the system asks for reduced motion.
 */
export default function StationViewer({ variant = 'solid', interactive = false, label, resetSignal = 0, active = true }) {
  const activeRef = useRef(active)
  activeRef.current = active
  const hostRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [failure, setFailure] = useState(null) // what went wrong, shown with the error
  const [attempt, setAttempt] = useState(0)
  const [paused, setPaused] = useState(prefersReducedMotion)
  const pausedRef = useRef(paused)
  const pivotRef = useRef(null)
  const viewRef = useRef({ zoom: () => {}, reset: () => {} })
  pausedRef.current = paused

  useEffect(() => {
    if (resetSignal) viewRef.current.reset()
  }, [resetSignal])

  const step = (direction) => {
    if (pivotRef.current) pivotRef.current.rotation.y += direction * STEP_RAD
  }

  useEffect(() => {
    const host = hostRef.current
    let renderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setStatus('unsupported')
      return undefined
    }
    setStatus('loading')
    setFailure(null)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = ACESFilmicToneMapping
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const pmrem = new PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment

    const key = new DirectionalLight(0xffffff, 1.6)
    key.position.set(4, 8, 6)
    const rim = new DirectionalLight(0x53d8ed, 0.9)
    rim.position.set(-6, 2, -5)
    scene.add(key, rim)

    const camera = new PerspectiveCamera(32, 1, 0.1, 500)
    const pivot = new Group()
    scene.add(pivot)
    pivotRef.current = pivot

    const bounds = new Sphere(new Vector3(), 1)
    let baseDistance = 1
    let lineMaterials = []
    let controls = null
    let disposed = false

    // Distance at which the bounding sphere fits both the vertical and horizontal view.
    function frame() {
      const width = host.clientWidth
      const height = host.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      const vertical = (camera.fov * Math.PI) / 180
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect)
      const distance = (bounds.radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 0.74
      baseDistance = distance
      camera.position.copy(VIEW_DIRECTION).multiplyScalar(distance)
      camera.near = Math.max(distance * 0.05, 0.01)
      camera.far = distance + bounds.radius * 4
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      controls?.update()
    }

    viewRef.current = {
      // Zoom keeps the orbit angle and stays between fixed limits.
      zoom(factor) {
        const next = Math.min(Math.max(camera.position.length() * factor, baseDistance * ZOOM_MIN), baseDistance * ZOOM_MAX)
        camera.position.setLength(next)
        controls?.update()
      },
      reset() {
        pivot.rotation.y = 0
        camera.position.copy(VIEW_DIRECTION).multiplyScalar(baseDistance)
        controls?.target.set(0, 0, 0)
        camera.lookAt(0, 0, 0)
        controls?.update()
      },
    }

    function applyTheme() {
      const light = document.documentElement.dataset.theme === 'light'
      scene.environmentIntensity = light ? 1.15 : 0.85
      // The pale NASA model needs less exposure on the light stage to keep its edges visible.
      renderer.toneMappingExposure = light ? (variant === 'iss' ? 0.65 : 1.1) : 1
      const accent = new Color(cssColor(host, '--accent') || '#53d8ed')
      for (const material of lineMaterials) {
        material.color.copy(accent)
        material.emissive?.set(0x000000)
      }
    }

    const draco = new DRACOLoader()
    draco.setDecoderPath(import.meta.env.BASE_URL + 'draco/')
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)
    const url = import.meta.env.BASE_URL + MODELS[variant]
    const abort = new AbortController()
    // Real failures are logged and shown, never turned into a success state.
    const fail = (error) => {
      if (disposed || error?.name === 'AbortError') return
      const reason = error?.message || String(error)
      console.error(`Station model "${url}" failed to load:`, error)
      setFailure(reason)
      setStatus('error')
    }

    function show(gltf) {
      const model = gltf.scene
      // The NASA model contains a detached disc; hide it, as the login scene does.
      if (variant === 'iss') {
        pruneDetached(model)
        // Remove the hidden parts so they do not count toward the framing bounds.
        const hidden = []
        model.traverse((node) => {
          if (node.isMesh && !node.visible) hidden.push(node)
        })
        hidden.forEach((node) => {
          node.geometry.dispose()
          node.removeFromParent()
        })
      }
      const box = new Box3().setFromObject(model)
      box.getBoundingSphere(bounds)
      // Centre the model on the pivot so it spins around its own middle.
      model.position.sub(bounds.center)
      pivot.add(model)
      model.traverse((node) => {
        if (node.isLine || node.isLineSegments) lineMaterials.push(node.material)
      })
      lineMaterials = [...new Set(lineMaterials)]
      applyTheme()
      frame()
      setStatus('ready')
    }

    fetchGlb(url, abort.signal)
      .then((buffer) => loader.parseAsync(buffer, import.meta.env.BASE_URL + 'models/'))
      .then((gltf) => {
        if (!disposed) show(gltf)
      })
      .catch(fail)

    if (interactive) {
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enablePan = false
      controls.enableZoom = false
      controls.enableDamping = true
    }

    let last = performance.now()
    let raf = 0
    function tick(now) {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (!pausedRef.current) pivot.rotation.y += dt * SPIN_RAD_PER_S
      if (!activeRef.current) return // hidden behind another stage mode: skip the work
      controls?.update()
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(tick)

    const resizeObserver = new ResizeObserver(frame)
    resizeObserver.observe(host)
    const themeObserver = new MutationObserver(applyTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      disposed = true
      abort.abort()
      pivotRef.current = null
      draco.dispose()
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      controls?.dispose()
      scene.traverse((node) => {
        node.geometry?.dispose()
        if (node.material) [].concat(node.material).forEach((m) => m.dispose())
      })
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [variant, interactive, attempt])

  return (
    <div className="station-viewer" data-status={status}>
      <div
        ref={hostRef}
        className="station-canvas"
        role="img"
        aria-label={label ?? 'Conceptual 3D model of a space station'}
      />
      {status === 'ready' && (
        <div className="station-controls" role="group" aria-label="Station model rotation">
          {interactive && (
            <button type="button" className="station-control" onClick={() => step(-1)} aria-label="Rotate left">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          )}
          <button type="button" className="station-control station-control-text" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? 'Resume rotation' : 'Pause rotation'}
          </button>
          {interactive && (
            <>
              <button type="button" className="station-control" onClick={() => viewRef.current.zoom(ZOOM_STEP)} aria-label="Zoom in">
                +
              </button>
              <button type="button" className="station-control" onClick={() => viewRef.current.zoom(1 / ZOOM_STEP)} aria-label="Zoom out">
                −
              </button>
              <button type="button" className="station-control station-control-text" onClick={() => viewRef.current.reset()}>
                Reset view
              </button>
            </>
          )}
          {interactive && (
            <button type="button" className="station-control" onClick={() => step(1)} aria-label="Rotate right">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
      )}
      {status === 'loading' && <p className="station-status">Loading station model…</p>}
      {status === 'error' && (
        <div className="station-status" role="alert">
          <p>The station model could not be loaded{failure ? `: ${failure}` : '.'}</p>
          <button type="button" className="station-control station-control-text" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {status === 'unsupported' && (
        <p className="station-status">3D preview is not available in this browser (WebGL is off).</p>
      )}
    </div>
  )
}
