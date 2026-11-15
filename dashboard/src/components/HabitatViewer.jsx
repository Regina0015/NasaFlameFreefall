import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Raycaster,
  Scene,
  Spherical,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildHabitat, compartmentOf } from '../lib/habitat/build.js'
import { anglesFrom, clampLook, clampToInterior, directionFrom, pointAlong, routeBetween, smoothstep } from '../lib/habitat/camera.js'
import { COMPARTMENT_IDS, FLOOR, HEIGHT, INNER, RACKS, ROOF, VIEWPOINTS, WALL } from '../lib/habitat/layout.js'
import { COMPARTMENTS, DEMO_SCENARIO } from '../lib/habitat/metadata.js'

const CUTAWAY_TARGET = new Vector3(0, 1, 2.6)
const CUTAWAY_DIRECTION = new Vector3(0.7, 0.72, 1).normalize()
const BASE_DISTANCE = 21
const ZOOM_MIN = 0.55
const ZOOM_MAX = 1.5
const LOOK_STEP = 0.14
const ORBIT_STEP = Math.PI / 12
const FADE_MS = 220

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function isVisibleDeep(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false
  return true
}

// Shortest signed difference between two angles.
function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

/**
 * The conceptual habitat: an original, invented layout (not an ISS replica, and not the inside of the
 * NASA model). `mode` is 'cutaway' (removable roof, click a compartment) or 'interior' (camera viewpoints
 * inside the same habitat). All camera movement stays inside the walkable volumes.
 */
