import test from 'node:test'
import assert from 'node:assert/strict'
import { clampToInterior, insideInterior, pointAlong, routeBetween } from './camera.js'
import { COMPARTMENT_IDS, VIEWPOINTS } from './layout.js'

test('every viewpoint is inside the safe area', () => {
  for (const id of COMPARTMENT_IDS) assert.ok(insideInterior(VIEWPOINTS[id].position), id)
})

test('every point on every route stays inside the safe area', () => {
  for (const a of COMPARTMENT_IDS) {
    for (const b of COMPARTMENT_IDS) {
      const route = routeBetween(a, b)
      for (let i = 0; i <= 100; i += 1) assert.ok(insideInterior(pointAlong(route, i / 100)), `${a} to ${b} at ${i}%`)
    }
  }
})

test('routes start and end at the viewpoints', () => {
  const route = routeBetween('research-lab', 'stowage-bay')
  assert.deepEqual(route[0], VIEWPOINTS['research-lab'].position)
  assert.deepEqual(route.at(-1), VIEWPOINTS['stowage-bay'].position)
})

test('a point outside the walls is pulled back inside', () => {
  const outside = clampToInterior([-20, 1.5, 0])
  assert.ok(insideInterior(outside))
  assert.ok(outside[0] > -7.5)
  const above = clampToInterior([0, 9, 0])
  assert.ok(above[1] < 2.7)
})
