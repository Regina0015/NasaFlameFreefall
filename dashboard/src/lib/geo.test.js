import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { SphereGeometry } from 'three'
import { outerRing, patchAngles, toLatLon, toUnit } from './geo.js'
import { OPEN } from './intro.js'

test('toUnit matches three.js SphereGeometry vertices and the equirectangular texture coordinates', () => {
  // A 1-degree grid: vertex (ix, iy) is at longitude ix - 180 and latitude 90 - iy.
  const g = new SphereGeometry(1, 360, 180)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (const [lat, lon] of [[26, -100], [-33, 151], [0, 0], [60, 10], [-45, -70]]) {
    const ix = lon + 180
    const iy = 90 - lat
    const i = iy * 361 + ix
    const [x, y, z] = toUnit(lat, lon)
    assert.ok(Math.abs(pos.getX(i) - x) < 1e-6 && Math.abs(pos.getY(i) - y) < 1e-6 && Math.abs(pos.getZ(i) - z) < 1e-6, `${lat},${lon}`)
    assert.ok(Math.abs(uv.getX(i) - (lon + 180) / 360) < 1e-6 && Math.abs(uv.getY(i) - (lat + 90) / 180) < 1e-6)
  }
})

test('toLatLon inverts toUnit, including Monterrey', () => {
  const back = toLatLon(...toUnit(OPEN.PIN.lat, OPEN.PIN.lon))
  assert.ok(Math.abs(back.lat - 25.6866) < 1e-9 && Math.abs(back.lon - -100.3161) < 1e-9)
})

test('a SphereGeometry patch covers exactly the latitude/longitude box of the imagery', () => {
  const box = OPEN.PATCH
  const a = patchAngles(box)
  const g = new SphereGeometry(1, 4, 4, a.phiStart, a.phiLength, a.thetaStart, a.thetaLength)
  const pos = g.attributes.position
  const first = [pos.getX(0), pos.getY(0), pos.getZ(0)] // top-left corner: north-west
  const nw = toUnit(box.latMax, box.lonMin)
  assert.ok(first.every((v, i) => Math.abs(v - nw[i]) < 1e-6))
  const last = pos.count - 1 // bottom-right corner: south-east
  const se = toUnit(box.latMin, box.lonMax)
  assert.ok([pos.getX(last), pos.getY(last), pos.getZ(last)].every((v, i) => Math.abs(v - se[i]) < 1e-6))
})

test('the saved Nuevo Leon outline is a state polygon around Monterrey inside the imagery box', () => {
  const json = JSON.parse(fs.readFileSync(new URL('../../public/data/geo/nuevo-leon.geojson', import.meta.url), 'utf8'))
  const ring = outerRing(json)
  assert.ok(ring && ring.length > 100)
  assert.equal(json.features[0].properties.iso_3166_2, 'MX-NLE')
  const lons = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  assert.ok(Math.min(...lons) > OPEN.PATCH.lonMin && Math.max(...lons) < OPEN.PATCH.lonMax)
  assert.ok(Math.min(...lats) > OPEN.PATCH.latMin && Math.max(...lats) < OPEN.PATCH.latMax)
  // Monterrey lies inside the state's bounding box.
  assert.ok(OPEN.PIN.lon > Math.min(...lons) && OPEN.PIN.lon < Math.max(...lons) && OPEN.PIN.lat > Math.min(...lats) && OPEN.PIN.lat < Math.max(...lats))
  // Point-in-polygon: the pin is inside the outline itself, not only inside its bounding box.
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > OPEN.PIN.lat !== yj > OPEN.PIN.lat && OPEN.PIN.lon < ((xj - xi) * (OPEN.PIN.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  assert.equal(inside, true)
})

test('outerRing rejects anything that is not a polygon with real coordinates', () => {
  assert.equal(outerRing(null), null)
  assert.equal(outerRing({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } }), null)
  assert.equal(outerRing({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [200, 5], [0, 0]]] } }), null)
})
