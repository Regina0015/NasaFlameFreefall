// Names and descriptions of the conceptual compartments. Kept apart from the geometry (layout.js, build.js).
// Everything here describes an invented layout. None of it comes from NASA data or a real station.

export const COMPARTMENTS = {
  'central-passage': {
    name: 'Central passage',
    summary: 'The corridor that links the other three compartments.',
    detail: 'Equipment racks line both walls toward the stowage end. A guide strip runs along the floor.',
  },
  'research-lab': {
    name: 'Research lab',
    summary: 'A workstation, an experiment chamber and a wall of equipment racks.',
    detail: 'Concept layout only. The racks and the chamber are placeholders, not real flight hardware.',
  },
  'crew-quarters': {
    name: 'Crew quarters',
    summary: 'Two berths, a fold-out table and storage lockers.',
    detail: 'Concept layout only, with no habitability analysis behind it.',
  },
  'stowage-bay': {
    name: 'Stowage bay',
    summary: 'Locker walls, supply racks and floor containers.',
    detail: 'Concept layout only. Nothing here represents real inventory.',
  },
}

export const ASSET_NOTE =
  'Original conceptual habitat generated for FlameTrace. It is not an ISS replica and it is not the inside of the NASA model shown in the exterior view.'

export const DEMO_SCENARIO = {
  rackId: 'lab-rack-02',
  label: 'Illustrative scenario — no live telemetry',
  title: 'Demonstration marker',
  body: [
    'This red marker only shows how a located alert could look on a conceptual equipment rack. It is placed by hand on an invented rack.',
    'It is not connected to any sensor, test result, finding or emergency system. No readings, thresholds or predictions are involved, and no notification is sent.',
  ],
}
