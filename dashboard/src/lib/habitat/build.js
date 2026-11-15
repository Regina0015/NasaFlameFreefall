// Procedural geometry for the FlameTrace conceptual habitat (an original, invented layout).
// Used at runtime by HabitatViewer and by tools/export-habitat.mjs, which writes the same geometry to
// public/models/flametrace-habitat-concept.glb. Dimensions come from layout.js, names from metadata.js.
// Geometry and materials are created once and shared. Nothing here depends on the DOM.

import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COMPARTMENT_IDS, FLOOR, HATCH, HATCHES, HEIGHT, INNER, RACKS, ROOF, WALL } from './layout.js'

export const ASSET_NAME = 'FlameTrace-Habitat-Concept'

function createMaterials() {
  const std = (color, extra = {}) => new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15, ...extra })
  return {
    hull: std('#7f91a3', { metalness: 0.35, roughness: 0.55 }),
    wall: std('#93a3b4', { roughness: 0.72, metalness: 0.1 }),
    floor: std('#2d3946', { roughness: 0.85 }),
    frame: std('#a9b7c5', { metalness: 0.6, roughness: 0.35 }),
    rack: std('#52667a', { metalness: 0.5, roughness: 0.45 }),
    rackFace: std('#202c38', { roughness: 0.6 }),
    accent: std('#0e3a42', { emissive: '#65d6e5', emissiveIntensity: 0.9 }),
    cable: std('#1b242d', { roughness: 0.8 }),
    cableAccent: std('#0e3a42', { emissive: '#65d6e5', emissiveIntensity: 0.5 }),
    lightStrip: std('#dfeeff', { emissive: '#cfe6ff', emissiveIntensity: 1.3, roughness: 0.4 }),
    desk: std('#a5b3c1', { roughness: 0.5 }),
    screen: std('#0b2a30', { emissive: '#3ec8da', emissiveIntensity: 0.55 }),
    glass: std('#9ed8e6', { transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0 }),
    fabric: std('#4a5d70', { roughness: 0.92, metalness: 0 }),
    locker: std('#6a7d91', { metalness: 0.3, roughness: 0.55 }),
    grilleBase: std('#1d2630', { roughness: 0.7 }),
    grilleSlat: std('#8da0b3', { metalness: 0.4, roughness: 0.5 }),
  }
}

function roundedRect(shape, x, y, w, h, r) {
  const x1 = x + w
  const y1 = y + h
  shape.moveTo(x + r, y)
  shape.lineTo(x1 - r, y)
  shape.quadraticCurveTo(x1, y, x1, y + r)
  shape.lineTo(x1, y1 - r)
  shape.quadraticCurveTo(x1, y1, x1 - r, y1)
  shape.lineTo(x + r, y1)
  shape.quadraticCurveTo(x, y1, x, y1 - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  return shape
}

// Rounded hatch frame with a rounded opening, extruded through the wall.
function hatchFrameGeometry() {
  const rim = 0.14
  const outer = roundedRect(new Shape(), -HATCH.width / 2 - rim, -0.1, HATCH.width + rim * 2, HATCH.height + 0.1 + rim, 0.36)
  const hole = roundedRect(new Path(), -HATCH.width / 2, 0, HATCH.width, HATCH.height, 0.26)
  outer.holes.push(hole)
  const depth = WALL + 0.1
  const geometry = new ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 8 })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

// A rack facing +Z, standing on y = 0: a body, a darker front, and a few cyan indicator strips.
function rackGeometry() {
  const w = 0.8
  const h = 2.1
  const d = 0.6
  const box = (bw, bh, bd, x, y, z) => new BoxGeometry(bw, bh, bd).translate(x, y, z)
  const body = mergeGeometries([box(w, h, d, 0, h / 2, 0)])
  const faceParts = [box(w - 0.1, h - 0.18, 0.03, 0, h / 2, d / 2 + 0.005)]
  for (let i = 0; i < 4; i += 1) faceParts.push(box(w - 0.16, 0.012, 0.02, 0, 0.5 + i * 0.38, d / 2 + 0.025))
  const accentParts = [0.62, 1.38, 1.76].map((y) => box(0.18, 0.025, 0.02, 0.2, y, d / 2 + 0.03))
  return mergeGeometries([body, mergeGeometries(faceParts), mergeGeometries(accentParts)], true)
}

function lockerGeometry() {
  const door = new BoxGeometry(0.54, 0.42, 0.05)
  const handle = new BoxGeometry(0.16, 0.02, 0.02).translate(0, 0.12, 0.035)
  return mergeGeometries([door, handle], true)
}

