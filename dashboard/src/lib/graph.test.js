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
