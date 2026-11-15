// Latitude and longitude on the unit sphere, using the SAME parameterization as three.js SphereGeometry, so a point
// placed with toUnit() lines up with the equirectangular Earth texture (u = (longitude + 180) / 360, v = (latitude +
// 90) / 180) and with SphereGeometry patches. Pure functions, no three.js import.

const RAD = Math.PI / 180

// SphereGeometry: x = -r cos(phi) sin(theta), y = r cos(theta), z = r sin(phi) sin(theta),
// with phi = (longitude + 180) degrees and theta = (90 - latitude) degrees.
export function toUnit(lat, lon, r = 1) {
  const phi = (lon + 180) * RAD
  const theta = (90 - lat) * RAD
  return [-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta)]
}

// The inverse, for checks.
export function toLatLon(x, y, z) {
  const r = Math.hypot(x, y, z)
  const lat = 90 - Math.acos(y / r) / RAD
  const phi = Math.atan2(z, -x)
  let lon = phi / RAD - 180
  if (lon < -180) lon += 360
  return { lat, lon }
}

// SphereGeometry arguments for a patch that covers a latitude/longitude box exactly.
export function patchAngles({ lonMin, lonMax, latMin, latMax }) {
  return {
    phiStart: (lonMin + 180) * RAD,
    phiLength: (lonMax - lonMin) * RAD,
    thetaStart: (90 - latMax) * RAD,
    thetaLength: (latMax - latMin) * RAD,
  }
}

// A GeoJSON ring ([lon, lat] pairs) as flat xyz positions on a sphere of radius r.
export function ringToPositions(ring, r) {
  const out = new Float32Array(ring.length * 3)
  ring.forEach(([lon, lat], i) => out.set(toUnit(lat, lon, r), i * 3))
  return out
}

// The outer ring of the first polygon of a GeoJSON FeatureCollection or Feature, or null when it is not one.
export function outerRing(geojson) {
  const feature = geojson?.type === 'FeatureCollection' ? geojson.features?.[0] : geojson
  const g = feature?.geometry
  const ring = g?.type === 'Polygon' ? g.coordinates?.[0] : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : null
  if (!Array.isArray(ring) || ring.length < 4) return null
  if (!ring.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return null
  return ring
}