export default function HabitatViewer({ mode, onModeChange, resetSignal = 0, active = true }) {
  const hostRef = useRef(null)
  const api = useRef(null)
  const [status, setStatus] = useState('loading')
  const [failure, setFailure] = useState(null)
  const [selected, setSelected] = useState(null)
  const [viewing, setViewing] = useState('central-passage')
  const [roofOpen, setRoofOpen] = useState(true)
  const [demo, setDemo] = useState(false)
  const [fading, setFading] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [attempt, setAttempt] = useState(0)

  // Latest values for the long-lived scene code.
  const live = useRef({})
  Object.assign(live.current, { mode, selected, viewing, roofOpen, demo, onModeChange, active })

  const choose = useCallback((id) => {
    setSelected(id)
    setAnnounce(id ? `${COMPARTMENTS[id].name} selected.` : 'Selection cleared.')
  }, [])

  const enter = useCallback(
    (id) => {
      setViewing(id)
      live.current.viewing = id
      live.current.pendingTarget = id
      onModeChange('interior')
    },
    [onModeChange],
  )

  // ---------------------------------------------------------------- the 3D scene
  useEffect(() => {
    const host = hostRef.current
    let renderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setStatus('unsupported')
      return undefined
    }

    let habitat
    try {
      habitat = buildHabitat()
    } catch (error) {
      console.error('The conceptual habitat could not be built:', error)
      setFailure(error?.message || String(error))
      setStatus('error')
      renderer.dispose()
      return undefined
    }
    setStatus('ready')
    setFailure(null)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = ACESFilmicToneMapping
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const pmrem = new PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment
    scene.add(habitat.root)

    // Lights: a key light and fill for the cutaway, soft practical lights for the interior.
    const key = new DirectionalLight(0xffffff, 1.5)
    key.position.set(6, 14, 8)
    const hemi = new HemisphereLight(0xcfe3f5, 0x2a3644, 0.5)
    const practical = [
      [0, 2.4, -3],
      [0, 2.4, 3],
      [-4.5, 2.4, 0],
      [4.5, 2.4, 0],
      [0, 2.4, 9.3],
    ].map((p) => {
      const light = new PointLight(0xd6eaff, 9, 9, 2)
      light.position.set(...p)
      return light
    })
    scene.add(key, hemi, ...practical)

    const camera = new PerspectiveCamera(38, 1, 0.05, 200)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = false // zoom has buttons and keys, so the page can still scroll
    controls.enableDamping = true
    controls.target.copy(CUTAWAY_TARGET)
    controls.minPolarAngle = 0.15
    controls.maxPolarAngle = 1.15 // keeps the camera above the walls

    // ---- selection boundaries (not part of the exported habitat)
    const outline = new LineBasicMaterial({ color: new Color('#65d6e5'), depthTest: false, transparent: true })
    const fill = new MeshBasicMaterial({ color: new Color('#65d6e5'), transparent: true, opacity: 0.14, depthWrite: false, side: DoubleSide })
    const boundaries = new Map()
    const helperGeometries = []
    for (const id of COMPARTMENT_IDS) {
      const { min, max } = INNER[id]
      const size = [max[0] - min[0] + WALL, HEIGHT + ROOF + FLOOR, max[2] - min[2] + WALL]
      const geometry = new BoxGeometry(...size)
      const edges = new EdgesGeometry(geometry)
      helperGeometries.push(geometry, edges)
      const group = new Group()
      const lines = new LineSegments(edges, outline)
      lines.renderOrder = 20
      group.add(lines, new Mesh(geometry, fill))
      group.position.set((min[0] + max[0]) / 2, (HEIGHT + ROOF - FLOOR) / 2, (min[2] + max[2]) / 2)
      group.visible = false
      scene.add(group)
      boundaries.set(id, group)
    }

    // ---- illustrative demo marker (red, hand placed, never part of a record)
    const rack = RACKS.find((r) => r.id === DEMO_SCENARIO.rackId)
    const markerMaterial = new MeshBasicMaterial({ color: new Color('#ff4d4d'), depthTest: false, transparent: true })
    const ringGeometry = new TorusGeometry(0.62, 0.035, 8, 36)
    const gemGeometry = new OctahedronGeometry(0.2)
    helperGeometries.push(ringGeometry, gemGeometry)
    const marker = new Group()
    const ring = new Mesh(ringGeometry, markerMaterial)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.05
    const gem = new Mesh(gemGeometry, markerMaterial)
    gem.position.y = 2.55
    ring.renderOrder = gem.renderOrder = 30
    marker.add(ring, gem)
    marker.position.set(rack.position[0] + (rack.facing === 'x+' ? 0.55 : 0), 0, rack.position[2])
    marker.visible = false
    scene.add(marker)

    // ---- navigation state
    const nav = {
      current: live.current.viewing,
      position: VIEWPOINTS[live.current.viewing].position.slice(),
      base: anglesFrom(VIEWPOINTS[live.current.viewing].position, VIEWPOINTS[live.current.viewing].target),
      look: { yaw: 0, pitch: 0 },
      tween: null,
      cutawayOffset: CUTAWAY_DIRECTION.clone().multiplyScalar(BASE_DISTANCE),
      baseDistance: BASE_DISTANCE,
      inside: false,
    }

    const lighting = () => {
      const light = document.documentElement.dataset.theme === 'light'
      renderer.toneMappingExposure = light ? 0.95 : 1
      scene.environmentIntensity = nav.inside ? 0.28 : light ? 1.0 : 0.85
      key.intensity = nav.inside ? 0 : 1.5
      hemi.intensity = nav.inside ? 0.3 : 0.5
      practical.forEach((p) => {
        p.visible = nav.inside
      })
    }

    function applyRoofs() {
      const hidden = !nav.inside && live.current.roofOpen
      habitat.roofs.forEach((roof) => {
        roof.visible = !hidden
      })
    }

    function frame() {
      const width = host.clientWidth
      const height = host.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      // Narrow screens need more distance to fit the habitat's width.
      nav.baseDistance = BASE_DISTANCE * (camera.aspect < 1.5 ? Math.min(1.5 / camera.aspect, 2.4) : 1)
      controls.minDistance = nav.baseDistance * ZOOM_MIN
      controls.maxDistance = nav.baseDistance * ZOOM_MAX
      camera.updateProjectionMatrix()
      if (!nav.inside && !nav.framed) {
        resetCutaway()
        nav.framed = true
      }
    }

    function resetCutaway() {
      controls.target.copy(CUTAWAY_TARGET)
      camera.position.copy(CUTAWAY_TARGET).addScaledVector(CUTAWAY_DIRECTION, nav.baseDistance)
      controls.update()
    }

    function orbitBy(dTheta, dPhi) {
      const offset = camera.position.clone().sub(controls.target)
      const s = new Spherical().setFromVector3(offset)
      s.theta += dTheta
      s.phi = Math.min(Math.max(s.phi + dPhi, controls.minPolarAngle), controls.maxPolarAngle)
      camera.position.copy(controls.target).add(offset.setFromSpherical(s))
      controls.update()
    }

    function zoomBy(factor) {
      const offset = camera.position.clone().sub(controls.target)
      const next = Math.min(Math.max(offset.length() * factor, controls.minDistance), controls.maxDistance)
      camera.position.copy(controls.target).add(offset.setLength(next))
      controls.update()
    }

    function pose() {
      // Interior camera: a clamped position, a direction from the viewpoint plus the person's look offset.
      const p = clampToInterior(nav.position)
      camera.position.set(p[0], p[1], p[2])
      const look = clampLook(nav.look)
      const dir = directionFrom({ yaw: nav.base.yaw + look.yaw, pitch: nav.base.pitch + look.pitch })
      camera.lookAt(p[0] + dir[0], p[1] + dir[1], p[2] + dir[2])
    }

    function enterInterior(id) {
      nav.cutawayOffset.copy(camera.position).sub(controls.target)
      nav.inside = true
      nav.tween = null
      nav.current = id
      nav.position = VIEWPOINTS[id].position.slice()
      nav.base = anglesFrom(VIEWPOINTS[id].position, VIEWPOINTS[id].target)
      nav.look = { yaw: 0, pitch: 0 }
      controls.enabled = false
      camera.fov = 68
      camera.near = 0.05
      camera.updateProjectionMatrix()
      boundaries.forEach((b) => {
        b.visible = false
      })
      applyRoofs()
      lighting()
      pose()
    }

    function leaveInterior() {
      nav.inside = false
      nav.tween = null
      controls.enabled = true
      camera.fov = 38
      camera.near = 0.5
      camera.updateProjectionMatrix()
      camera.position.copy(controls.target).add(nav.cutawayOffset)
      controls.update()
      applyRoofs()
      lighting()
      showSelection()
    }

    function goTo(id) {
      if (!nav.inside || id === nav.current && !nav.tween) {
        if (nav.inside) nav.look = { yaw: 0, pitch: 0 }
        return
      }
      const route = routeBetween(nav.current, id)
      const from = nav.base
      const to = anglesFrom(VIEWPOINTS[id].position, VIEWPOINTS[id].target)
      let length = 0
      for (let i = 1; i < route.length; i += 1) length += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1], route[i][2] - route[i - 1][2])
      const duration = reducedMotion() ? 0 : Math.min(Math.max(length / 3.2, 0.8), 2.6)
      nav.look = { yaw: 0, pitch: 0 }
      nav.current = id
      if (!duration) {
        nav.position = route.at(-1).slice()
        nav.base = to
        nav.tween = null
        pose()
        return
      }
      nav.tween = { route, from, to, start: performance.now(), duration: duration * 1000 }
    }

    function resetInterior() {
      nav.look = { yaw: 0, pitch: 0 }
      goTo(nav.current)
      pose()
    }

    function showSelection() {
      boundaries.forEach((group, id) => {
        group.visible = !nav.inside && live.current.selected === id
      })
    }

    // ---- picking: a click without dragging selects the compartment under the pointer
    const raycaster = new Raycaster()
    const down = { x: 0, y: 0, t: 0 }
    const canvas = renderer.domElement
    const pointer = new Vector2()
    const onDown = (event) => {
      down.x = event.clientX
      down.y = event.clientY
      down.t = performance.now()
    }
    const onUp = (event) => {
      if (nav.inside) return
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6 || performance.now() - down.t > 600) return
      const rect = canvas.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1))
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(habitat.root, true).find((h) => isVisibleDeep(h.object))
      const id = hit ? compartmentOf(hit.object) : null
      live.current.chooseFromScene(id)
    }
    // Interior: dragging looks around.
    let dragging = false
    const onMove = (event) => {
      if (!nav.inside || !dragging || nav.tween) return
      nav.look = clampLook({ yaw: nav.look.yaw + event.movementX * 0.004, pitch: nav.look.pitch + event.movementY * 0.004 })
    }
    const onInteriorDown = (event) => {
      if (nav.inside) {
        dragging = true
        canvas.setPointerCapture?.(event.pointerId)
      }
    }
    const onInteriorUp = () => {
      dragging = false
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerdown', onInteriorDown)
    canvas.addEventListener('pointerup', onInteriorUp)
    canvas.addEventListener('pointercancel', onInteriorUp)
    canvas.addEventListener('pointermove', onMove)
    canvas.style.touchAction = 'none'

    // ---- loop
    let raf = 0
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden || !live.current.active) return
      if (nav.inside) {
        if (nav.tween) {
          const { route, from, to, start, duration } = nav.tween
          const t = Math.min((now - start) / duration, 1)
          const s = smoothstep(t)
          nav.position = pointAlong(route, s)
          nav.base = { yaw: from.yaw + angleDelta(from.yaw, to.yaw) * s, pitch: from.pitch + (to.pitch - from.pitch) * s }
          if (t >= 1) {
            nav.tween = null
            nav.position = route.at(-1).slice()
            nav.base = to
          }
        }
        pose()
      } else {
        controls.update()
      }
      if (live.current.demo && !reducedMotion()) {
        const pulse = 1 + 0.12 * Math.sin(now / 420)
        ring.scale.setScalar(pulse)
        gem.rotation.y = now / 900
      }
      renderer.render(scene, camera)
    }

    api.current = {
      orbitBy,
      zoomBy,
      lookBy(dYaw, dPitch) {
        if (nav.inside && !nav.tween) nav.look = clampLook({ yaw: nav.look.yaw + dYaw, pitch: nav.look.pitch + dPitch })
      },
      reset() {
        if (nav.inside) resetInterior()
        else resetCutaway()
      },
      goTo,
      enterInterior,
      leaveInterior,
      showSelection,
      applyRoofs,
      setDemo(on) {
        marker.visible = on
      },
      isInside: () => nav.inside,
      current: () => nav.current,
    }
    live.current.chooseFromScene = choose

    lighting()
    applyRoofs()
    frame()
    // The viewer may open straight into the interior.
    if (live.current.mode === 'interior') enterInterior(live.current.viewing)
    raf = requestAnimationFrame(tick)

    const resizeObserver = new ResizeObserver(frame)
    resizeObserver.observe(host)
    const themeObserver = new MutationObserver(lighting)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      api.current = null
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerdown', onInteriorDown)
      canvas.removeEventListener('pointerup', onInteriorUp)
      canvas.removeEventListener('pointercancel', onInteriorUp)
      canvas.removeEventListener('pointermove', onMove)
      controls.dispose()
      habitat.dispose()
      helperGeometries.forEach((g) => g.dispose())
      outline.dispose()
      fill.dispose()
      markerMaterial.dispose()
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [attempt, choose])

  // ---------------------------------------------------------------- React state -> scene
  useEffect(() => {
    api.current?.showSelection()
  }, [selected, status])

  useEffect(() => {
    api.current?.applyRoofs()
  }, [roofOpen, status])

  useEffect(() => {
    api.current?.setDemo(demo)
  }, [demo, status])

  // Mode changes: fade out, switch, fade in (instant with reduced motion).
  useEffect(() => {
    const scene = api.current
    if (!scene) return undefined
    const inside = scene.isInside()
    if ((mode === 'interior') === inside) {
      setFading(false)
      return undefined
    }
    const target = live.current.pendingTarget ?? live.current.selected ?? live.current.viewing ?? 'central-passage'
    live.current.pendingTarget = null
    const run = () => {
      setViewing(target)
      live.current.viewing = target
      if (mode === 'interior') scene.enterInterior(target)
      else scene.leaveInterior()
      setAnnounce(mode === 'interior' ? `Inside ${COMPARTMENTS[target].name}.` : 'Back to the cutaway.')
      setFading(false)
    }
    if (reducedMotion()) {
      run()
      return undefined
    }
    setFading(true)
    const timer = setTimeout(run, FADE_MS)
    return () => clearTimeout(timer)
  }, [mode, status])

  useEffect(() => {
    if (resetSignal) api.current?.reset()
  }, [resetSignal])

  const moveTo = (id) => {
    setViewing(id)
    live.current.viewing = id
    api.current?.goTo(id)
    setAnnounce(`Moving to ${COMPARTMENTS[id].name}.`)
  }

  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget) return
    const scene = api.current
    if (!scene) return
    const inside = mode === 'interior'
    const keys = {
      ArrowLeft: () => (inside ? scene.lookBy(LOOK_STEP, 0) : scene.orbitBy(-ORBIT_STEP, 0)),
      ArrowRight: () => (inside ? scene.lookBy(-LOOK_STEP, 0) : scene.orbitBy(ORBIT_STEP, 0)),
      ArrowUp: () => (inside ? scene.lookBy(0, LOOK_STEP) : scene.orbitBy(0, -ORBIT_STEP)),
      ArrowDown: () => (inside ? scene.lookBy(0, -LOOK_STEP) : scene.orbitBy(0, ORBIT_STEP)),
      '+': () => !inside && scene.zoomBy(0.8),
      '=': () => !inside && scene.zoomBy(0.8),
      '-': () => !inside && scene.zoomBy(1.25),
      Home: () => scene.reset(),
      Escape: () => (inside ? onModeChange('cutaway') : choose(null)),
      Enter: () => !inside && selected && enter(selected),
    }
    const action = keys[event.key]
    if (action) {
      event.preventDefault()
      action()
    }
  }

  const inside = mode === 'interior'
  const info = selected ? COMPARTMENTS[selected] : null
  const rackCompartment = RACKS.find((r) => r.id === DEMO_SCENARIO.rackId)?.compartment

  return (
    <div className="hv" data-status={status}>
      <div
        ref={hostRef}
        className="hv-canvas"
        tabIndex={status === 'ready' ? 0 : -1}
        role="group"
        aria-label={inside ? 'Concept habitat interior, 3D view' : 'Concept habitat cutaway, 3D view'}
        aria-describedby="hv-help"
        onKeyDown={onKeyDown}
      />
      <p id="hv-help" className="visually-hidden">
        {inside
          ? 'Arrow keys look around. Home resets the view. Escape returns to the cutaway.'
          : 'Arrow keys rotate. Plus and minus zoom. Home resets the view. Choose a compartment from the list, then press Enter to go inside.'}
      </p>
      <p className="visually-hidden" role="status">
        {announce}
      </p>
      <div className="hv-fade" data-on={fading || undefined} aria-hidden="true" />

      {status === 'ready' && (
        <div className="hv-ui">
          <div className="hv-row">
            {inside ? (
              <>
                <button type="button" className="hv-btn hv-btn-primary" onClick={() => onModeChange('cutaway')}>
                  Back to cutaway
                </button>
                <div className="hv-chips" role="group" aria-label="Go to compartment">
                  {COMPARTMENT_IDS.map((id) => (
                    <button key={id} type="button" className="hv-chip" aria-pressed={viewing === id} onClick={() => moveTo(id)}>
                      {COMPARTMENTS[id].name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button type="button" className="hv-btn" aria-pressed={roofOpen} onClick={() => setRoofOpen((v) => !v)}>
                  Roof removed
                </button>
                <div className="hv-chips" role="group" aria-label="Compartments">
                  {COMPARTMENT_IDS.map((id) => (
                    <button key={id} type="button" className="hv-chip" aria-pressed={selected === id} onClick={() => choose(selected === id ? null : id)}>
                      {COMPARTMENTS[id].name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button type="button" className="hv-btn hv-btn-demo" aria-pressed={demo} onClick={() => setDemo((v) => !v)}>
              Demo scenario
            </button>
          </div>

          {demo && (
            <section className="hv-demo" aria-labelledby="hv-demo-title">
              <p className="hv-demo-tag" id="hv-demo-title">
                {DEMO_SCENARIO.label}
              </p>
              <h3>{DEMO_SCENARIO.title}</h3>
              <p>
                Marked: conceptual rack <code>{DEMO_SCENARIO.rackId}</code>, {COMPARTMENTS[rackCompartment].name}.
              </p>
              {DEMO_SCENARIO.body.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <div className="hv-actions">
                {!(inside && viewing === rackCompartment) && (
                  <button type="button" className="hv-btn" onClick={() => (inside ? moveTo(rackCompartment) : enter(rackCompartment))}>
                    Go to {COMPARTMENTS[rackCompartment].name}
                  </button>
                )}
                <button type="button" className="hv-btn" onClick={() => setDemo(false)}>
                  Close
                </button>
              </div>
            </section>
          )}

          <div className="hv-row hv-bottom">
            {!inside && (
              <div className="hv-select">
                {info ? (
                  <div className="hv-card">
                    <h3>{info.name}</h3>
                    <p>{info.summary}</p>
                    <p className="muted">{info.detail}</p>
                    <div className="hv-actions">
                      <button type="button" className="hv-btn hv-btn-primary" onClick={() => enter(selected)}>
                        Enter compartment
                      </button>
                      <button type="button" className="hv-btn" onClick={() => choose(null)}>
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="hv-hint">Click a compartment, or choose one from the list.</p>
                )}
              </div>
            )}
            {inside && (
              <p className="hv-hint">
                <b>{COMPARTMENTS[viewing].name}.</b> Drag or use the arrows to look around.
              </p>
            )}

            <div className="hv-controls" role="group" aria-label={inside ? 'Look controls' : 'View controls'}>
              {inside ? (
                <>
                  <button type="button" className="hv-btn hv-icon" aria-label="Look left" onClick={() => api.current?.lookBy(LOOK_STEP, 0)}>
                    ←
                  </button>
                  <button type="button" className="hv-btn hv-icon" aria-label="Look up" onClick={() => api.current?.lookBy(0, LOOK_STEP)}>
                    ↑
                  </button>
                  <button type="button" className="hv-btn hv-icon" aria-label="Look down" onClick={() => api.current?.lookBy(0, -LOOK_STEP)}>
                    ↓
                  </button>
                  <button type="button" className="hv-btn hv-icon" aria-label="Look right" onClick={() => api.current?.lookBy(-LOOK_STEP, 0)}>
                    →
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="hv-btn hv-icon" aria-label="Rotate left" onClick={() => api.current?.orbitBy(-ORBIT_STEP, 0)}>
                    ←
                  </button>
                  <button type="button" className="hv-btn hv-icon" aria-label="Rotate right" onClick={() => api.current?.orbitBy(ORBIT_STEP, 0)}>
                    →
                  </button>
                  <button type="button" className="hv-btn hv-icon" aria-label="Zoom in" onClick={() => api.current?.zoomBy(0.8)}>
                    +
                  </button>
                  <button type="button" className="hv-btn hv-icon" aria-label="Zoom out" onClick={() => api.current?.zoomBy(1.25)}>
                    −
                  </button>
                </>
              )}
              <button type="button" className="hv-btn" onClick={() => api.current?.reset()}>
                Reset view
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'unsupported' && <p className="station-status">3D preview is not available in this browser (WebGL is off).</p>}
      {status === 'error' && (
        <div className="station-status" role="alert">
          <p>The conceptual habitat could not be built{failure ? `: ${failure}` : '.'}</p>
          <button type="button" className="station-control station-control-text" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}