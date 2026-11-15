import test from 'node:test'
import assert from 'node:assert/strict'
import { DIVE, diveProgress, diveSpeed, findDockingTarget } from './intro.js'
import { createAttempt } from './entry.js'

test('dive: progress eases from 0 to 1 and speed is zero at both ends', () => {
  assert.equal(diveProgress(0), 0)
  assert.equal(diveProgress(DIVE.FLIGHT), 1)
  assert.equal(diveSpeed(0), 0)
  assert.equal(diveSpeed(DIVE.FLIGHT), 0)
  assert.ok(Math.abs(diveSpeed(DIVE.FLIGHT / 2) - 1) < 1e-9)
  let last = -1
  for (let t = 0; t <= DIVE.FLIGHT; t += 0.1) {
    const p = diveProgress(t)
    assert.ok(p >= last)
    last = p
  }
})

test('dive timeline keeps the documented order and stays within about 4-6 seconds', () => {
  assert.ok(DIVE.WELCOME_IN < DIVE.WELCOME_OUT && DIVE.WELCOME_OUT <= DIVE.REVEAL && DIVE.REVEAL < DIVE.TOTAL)
  assert.ok(DIVE.WELCOME_IN < DIVE.FLIGHT)
  assert.ok(DIVE.TOTAL >= 4 && DIVE.TOTAL <= 6)
})

test('docking target: finds the flat forward cap from geometry alone, and returns null when there is none', () => {
  const pts = []
  for (let i = 0; i < 200; i++) pts.push((i % 20) * 0.0026 - 0.025, -0.164 + (Math.floor(i / 20) * 0.0021), 0.0665 - (i % 3) * 0.001)
  for (let i = 0; i < 300; i++) pts.push(-0.4 + (i / 300) * 0.8, 0.2 - (i % 7) * 0.05, 0.02)
  const target = findDockingTarget(new Float32Array(pts))
  assert.ok(target)
  assert.ok(Math.abs(target.center[2] - 0.0665) < 1e-6)
  assert.ok(target.radius > 0.01 && target.radius < 0.03)
  assert.equal(findDockingTarget(new Float32Array(pts.slice(600))), null) // no cap among the remaining samples
  assert.equal(findDockingTarget(new Float32Array(0)), null)
})

test('sign-in attempt: consumed once, and expires', () => {
  let clock = 1000
  const attempt = createAttempt(() => clock)
  assert.equal(attempt.peek(), false)
  attempt.begin()
  assert.equal(attempt.peek(), true)
  assert.equal(attempt.take(), true)
  assert.equal(attempt.take(), false)
  attempt.begin()
  clock += 25000
  assert.equal(attempt.peek(), false) // a stale attempt (for example a session that arrives much later) is ignored
  attempt.begin()
  attempt.clear()
  assert.equal(attempt.take(), false)
})