function grilleGeometry() {
  const base = new BoxGeometry(0.7, 0.3, 0.03)
  const slats = []
  for (let i = 0; i < 6; i += 1) slats.push(new BoxGeometry(0.62, 0.02, 0.03).translate(0, -0.11 + i * 0.044, 0.02))
  return mergeGeometries([base, mergeGeometries(slats)], true)
}

export function buildHabitat() {
  const mats = createMaterials()
  const unit = new BoxGeometry(1, 1, 1)
  const hatchFrame = hatchFrameGeometry()
  const rack = rackGeometry()
  const locker = lockerGeometry()
  const grille = grilleGeometry()
  const cylinder = new CylinderGeometry(1, 1, 1, 24)
  const extraGeometries = [unit, hatchFrame, rack, locker, grille, cylinder]

  const root = new Group()
  root.name = ASSET_NAME
  root.userData = { description: 'Original conceptual habitat for FlameTrace; not an ISS replica.' }

  const compartments = {}
  const roofs = new Map()
  for (const id of COMPARTMENT_IDS) {
    const group = new Group()
    group.name = `compartment:${id}`
    const shell = new Group()
    shell.name = `shell:${id}`
    const roof = new Group()
    roof.name = `roof:${id}`
    const equipment = new Group()
    equipment.name = `equipment:${id}`
    group.add(shell, roof, equipment)
    root.add(group)
    compartments[id] = { group, shell, roof, equipment }
    roofs.set(id, roof)
  }

  // Everything created for a compartment carries its stable id, so a click can be traced back to it.
  const tag = (object, id, extra = {}) => {
    object.userData = { compartmentId: id, ...extra }
    return object
  }

  // A box given by its min and max corners.
  const slab = (parent, id, name, material, [x0, y0, z0], [x1, y1, z1]) => {
    const mesh = new Mesh(unit, material)
    mesh.name = name
    mesh.scale.set(x1 - x0, y1 - y0, z1 - z0)
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    parent.add(tag(mesh, id))
    return mesh
  }

  // A wall segment along one axis with an optional rectangular opening starting at the floor.
  const wall = (id, name, axis, center, u0, u1, opening) => {
    const t = WALL / 2
    const place = (a, b, y0, y1, part) => {
      if (b - a < 0.001) return
      const min = axis === 'x' ? [a, y0, center - t] : [center - t, y0, a]
      const max = axis === 'x' ? [b, y1, center + t] : [center + t, y1, b]
      slab(compartments[id].shell, id, `${name}-${part}`, mats.wall, min, max)
    }
    if (!opening) return place(u0, u1, 0, HEIGHT, 'solid')
    const [a, b, h] = opening
    place(u0, a, 0, HEIGHT, 'left')
    place(b, u1, 0, HEIGHT, 'right')
    place(a, b, h, HEIGHT, 'lintel')
  }

  const hw = HATCH.width / 2
  // Central passage: side walls with hatches, a closed south end.
  wall('central-passage', 'passage-wall-west', 'z', -1.4, -6.5, 6.5, [-hw, hw, HATCH.height])
  wall('central-passage', 'passage-wall-east', 'z', 1.4, -6.5, 6.5, [-hw, hw, HATCH.height])
  wall('central-passage', 'passage-wall-south', 'x', -6.65, -1.55, 1.55)
  // Research lab and crew quarters: outer walls.
  for (const [id, sign] of [['research-lab', -1], ['crew-quarters', 1]]) {
    const outer = sign * 7.65
    const a = Math.min(sign * 7.8, sign * 1.55)
    const b = Math.max(sign * 7.8, sign * 1.55)
    wall(id, `${id}-wall-outer`, 'z', outer, -3.5, 3.5)
    wall(id, `${id}-wall-north`, 'x', 3.35, a, b)
    wall(id, `${id}-wall-south`, 'x', -3.35, a, b)
  }
  // Stowage bay: a south wall with the hatch, and three closed walls.
  wall('stowage-bay', 'stowage-wall-south', 'x', 6.65, -3.5, 3.5, [-hw, hw, HATCH.height])
  wall('stowage-bay', 'stowage-wall-north', 'x', 11.95, -3.5, 3.5)
  wall('stowage-bay', 'stowage-wall-west', 'z', -3.35, 6.8, 12.1)
  wall('stowage-bay', 'stowage-wall-east', 'z', 3.35, 6.8, 12.1)

  // Floors and roofs (the roofs are the removable part of the cutaway).
  const footprints = {
    'central-passage': [[-1.55, -6.8], [1.55, 6.5]],
    'research-lab': [[-7.8, -3.5], [-1.55, 3.5]],
    'crew-quarters': [[1.55, -3.5], [7.8, 3.5]],
    'stowage-bay': [[-3.5, 6.5], [3.5, 12.1]],
  }
  for (const id of COMPARTMENT_IDS) {
    const [[x0, z0], [x1, z1]] = footprints[id]
    // The passage floor runs under the stowage hatch wall.
    const floorEnd = id === 'central-passage' ? 6.8 : z1
    slab(compartments[id].shell, id, `floor:${id}`, mats.floor, [x0, -FLOOR, z0], [x1, 0, floorEnd])
    slab(compartments[id].roof, id, `roof-slab:${id}`, mats.hull, [x0, HEIGHT, z0], [x1, HEIGHT + ROOF, z1])
  }

  // Hatch frames.
  for (const hatch of HATCHES) {
    const mesh = new Mesh(hatchFrame, mats.frame)
    mesh.name = hatch.id
    if (hatch.axis === 'x') {
      mesh.rotation.y = Math.PI / 2
      mesh.position.set(hatch.at, 0, hatch.along)
    } else {
      mesh.position.set(hatch.along, 0, hatch.at)
    }
    compartments[hatch.from].shell.add(tag(mesh, hatch.from, { hatchId: hatch.id }))
  }

  // Equipment racks.
  const facingAngle = { 'z+': 0, 'x+': Math.PI / 2, 'z-': Math.PI, 'x-': -Math.PI / 2 }
  for (const spec of RACKS) {
    const mesh = new Mesh(rack, [mats.rack, mats.rackFace, mats.accent])
    mesh.name = spec.id
    mesh.position.set(...spec.position)
    mesh.rotation.y = facingAngle[spec.facing]
    if (spec.depth) mesh.scale.z = spec.depth / 0.6
    compartments[spec.compartment].equipment.add(tag(mesh, spec.compartment, { equipmentId: spec.id }))
  }

  // Lockers: storage panels in a grid on a wall.
  const lockerWall = (id, prefix, origin, along, normal, columns, rows) => {
    const angle = Math.atan2(normal[0], normal[2])
    for (let c = 0; c < columns; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const mesh = new Mesh(locker, [mats.locker, mats.grilleSlat])
        mesh.name = `${prefix}-locker-${r + 1}${String.fromCharCode(97 + c)}`
        const s = (c - (columns - 1) / 2) * 0.58
        mesh.position.set(origin[0] + along[0] * s, origin[1] + r * 0.48, origin[2] + along[2] * s)
        mesh.rotation.y = angle
        compartments[id].equipment.add(tag(mesh, id))
      }
    }
  }
  lockerWall('stowage-bay', 'stowage-w', [-3.2 + 0.05, 0.45, 9.3], [0, 0, 1], [1, 0, 0], 5, 4)
  lockerWall('stowage-bay', 'stowage-e', [3.2 - 0.05, 0.45, 9.3], [0, 0, 1], [-1, 0, 0], 5, 4)
  lockerWall('crew-quarters', 'crew-s', [4.6, 0.45, -3.2 + 0.05], [1, 0, 0], [0, 0, 1], 4, 3)

  // Ventilation grilles.
  const addGrille = (id, name, position, rotation) => {
    const mesh = new Mesh(grille, [mats.grilleBase, mats.grilleSlat])
    mesh.name = name
    mesh.position.set(...position)
    mesh.rotation.set(...rotation)
    compartments[id].equipment.add(tag(mesh, id))
  }
  addGrille('central-passage', 'passage-grille-1', [0, HEIGHT - 0.02, -3.2], [Math.PI / 2, 0, 0])
  addGrille('central-passage', 'passage-grille-2', [0, HEIGHT - 0.02, 3.2], [Math.PI / 2, 0, 0])
  addGrille('research-lab', 'lab-grille-1', [-7.5 + 0.02, 2.4, -1.5], [0, Math.PI / 2, 0])
  addGrille('research-lab', 'lab-grille-2', [-7.5 + 0.02, 2.4, 1.0], [0, Math.PI / 2, 0])
  addGrille('crew-quarters', 'crew-grille-1', [7.5 - 0.02, 2.2, 0], [0, -Math.PI / 2, 0])
  addGrille('crew-quarters', 'crew-grille-2', [3.5, HEIGHT - 0.02, 0], [Math.PI / 2, 0, 0])
  addGrille('stowage-bay', 'stowage-grille-1', [0, 2.35, 11.8 - 0.02], [0, Math.PI, 0])
  addGrille('stowage-bay', 'stowage-grille-2', [0, HEIGHT - 0.02, 9.3], [Math.PI / 2, 0, 0])

  // Ceiling light strips and the passage floor guide.
  const strips = {
    'central-passage': [[0, -4.4], [0, 0], [0, 4.4]],
    'research-lab': [[-4.5, -1.6], [-4.5, 1.6]],
    'crew-quarters': [[4.5, -1.6], [4.5, 1.6]],
    'stowage-bay': [[0, 8.2], [0, 10.4]],
  }
  for (const [id, list] of Object.entries(strips)) {
    list.forEach(([x, z], i) => {
      const long = id === 'central-passage' ? 1.4 : 2.2
      slab(
        compartments[id].equipment,
        id,
        `light-strip:${id}:${i + 1}`,
        mats.lightStrip,
        [x - 0.18, HEIGHT - 0.04, z - long / 2],
        [x + 0.18, HEIGHT, z + long / 2],
      )
    })
  }
  slab(compartments['central-passage'].equipment, 'central-passage', 'floor-guide', mats.accent, [-0.06, 0, -6.2], [0.06, 0.02, 6.2])

  // Cable and conduit runs: thin tubes along the ceiling and down to equipment.
  const tube = (id, name, points, radius, material) => {
    const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'catmullrom', 0.2)
    const geometry = new TubeGeometry(curve, 28, radius, 6, false)
    extraGeometries.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    compartments[id].equipment.add(tag(mesh, id))
  }
  tube('central-passage', 'passage-conduit-w', [[-0.85, 2.55, -6.2], [-0.85, 2.5, 0], [-0.85, 2.55, 6.2]], 0.04, mats.cable)
  tube('central-passage', 'passage-conduit-e', [[0.85, 2.55, -6.2], [0.85, 2.5, 0], [0.85, 2.55, 6.2]], 0.04, mats.cable)
  tube('central-passage', 'passage-conduit-accent', [[0.7, 2.62, -6.2], [0.7, 2.6, 6.2]], 0.016, mats.cableAccent)
  tube('research-lab', 'lab-conduit-main', [[-7.2, 2.5, -3.0], [-7.2, 2.5, 3.0]], 0.045, mats.cable)
  tube('research-lab', 'lab-conduit-drop-1', [[-7.2, 2.5, -0.5], [-7.2, 2.3, -0.5], [-7.1, 2.12, -0.5]], 0.03, mats.cable)
  tube('research-lab', 'lab-conduit-drop-2', [[-7.2, 2.5, 1.5], [-7.2, 2.3, 1.5], [-7.1, 2.12, 1.5]], 0.03, mats.cableAccent)
  tube('research-lab', 'lab-conduit-south', [[-6.5, 2.55, -3.0], [-4.8, 2.5, -3.0]], 0.035, mats.cable)
  tube('crew-quarters', 'crew-conduit-main', [[7.2, 2.5, -3.0], [7.2, 2.5, 3.0]], 0.04, mats.cable)
  tube('stowage-bay', 'stowage-conduit-main', [[-3.0, 2.55, 11.6], [3.0, 2.55, 11.6]], 0.04, mats.cable)
  tube('stowage-bay', 'stowage-conduit-accent', [[-3.0, 2.62, 7.2], [3.0, 2.62, 7.2]], 0.016, mats.cableAccent)

  // Research lab: workstation with two screens, a chair, and an experiment chamber (all placeholders).
  const lab = compartments['research-lab'].equipment
  const labTag = (object, equipmentId) => lab.add(tag(object, 'research-lab', { equipmentId }))
  slab(lab, 'research-lab', 'lab-workstation-desk', mats.desk, [-5.7, 0.74, 2.3], [-3.3, 0.8, 3.15])
  slab(lab, 'research-lab', 'lab-workstation-side-1', mats.hull, [-5.7, 0, 2.35], [-5.64, 0.74, 3.1])
  slab(lab, 'research-lab', 'lab-workstation-side-2', mats.hull, [-3.36, 0, 2.35], [-3.3, 0.74, 3.1])
  for (const [i, x] of [-5.0, -4.0].entries()) {
    const screen = new Mesh(unit, mats.screen)
    screen.name = `lab-workstation-screen-${i + 1}`
    screen.scale.set(0.7, 0.42, 0.04)
    screen.position.set(x, 1.2, 3.0)
    screen.rotation.y = Math.PI
    labTag(screen, 'lab-workstation-01')
    slab(lab, 'research-lab', `lab-workstation-stand-${i + 1}`, mats.hull, [x - 0.03, 0.8, 3.0], [x + 0.03, 1.0, 3.06])
  }
  const seat = new Mesh(cylinder, mats.fabric)
  seat.name = 'lab-chair-seat'
  seat.scale.set(0.26, 0.07, 0.26)
  seat.position.set(-4.5, 0.46, 1.8)
  labTag(seat, 'lab-chair-01')
  slab(lab, 'research-lab', 'lab-chair-back', mats.fabric, [-4.74, 0.5, 1.5], [-4.26, 0.98, 1.56])
  slab(lab, 'research-lab', 'lab-chair-post', mats.hull, [-4.52, 0, 1.78], [-4.48, 0.46, 1.82])
  slab(lab, 'research-lab', 'lab-chamber-base', mats.hull, [-5.05, 0, -0.85], [-3.75, 0.8, 0.05])
  slab(lab, 'research-lab', 'lab-chamber-glass', mats.glass, [-4.95, 0.8, -0.75], [-3.85, 1.45, -0.05])
  slab(lab, 'research-lab', 'lab-chamber-light', mats.accent, [-4.95, 1.45, -0.75], [-3.85, 1.49, -0.05])
  slab(lab, 'research-lab', 'lab-chamber-panel', mats.rackFace, [-3.77, 0.45, -0.7], [-3.75, 0.72, -0.2])

  // Crew quarters: two berths and a fold-out table.
  const crew = compartments['crew-quarters'].equipment
  for (const i of [0, 1]) {
    const x0 = 3.0 + i * 2.1
    slab(crew, 'crew-quarters', `crew-berth-${i + 1}-frame`, mats.hull, [x0, 0.1, 2.2], [x0 + 1.9, 0.5, 3.15])
    slab(crew, 'crew-quarters', `crew-berth-${i + 1}-mattress`, mats.fabric, [x0 + 0.05, 0.5, 2.25], [x0 + 1.85, 0.62, 3.1])
    slab(crew, 'crew-quarters', `crew-berth-${i + 1}-pillow`, mats.desk, [x0 + 0.1, 0.62, 2.35], [x0 + 0.5, 0.7, 3.0])
  }
  slab(crew, 'crew-quarters', 'crew-table-top', mats.desk, [3.9, 0.74, -1.5], [5.1, 0.79, -0.8])
  const pedestal = new Mesh(cylinder, mats.hull)
  pedestal.name = 'crew-table-pedestal'
  pedestal.scale.set(0.06, 0.74, 0.06)
  pedestal.position.set(4.5, 0.37, -1.15)
  crew.add(tag(pedestal, 'crew-quarters'))

  // Stowage bay: two floor containers with cyan label strips.
  const stow = compartments['stowage-bay'].equipment
  slab(stow, 'stowage-bay', 'stowage-container-01', mats.rack, [-1.5, 0, 8.4], [-0.5, 0.6, 9.1])
  slab(stow, 'stowage-bay', 'stowage-container-01-label', mats.accent, [-1.45, 0.4, 8.38], [-0.55, 0.44, 8.4])
  slab(stow, 'stowage-bay', 'stowage-container-02', mats.rack, [0.6, 0, 9.6], [1.6, 0.5, 10.2])
  slab(stow, 'stowage-bay', 'stowage-container-02-label', mats.accent, [0.65, 0.33, 9.58], [1.55, 0.37, 9.6])

  // Passage south end: a dim porthole.
  const ring = new Mesh(new TorusGeometry(0.42, 0.06, 10, 28), mats.frame)
  extraGeometries.push(ring.geometry)
  ring.name = 'passage-porthole-ring'
  ring.position.set(0, 1.5, -6.5 + 0.02)
  compartments['central-passage'].equipment.add(tag(ring, 'central-passage'))
  const pane = new Mesh(cylinder, mats.glass)
  pane.name = 'passage-porthole-glass'
  pane.rotation.x = Math.PI / 2
  pane.scale.set(0.4, 0.04, 0.4)
  pane.position.set(0, 1.5, -6.5 + 0.02)
  compartments['central-passage'].equipment.add(tag(pane, 'central-passage'))

  const materials = Object.values(mats)
  const dispose = () => {
    extraGeometries.forEach((g) => g.dispose())
    materials.forEach((m) => m.dispose())
  }

  return { root, roofs, materials: mats, dispose, compartments }
}

// Compartment id of any object inside the habitat, or null.
export function compartmentOf(object) {
  for (let node = object; node; node = node.parent) {
    if (node.userData?.compartmentId) return node.userData.compartmentId
  }
  return null
}

export { INNER }
