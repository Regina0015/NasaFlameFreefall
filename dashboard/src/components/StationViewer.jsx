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
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const MODELS = {
  solid: 'models/twisters-station-solid.glb',
  hologram: 'models/twisters-station-hologram.glb',
}

// Direction the camera looks from, relative to the model centre (Y-up).
const VIEW_DIRECTION = new Vector3(0.75, 0.5, 1).normalize()
const SPIN_RAD_PER_S = 0.1

function cssColor(element, name) {
  return getComputedStyle(element).getPropertyValue(name).trim()
}

/**
 * The conceptual station model. `variant` picks the solid model (primary) or
 * the hologram (glTF LINES). The camera is framed from the model's real bounds.
 * With `interactive`, the viewer can be dragged to orbit.
 */
export default function StationViewer({ variant = 'solid', interactive = false, label }) {
  const hostRef = useRef(null)
  const [status, setStatus] = useState('loading')

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

    const bounds = new Sphere(new Vector3(), 1)
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
      camera.position.copy(VIEW_DIRECTION).multiplyScalar(distance)
      camera.near = Math.max(distance - bounds.radius * 2, 0.1)
      camera.far = distance + bounds.radius * 2
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      controls?.update()
    }

    function applyTheme() {
      const light = document.documentElement.dataset.theme === 'light'
      scene.environmentIntensity = light ? 1.15 : 0.85
      renderer.toneMappingExposure = light ? 1.1 : 1
      const accent = new Color(cssColor(host, '--accent') || '#53d8ed')
      for (const material of lineMaterials) {
        material.color.copy(accent)
        material.emissive?.set(0x000000)
      }
    }

    new GLTFLoader().load(
      import.meta.env.BASE_URL + MODELS[variant],
      (gltf) => {
        if (disposed) return
        const model = gltf.scene
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
      },
      undefined,
      () => {
        if (!disposed) setStatus('error')
      },
    )

    if (interactive) {
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enablePan = false
      controls.enableZoom = false
      controls.enableDamping = true
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let last = performance.now()
    let raf = 0
    function tick(now) {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (!reduceMotion.matches) pivot.rotation.y += dt * SPIN_RAD_PER_S
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
  }, [variant, interactive])

  return (
    <div className="station-viewer" data-status={status}>
      <div
        ref={hostRef}
        className="station-canvas"
        role="img"
        aria-label={label ?? 'Conceptual 3D model of a space station'}
      />
      {status === 'loading' && <p className="station-status">Loading station model…</p>}
      {status === 'error' && <p className="station-status">The station model could not be loaded.</p>}
      {status === 'unsupported' && (
        <p className="station-status">3D preview is not available in this browser (WebGL is off).</p>
      )}
    </div>
  )
}
