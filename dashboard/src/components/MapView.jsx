import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PILLARS, RELATION_TYPES, buildGraph, isHollow, layoutGraph } from '../lib/graph.js'
import { Segmented } from './ui.jsx'

// Investigation relationship graph (the "Map" view). Nodes are investigations, edges are rows of the
// relations table. Nothing is drawn that is not in the loaded data. See DASHBOARD.md section 2.

const PILLAR_LABELS = {
  prevention: 'Prevention',
  detection: 'Detection',
  suppression: 'Suppression',
  unreviewed: 'Not reviewed yet',
}

const TIER_LABELS = { 1: 'Tier 1 · direct', 2: 'Tier 2 · supporting', null: 'Tier not set' }

const RELATION_LABELS = {
  same_hardware: 'Same hardware',
  same_fuel: 'Same fuel',
  related_in_psi: 'Related in PSI',
  reuses_flight_data: 'Reuses flight data',
}

const VIEW_OPTIONS = [
  { id: 'graph', label: 'Graph' },
  { id: 'table', label: 'Table' },
]

const W = 1400
const H = 900
const K_MIN = 0.6
const K_MAX = 4
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
// On a phone the whole graph would be too small to read, so it opens zoomed in; Reset view returns here.
const home = () => {
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
  const k = narrow ? 2.1 : 1
  return { k, x: (W / 2) * (1 - k), y: (H / 2) * (1 - k) }
}
const fmt = (n) => n.toLocaleString('en-US')
const pillarColor = (pillar) => (pillar === 'unreviewed' ? 'var(--text-faint)' : `var(--pillar-${pillar})`)
const tierKey = (tier) => (tier === 1 || tier === 2 ? String(tier) : 'none')

// A short sample line for the legend and the relation filters.
function LineSample({ type }) {
  return (
    <svg className="mp-sample" viewBox="0 0 44 10" width="44" height="10" aria-hidden="true">
      <line className={`mp-edge mp-edge-${type}`} x1="2" y1="5" x2={type === 'reuses_flight_data' ? 36 : 42} y2="5" />
      {type === 'reuses_flight_data' && <path className="mp-arrow" d="M42 5 L35 1.5 L35 8.5 Z" />}
    </svg>
  )
}

