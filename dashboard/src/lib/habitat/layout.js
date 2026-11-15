// Spatial layout of the FlameTrace conceptual habitat. Pure data, in meters, Y up, floor at y = 0.
// This is an ORIGINAL invented layout, not an ISS replica and not the inside of the NASA model.
// Names and descriptions live in metadata.js; the geometry is built in build.js from this file.

export const WALL = 0.3 // wall thickness
export const HEIGHT = 2.7 // inner height
export const FLOOR = 0.15 // floor slab thickness (below y = 0)
export const ROOF = 0.2 // roof slab thickness (above HEIGHT)
export const HATCH = { width: 1.3, height: 1.95 }
export const EYE = 1.55 // camera height inside

export const COMPARTMENT_IDS = ['central-passage', 'research-lab', 'crew-quarters', 'stowage-bay']

// Inner (walkable) volumes: min and max corners.
export const INNER = {
  'central-passage': { min: [-1.25, 0, -6.5], max: [1.25, HEIGHT, 6.5] },
  'research-lab': { min: [-7.5, 0, -3.2], max: [-1.55, HEIGHT, 3.2] },
  'crew-quarters': { min: [1.55, 0, -3.2], max: [7.5, HEIGHT, 3.2] },
  'stowage-bay': { min: [-3.2, 0, 6.8], max: [3.2, HEIGHT, 11.8] },
}

// Hatches cut through the walls shared with the central passage.
// `axis` is the wall's normal axis, `at` the wall's center on that axis, `along` the opening's center on the other.
export const HATCHES = [
  { id: 'hatch-research-lab', from: 'central-passage', to: 'research-lab', axis: 'x', at: -1.4, along: 0 },
  { id: 'hatch-crew-quarters', from: 'central-passage', to: 'crew-quarters', axis: 'x', at: 1.4, along: 0 },
  { id: 'hatch-stowage-bay', from: 'central-passage', to: 'stowage-bay', axis: 'z', at: 6.65, along: 0 },
]

// Where the camera stands inside each compartment, and what it first looks at.
export const VIEWPOINTS = {
  'central-passage': { position: [0, EYE, -5.8], target: [0, 1.4, 6] },
  'research-lab': { position: [-2.6, EYE, 0], target: [-7.4, 1.3, 0] },
  'crew-quarters': { position: [2.6, EYE, 0], target: [7.4, 1.3, 0] },
  'stowage-bay': { position: [0, EYE, 7.7], target: [0, 1.3, 11.7] },
}

// Where the camera passes between compartments: always through the passage and the hatches.
export const HUB = [0, EYE, 0]
export const HATCH_WAYPOINTS = {
  'research-lab': [-1.4, EYE, 0],
  'crew-quarters': [1.4, EYE, 0],
  'stowage-bay': [0, EYE, 6.65],
}

// Equipment racks with stable ids. Used by builders and by the illustrative demo marker.
// `side` is the wall the rack stands against; racks face into the room.
export const RACKS = [
  ...[-2.5, -1.5, -0.5, 0.5, 1.5].map((z, i) => ({
    id: `lab-rack-0${i + 1}`,
    compartment: 'research-lab',
    position: [-7.5 + 0.35, 0, z],
    facing: 'x+',
  })),
  { id: 'lab-rack-06', compartment: 'research-lab', position: [-6.2, 0, -3.2 + 0.35], facing: 'z+' },
  { id: 'lab-rack-07', compartment: 'research-lab', position: [-5.3, 0, -3.2 + 0.35], facing: 'z+' },
  { id: 'crew-rack-01', compartment: 'crew-quarters', position: [7.5 - 0.35, 0, -2.4], facing: 'x-' },
  { id: 'crew-rack-02', compartment: 'crew-quarters', position: [7.5 - 0.35, 0, -1.2], facing: 'x-' },
  { id: 'stowage-rack-01', compartment: 'stowage-bay', position: [-2.2, 0, 11.8 - 0.35], facing: 'z-' },
  { id: 'stowage-rack-02', compartment: 'stowage-bay', position: [-1.1, 0, 11.8 - 0.35], facing: 'z-' },
  { id: 'stowage-rack-03', compartment: 'stowage-bay', position: [1.1, 0, 11.8 - 0.35], facing: 'z-' },
  { id: 'stowage-rack-04', compartment: 'stowage-bay', position: [2.2, 0, 11.8 - 0.35], facing: 'z-' },
  ...[3.6, 4.7, 5.8].flatMap((z, i) => [
    { id: `passage-rack-w${i + 1}`, compartment: 'central-passage', position: [-1.25 + 0.3, 0, z], facing: 'x+', depth: 0.5 },
    { id: `passage-rack-e${i + 1}`, compartment: 'central-passage', position: [1.25 - 0.3, 0, z], facing: 'x-', depth: 0.5 },
  ]),
]

// Safe camera area inside: the union of the inner volumes, kept away from the walls.
export const CAMERA_MARGIN = 0.3
