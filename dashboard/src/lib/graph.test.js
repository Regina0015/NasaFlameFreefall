import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGraph, isHollow, layoutGraph } from './graph.js'

const investigations = [
  { id: 'PSI-1', label: 'ONE', type: 'flight', tier: 1, pillar: 'prevention' },
  { id: 'PSI-2', label: 'TWO', type: 'flight', tier: 2, pillar: null },
  { id: 'PSI-3', acronym: '', title: 'Ground study', type: 'ground', tier: null },
]
const relations = [
  { from_id: 'PSI-1', to_id: 'PSI-2', type: 'same_hardware', source: 'hardware' },
  { from_id: 'PSI-1', to_id: 'PSI-2', type: 'same_fuel', source: 'tests.fuel' },
  { from_id: 'PSI-3', to_id: 'PSI-1', type: 'reuses_flight_data', source: 'x' },
  { from_id: 'PSI-9', to_id: 'PSI-1', type: 'same_fuel', source: 'unknown end' },
  { from_id: 'PSI-1', to_id: 'PSI-2', type: 'made_up', source: 'bad type' },
]

test('buildGraph keeps real data and drops relations it cannot place', () => {
  const g = buildGraph({ investigations, relations, testCounts: { 'PSI-1': 40 } })
  assert.equal(g.nodes.length, 3)
  assert.equal(g.edges.length, 3)
  assert.equal(g.dropped, 2)
  assert.equal(g.nodes.find((n) => n.id === 'PSI-2').pillar, 'unreviewed')
  assert.equal(g.nodes.find((n) => n.id === 'PSI-3').label, 'PSI-3')
  assert.equal(g.nodes.find((n) => n.id === 'PSI-3').tier, null)
  assert.ok(isHollow(g.nodes.find((n) => n.id === 'PSI-3')))
  // A flight study with no loaded rows is not a "ground study without tests".
  assert.ok(!isHollow(g.nodes.find((n) => n.id === 'PSI-2')))
})

test('parallel relations between a pair get separate lanes', () => {
  const g = buildGraph({ investigations, relations, testCounts: {} })
  const pair = g.edges.filter((e) => e.type !== 'reuses_flight_data')
  assert.deepEqual(pair.map((e) => e.lane).sort(), [0, 1])
  assert.ok(pair.every((e) => e.lanes === 2))
})

test('layout is deterministic, finite and inside the view box', () => {
  const g = buildGraph({ investigations, relations, testCounts: { 'PSI-1': 40, 'PSI-2': 10 } })
  const a = layoutGraph(g.nodes, g.edges)
  const b = layoutGraph(g.nodes, g.edges)
  assert.deepEqual(a.positions, b.positions)
  for (const p of Object.values(a.positions)) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y))
    assert.ok(p.x >= 0 && p.x <= a.width && p.y >= 0 && p.y <= a.height)
  }
})

test('circle area follows the test count', () => {
  const g = buildGraph({ investigations, relations, testCounts: { 'PSI-1': 100, 'PSI-2': 25 } })
  const { radii } = layoutGraph(g.nodes, g.edges)
  assert.ok(radii['PSI-1'] > radii['PSI-2'] && radii['PSI-2'] > radii['PSI-3'])
})

import { labelLines, placeLabels, shortLabel, fitTransform } from './graph.js'

test('labels prefer the acronym, keep complete names and fall back to the id for long ground-study titles', () => {
  assert.equal(shortLabel({ id: 'PSI-25', acronym: 'BASS-II', label: 'BASS-II' }), 'BASS-II')
  assert.equal(shortLabel({ id: 'PSI-60', acronym: '', label: 'Computational and Experimental Analysis of SPICE Data Sets' }), 'PSI-60')
  assert.deepEqual(labelLines('ACME E-FIELD Flames'), ['ACME E-FIELD', 'Flames'])
  assert.deepEqual(labelLines('BASS-II'), ['BASS-II'])
})

test('pillar none is a reviewed result and stays apart from not reviewed yet', () => {
  const g = buildGraph({ investigations: [{ id: 'PSI-22', pillar: 'none', type: 'flight' }, { id: 'PSI-1', pillar: null, type: 'flight' }], relations: [], testCounts: {} })
  assert.equal(g.nodes[0].pillar, 'none')
  assert.equal(g.nodes[1].pillar, 'unreviewed')
})

test('a dense group is spread out: no two circles overlap and everything stays in the frame', () => {
  const nodes = []
  for (let i = 0; i < 24; i += 1) nodes.push({ id: `PSI-${i + 1}`, label: `N${i}`, short: `N${i}`, type: 'flight', tests: i < 8 ? 120 + i * 10 : i * 3, tier: 1, pillar: 'unreviewed' })
  const edges = []
  for (let i = 0; i < 8; i += 1) for (let j = i + 1; j < 8; j += 1) edges.push({ id: `${i}|${j}`, from: nodes[i].id, to: nodes[j].id, type: 'same_hardware', source: 'x', lane: 0, lanes: 1 })
  const { positions, radii, width, height } = layoutGraph(nodes, edges, { width: 1400, height: 900 })
  for (let i = 0; i < nodes.length; i += 1) {
    const a = positions[nodes[i].id]
    assert.ok(a.x >= 0 && a.x <= width && a.y >= 0 && a.y <= height)
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = positions[nodes[j].id]
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= radii[nodes[i].id] + radii[nodes[j].id] + 20, `${nodes[i].id} overlaps ${nodes[j].id}`)
    }
  }
  assert.deepEqual(layoutGraph(nodes, edges, { width: 1400, height: 900 }).positions, positions)
})

test('label placement never overlaps and frees up when zoomed in', () => {
  const nodes = ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, short: `ACME-${id}-LONG` }))
  const positions = Object.fromEntries(nodes.map((n, i) => [n.id, { x: 100 + i * 20, y: 100 }]))
  const radii = Object.fromEntries(nodes.map((n) => [n.id, 8]))
  const crowded = placeLabels(nodes, positions, radii, 0.5)
  assert.ok(Object.values(crowded).some((l) => l.hidden))
  const roomy = placeLabels(nodes, positions, radii, 8)
  assert.ok(Object.values(roomy).every((l) => !l.hidden))
  const hiddenId = Object.keys(crowded).find((id) => crowded[id].hidden)
  assert.equal(placeLabels(nodes, positions, radii, 0.5, { force: [hiddenId] })[hiddenId].hidden, false)
})

test('fit transform centers the points', () => {
  const t = fitTransform([{ x: 100, y: 100 }, { x: 500, y: 300 }], { width: 1400, height: 900 })
  assert.ok(t.k > 1)
  assert.ok(Math.abs(300 * t.k + t.x - 700) < 1e-6)
})