function curvePath(a, b, ra, rb, lane, lanes, arrow) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.max(Math.hypot(dx, dy), 0.01)
  const ux = dx / d
  const uy = dy / d
  const offset = (lane - (lanes - 1) / 2) * 34
  const cx = (a.x + b.x) / 2 - uy * offset
  const cy = (a.y + b.y) / 2 + ux * offset
  // End points sit on the circle edges, leaving room for the arrow head.
  const toward = (p, r, q) => {
    const vx = q.x - p.x
    const vy = q.y - p.y
    const m = Math.max(Math.hypot(vx, vy), 0.01)
    return { x: p.x + (vx / m) * r, y: p.y + (vy / m) * r }
  }
  const p1 = toward(a, ra + 2, { x: cx, y: cy })
  const p2 = toward(b, rb + (arrow ? 7 : 2), { x: cx, y: cy })
  return `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
}

function Skeleton() {
  return (
    <div className="mp-state" role="status">
      <span className="visually-hidden">Loading investigation relationships…</span>
      <div className="ev-skeleton" aria-hidden="true">
        <div className="sk-block" />
        <div className="sk-block sk-short" />
      </div>
    </div>
  )
}

export default function MapView({ evidence, view, resetSignal = 0, focus = null }) {
  const professional = view === 'cientifico'
  const { status, data, error, refresh, refreshing, refreshedAt } = evidence

  const [display, setDisplay] = useState('graph')
  const [types, setTypes] = useState(() => new Set(RELATION_TYPES))
  const [pillar, setPillar] = useState('all')
  const [tier, setTier] = useState('all')
  const [selected, setSelected] = useState(null)
  const [hover, setHover] = useState(null)
  const [transform, setTransform] = useState(home)
  const [checkedAt, setCheckedAt] = useState(null)
  const [pxScale, setPxScale] = useState(0.6) // screen pixels per graph unit, so labels keep a readable size
  const svgRef = useRef(null)
  const detailsHeading = useRef(null)
  const drag = useRef(null)

  const graph = useMemo(() => (data?.graph ? buildGraph(data.graph) : null), [data])
  const layout = useMemo(() => (graph ? layoutGraph(graph.nodes, graph.edges, { width: W, height: H }) : null), [graph])
  const byId = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return undefined
    const measure = () => setPxScale(Math.max(el.clientWidth / W, 0.05))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [display, graph])

  useEffect(() => {
    if (resetSignal) setTransform(home())
  }, [resetSignal])

  // Another part of the dashboard can ask the map to open one investigation (focus = { id, n }).
  useEffect(() => {
    if (focus && graph && byId.has(focus.id)) setSelected(focus.id)
  }, [focus, graph, byId])

  // A refresh that drops the selected investigation closes its details.
  useEffect(() => {
    if (selected && graph && !byId.has(selected)) setSelected(null)
  }, [selected, graph, byId])

  const matches = useCallback(
    (node) => (pillar === 'all' || node.pillar === pillar) && (tier === 'all' || tierKey(node.tier) === tier),
    [pillar, tier],
  )
  const shownNodes = useMemo(() => (graph ? graph.nodes.filter(matches) : []), [graph, matches])
  const shownIds = useMemo(() => new Set(shownNodes.map((n) => n.id)), [shownNodes])
  const shownEdges = useMemo(
    () => (graph ? graph.edges.filter((e) => types.has(e.type) && shownIds.has(e.from) && shownIds.has(e.to)) : []),
    [graph, types, shownIds],
  )

  const neighbors = useMemo(() => {
    const list = []
    if (!graph || !selected) return list
    for (const e of graph.edges) {
      if (e.from === selected) list.push({ edge: e, other: byId.get(e.to), direction: 'to' })
      else if (e.to === selected) list.push({ edge: e, other: byId.get(e.from), direction: 'from' })
    }
    return list
  }, [graph, selected, byId])

  const select = (id) => {
    setSelected(id)
    // Keyboard and screen reader users land on the details, which open beside or below the graph.
    requestAnimationFrame(() => detailsHeading.current?.focus())
  }

  const closeDetails = () => {
    const id = selected
    setSelected(null)
    requestAnimationFrame(() => document.getElementById(`mp-node-${id}`)?.focus())
  }

  // ---- zoom and pan
  const zoomBy = (factor) =>
    setTransform((t) => {
      const k = clamp(t.k * factor, K_MIN, K_MAX)
      const ratio = k / t.k
      return { k, x: W / 2 - (W / 2 - t.x) * ratio, y: H / 2 - (H / 2 - t.y) * ratio }
    })
  const panBy = (dx, dy) => setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  const resetView = () => setTransform(home())

  const onPointerDown = (event) => {
    if (event.target.closest('.mp-node, .mp-hit')) return
    drag.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event) => {
    if (!drag.current) return
    const scale = svgRef.current?.getScreenCTM()?.a || 1
    panBy((event.clientX - drag.current.x) / scale, (event.clientY - drag.current.y) / scale)
    drag.current = { x: event.clientX, y: event.clientY }
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const onWheel = (event) => {
    // Plain wheel scrolls the page; Ctrl or Cmd plus wheel zooms.
    if (!(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15)
  }
  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget) return
    const keys = {
      ArrowLeft: () => panBy(60, 0),
      ArrowRight: () => panBy(-60, 0),
      ArrowUp: () => panBy(0, 60),
      ArrowDown: () => panBy(0, -60),
      '+': () => zoomBy(1.25),
      '=': () => zoomBy(1.25),
      '-': () => zoomBy(0.8),
      0: resetView,
      Home: resetView,
      Escape: () => setSelected(null),
    }
    const action = keys[event.key]
    if (action) {
      event.preventDefault()
      action()
    }
  }

  const toggleType = (type) =>
    setTypes((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })

  // ---- states without a graph
  if (status === 'loading') return <Skeleton />

  if (status === 'unavailable') {
    return (
      <div className="mp-state" role="alert">
        <p>
          <strong>The investigation map needs the database.</strong> This build is not connected to Supabase, so there are no
          investigations or relations to draw. Nothing is taken from sample files.
        </p>
        <p className="muted">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>dashboard/.env.local</code>, then
          restart the dev server.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-compact"
          onClick={() => {
            refresh()
            setCheckedAt(new Date())
          }}
        >
          Retry
        </button>
        {checkedAt && <p className="muted">Checked again at {checkedAt.toLocaleTimeString()}: still not connected.</p>}
      </div>
    )
  }

  if (status === 'error' || !graph) {
    return (
      <div className="mp-state" role="alert">
        <p>
          <strong>The map data could not be loaded.</strong> {error ?? 'The database returned no data.'}
        </p>
        <button type="button" className="btn btn-secondary btn-compact" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Trying again…' : 'Retry'}
        </button>
      </div>
    )
  }

  if (!graph.nodes.length) {
    return (
      <div className="mp-state" role="status">
        <p>
          <strong>No investigations were returned.</strong> The database answered, but its investigations table is empty.
        </p>
        <button type="button" className="btn btn-secondary btn-compact" onClick={refresh} disabled={refreshing}>
          Retry
        </button>
      </div>
    )
  }

  const node = selected ? byId.get(selected) : null
  const load = data.load

  return (
    <div className="mp">
      {error && (
        <p className="ev-banner" role="alert">
          The last refresh failed ({error}). Showing data from {refreshedAt?.toLocaleString()}.
        </p>
      )}
      {!load.complete && (
        <p className="ev-banner" role="status">
          <b>Partial data.</b> Loaded {fmt(load.investigationRows)} of {fmt(load.investigationExpected ?? 0)} investigations and{' '}
          {fmt(load.relationRows)} of {fmt(load.relationExpected ?? 0)} relations, so the map may be missing items.
        </p>
      )}
      {graph.dropped > 0 && (
        <p className="ev-banner" role="status">
          {fmt(graph.dropped)} relation rows were left out because one end is not a loaded investigation or the type is unknown.
        </p>
      )}

      <div className="mp-toolbar">
        <Segmented label="Map display" options={VIEW_OPTIONS} value={display} onChange={setDisplay} />

        <label className="mp-field">
          <span>Pillar</span>
          <select value={pillar} onChange={(e) => setPillar(e.target.value)}>
            <option value="all">All pillars</option>
            {PILLARS.map((p) => (
              <option key={p} value={p}>
                {PILLAR_LABELS[p]}
              </option>
            ))}
            <option value="unreviewed">{PILLAR_LABELS.unreviewed}</option>
          </select>
        </label>

        <label className="mp-field">
          <span>Tier</span>
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="all">All tiers</option>
            <option value="1">Tier 1 · direct</option>
            <option value="2">Tier 2 · supporting</option>
            <option value="none">Tier not set</option>
          </select>
        </label>

        <fieldset className="mp-types">
          <legend>Relations</legend>
          {RELATION_TYPES.map((type) => (
            <label key={type} className="mp-check">
              <input type="checkbox" checked={types.has(type)} onChange={() => toggleType(type)} />
              <LineSample type={type} />
              <span>{RELATION_LABELS[type]}</span>
            </label>
          ))}
        </fieldset>

        {display === 'graph' && (
          <div className="mp-zoom" role="group" aria-label="Zoom and pan">
            <button type="button" className="hv-btn hv-icon" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
              +
            </button>
            <button type="button" className="hv-btn hv-icon" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>
              −
            </button>
            <button type="button" className="hv-btn" onClick={resetView}>
              Reset view
            </button>
          </div>
        )}
      </div>

      <p className="mp-count" role="status">
        Showing {fmt(shownNodes.length)} of {fmt(graph.nodes.length)} investigations and {fmt(shownEdges.length)} of{' '}
        {fmt(graph.edges.length)} relations.
      </p>

      <div className="mp-body">
        <div className="mp-main">
          {display === 'graph' ? (
            <div
              className="mp-graph"
              tabIndex={0}
              role="group"
              aria-label="Investigation relationship graph. Arrow keys pan, plus and minus zoom, zero resets. Press Tab to reach each investigation."
              onKeyDown={onKeyDown}
            >
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="mp-svg"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
              >
                <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
                  {graph.edges
                    .filter((e) => types.has(e.type))
                    .map((e) => {
                      const a = layout.positions[e.from]
                      const b = layout.positions[e.to]
                      const arrow = e.type === 'reuses_flight_data'
                      const d = curvePath(a, b, layout.radii[e.from], layout.radii[e.to], e.lane, e.lanes, arrow)
                      const active = shownIds.has(e.from) && shownIds.has(e.to)
                      const touches = selected && (e.from === selected || e.to === selected)
                      return (
                        <g key={e.id}>
                          <path
                            d={d}
                            className={`mp-edge mp-edge-${e.type}`}
                            data-dim={!active || undefined}
                            data-strong={touches || undefined}
                            markerEnd={arrow ? 'url(#mp-arrow-head)' : undefined}
                          />
                          <path
                            d={d}
                            className="mp-hit"
                            onPointerEnter={() => setHover({ kind: 'edge', id: e.id })}
                            onPointerLeave={() => setHover(null)}
                          />
                        </g>
                      )
                    })}

                  {graph.nodes.map((n) => {
                    const p = layout.positions[n.id]
                    const r = layout.radii[n.id]
                    const hollow = isHollow(n)
                    const dim = !shownIds.has(n.id)
                    const ring = n.tier === 1 ? 4 : 1.5
                    return (
                      <g
                        key={n.id}
                        id={`mp-node-${n.id}`}
                        className="mp-node"
                        data-dim={dim || undefined}
                        data-selected={selected === n.id || undefined}
                        transform={`translate(${p.x} ${p.y})`}
                        tabIndex={0}
                        role="button"
                        aria-pressed={selected === n.id}
                        aria-label={`${n.label}. ${PILLAR_LABELS[n.pillar]}. ${TIER_LABELS[n.tier]}. ${
                          n.tests ? `${fmt(n.tests)} tests` : hollow ? 'Ground study, no tests of its own' : 'No test rows'
                        }.${dim ? ' Hidden by the filters.' : ''} Press Enter for details.`}
                        onClick={() => select(n.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            select(n.id)
                          }
                        }}
                        onPointerEnter={() => setHover({ kind: 'node', id: n.id })}
                        onPointerLeave={() => setHover(null)}
                        onFocus={() => setHover({ kind: 'node', id: n.id })}
                        onBlur={() => setHover(null)}
                      >
                        <circle className="mp-halo" r={r + 7} />
                        <circle
                          className="mp-disc"
                          r={r}
                          fill={hollow ? 'none' : pillarColor(n.pillar)}
                          stroke={hollow ? pillarColor(n.pillar) : 'var(--text)'}
                          strokeWidth={ring}
                          strokeDasharray={n.tier === null ? '3 3' : undefined}
                        />
                        <text className="mp-label" y={r + 15 / (pxScale * transform.k)} textAnchor="middle" style={{ fontSize: 12 / (pxScale * transform.k), strokeWidth: 3 / (pxScale * transform.k) }}>
                          {n.short}
                        </text>
                      </g>
                    )
                  })}
                </g>
                <defs>
                  <marker id="mp-arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path className="mp-arrow" d="M0 0 L10 5 L0 10 Z" />
                  </marker>
                </defs>
              </svg>

              {hover && (
                <div className="mp-tip" aria-hidden="true">
                  {hover.kind === 'node' ? (
                    (() => {
                      const n = byId.get(hover.id)
                      return n ? (
                        <>
                          <b>{n.label}</b>
                          <span>
                            {PILLAR_LABELS[n.pillar]} · {TIER_LABELS[n.tier]} · {n.tests ? `${fmt(n.tests)} tests` : 'no test rows'}
                          </span>
                        </>
                      ) : null
                    })()
                  ) : (
                    (() => {
                      const e = graph.edges.find((x) => x.id === hover.id)
                      return e ? (
                        <>
                          <b>{RELATION_LABELS[e.type]}</b>
                          <span>
                            {byId.get(e.from)?.label} → {byId.get(e.to)?.label}
                          </span>
                          <span>Source: {e.source ?? 'not stated'}</span>
                        </>
                      ) : null
                    })()
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mp-tables">
              <div className="ev-table-wrap">
                <table>
                  <caption>Investigations ({fmt(shownNodes.length)} shown)</caption>
                  <thead>
                    <tr>
                      <th scope="col">Investigation</th>
                      <th scope="col">Type</th>
                      <th scope="col">Pillar</th>
                      <th scope="col">Tier</th>
                      <th scope="col">Tests</th>
                      <th scope="col">Relations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownNodes.map((n) => (
                      <tr key={n.id} data-selected={selected === n.id || undefined}>
                        <th scope="row">
                          <button type="button" className="mp-link" aria-pressed={selected === n.id} onClick={() => select(n.id)}>
                            {n.label}
                          </button>
                        </th>
                        <td>{n.type ?? '—'}</td>
                        <td>{PILLAR_LABELS[n.pillar]}</td>
                        <td>{n.tier ?? 'Not set'}</td>
                        <td>{isHollow(n) ? 'Ground study, none of its own' : fmt(n.tests)}</td>
                        <td>{fmt(shownEdges.filter((e) => e.from === n.id || e.to === n.id).length)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ev-table-wrap">
                <table>
                  <caption>Relations ({fmt(shownEdges.length)} shown)</caption>
                  <thead>
                    <tr>
                      <th scope="col">From</th>
                      <th scope="col">To</th>
                      <th scope="col">Type</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownEdges.map((e) => (
                      <tr key={e.id}>
                        <th scope="row">{byId.get(e.from)?.label}</th>
                        <td>{byId.get(e.to)?.label}</td>
                        <td>{RELATION_LABELS[e.type]}</td>
                        <td>{e.source ?? 'Not stated'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <section className="mp-legend" aria-label="Legend">
            <div>
              <h3>Pillar (color)</h3>
              <ul>
                {[...PILLARS, 'unreviewed'].map((p) => (
                  <li key={p}>
                    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                      <circle cx="7" cy="7" r="6" fill={pillarColor(p)} stroke="var(--text)" strokeWidth="1" />
                    </svg>
                    {PILLAR_LABELS[p]}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Tier (ring)</h3>
              <ul>
                <li>
                  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                    <circle cx="7" cy="7" r="5" fill="var(--surface-2)" stroke="var(--text)" strokeWidth="3.5" />
                  </svg>
                  Thick ring: Tier 1
                </li>
                <li>
                  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                    <circle cx="7" cy="7" r="6" fill="var(--surface-2)" stroke="var(--text)" strokeWidth="1.2" />
                  </svg>
                  Thin ring: Tier 2
                </li>
                <li>
                  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                    <circle cx="7" cy="7" r="6" fill="var(--surface-2)" stroke="var(--text)" strokeWidth="1.2" strokeDasharray="2 2" />
                  </svg>
                  Dashed ring: tier not set
                </li>
              </ul>
            </div>
            <div>
              <h3>Size</h3>
              <ul>
                <li>Circle area follows the number of tests</li>
                <li>
                  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                    <circle cx="7" cy="7" r="5" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" />
                  </svg>
                  Small hollow circle: ground study with no test rows of its own
                </li>
              </ul>
            </div>
            <div>
              <h3>Relations (line)</h3>
              <ul>
                {RELATION_TYPES.map((type) => (
                  <li key={type}>
                    <LineSample type={type} />
                    {RELATION_LABELS[type]}
                    {type === 'reuses_flight_data' && ' (ground study → flight)'}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {node && (
          <aside className="mp-details" aria-labelledby="mp-details-title">
            <header>
              <h3 id="mp-details-title" ref={detailsHeading} tabIndex={-1}>
                {node.label}
              </h3>
              <button type="button" className="btn btn-ghost btn-compact" onClick={closeDetails}>
                Close
              </button>
            </header>
            {node.title && node.title !== node.label && <p className="mp-title">{node.title}</p>}

            <dl className="mp-facts">
              <div>
                <dt>Type</dt>
                <dd>{node.type === 'ground' ? 'Ground study' : node.type === 'flight' ? 'Flight investigation' : 'Not stated'}</dd>
              </div>
              <div>
                <dt>Pillar</dt>
                <dd>{PILLAR_LABELS[node.pillar]}</dd>
              </div>
              <div>
                <dt>Tier</dt>
                <dd>
                  {professional
                    ? `${TIER_LABELS[node.tier]}${node.tierReason ? `. ${node.tierReason}` : ''}`
                    : node.tier === 1
                      ? 'Directly about fire safety'
                      : node.tier === 2
                        ? 'Supporting science'
                        : 'Not set'}
                </dd>
              </div>
              <div>
                <dt>Test coverage</dt>
                <dd>
                  {node.tests
                    ? `${fmt(node.tests)} tests in the database`
                    : node.type === 'ground'
                      ? 'Ground study: analysis of flight data. It has no test rows of its own, which is not zero tests.'
                      : 'No test rows are in the database for this investigation.'}
                </dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{node.platform ?? 'Not stated'}</dd>
              </div>
              {professional && (
                <div>
                  <dt>Hardware</dt>
                  <dd>{node.hardware ?? 'Not stated'}</dd>
                </div>
              )}
              <div>
                <dt>DOI</dt>
                <dd>
                  {node.doi ? (
                    <a href={`https://doi.org/${node.doi}`} target="_blank" rel="noopener noreferrer">
                      {node.doi}
                    </a>
                  ) : (
                    'Not stated'
                  )}
                </dd>
              </div>
            </dl>

            <div>
              <h4>Summary</h4>
              {(professional ? node.summaryProfessional : node.summaryStudent) ? (
                <p>{professional ? node.summaryProfessional : node.summaryStudent}</p>
              ) : (
                <p className="muted">Not summarized yet. The Investigator's review has not been published for this investigation.</p>
              )}
            </div>

            <div>
              <h4>Related investigations ({neighbors.length})</h4>
              {neighbors.length ? (
                <ul className="mp-related">
                  {neighbors.map(({ edge, other, direction }) => (
                    <li key={edge.id}>
                      <button type="button" className="mp-link" title={other.title || other.label} onClick={() => select(other.id)}>
                        {other.short}
                      </button>{' '}
                      <span className="muted">
                        {RELATION_LABELS[edge.type]}
                        {edge.type === 'reuses_flight_data' ? (direction === 'to' ? ' (this reuses its flight data)' : ' (reuses this flight data)') : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No relations are recorded for this investigation.</p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
