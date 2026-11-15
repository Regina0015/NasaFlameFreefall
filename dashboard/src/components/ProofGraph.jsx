// The proof graph of ONE finding: where its result came from (finding -> method -> investigations ...).
// This is not the investigation map. It draws only the nodes and edges stored in the finding.

const ROW_ORDER = ['finding', 'method', 'table', 'investigation', 'hardware', 'publication']
const TYPE_LABELS = { finding: 'Finding', method: 'Method', table: 'Table', investigation: 'Investigation', hardware: 'Hardware', publication: 'Publication' }
const EDGE_LABELS = {
  computed_with: 'Computed with',
  uses_data_from: 'Uses data from',
  related_in_psi: 'Related in PSI',
  same_hardware: 'Same hardware',
  same_fuel: 'Same fuel',
  reuses_flight_data: 'Reuses flight data',
}
const NODE_W = 150
const NODE_H = 36
const GAP_X = 14
const GAP_Y = 54
const PER_ROW = 4

const clip = (text, max = 22) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

function layout(graph) {
  const rows = []
  for (const type of ROW_ORDER) {
    const nodes = graph.nodes.filter((n) => n.type === type)
    for (let i = 0; i < nodes.length; i += PER_ROW) rows.push(nodes.slice(i, i + PER_ROW))
  }
  const width = PER_ROW * NODE_W + (PER_ROW - 1) * GAP_X
  const positions = {}
  rows.forEach((row, r) => {
    const rowWidth = row.length * NODE_W + (row.length - 1) * GAP_X
    row.forEach((n, c) => {
      positions[n.id] = { x: (width - rowWidth) / 2 + c * (NODE_W + GAP_X) + NODE_W / 2, y: 12 + r * (NODE_H + GAP_Y) + NODE_H / 2 }
    })
  })
  return { positions, width, height: rows.length * (NODE_H + GAP_Y) }
}

export default function ProofGraph({ graph, labelFor }) {
  const { positions, width, height } = layout(graph)
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const shown = graph.edges.filter((e) => positions[e.from] && positions[e.to])

  return (
    <figure className="fd-proof">
      <figcaption>Proof graph: where this result came from</figcaption>
      <svg viewBox={`0 0 ${width} ${height + 12}`} className="fd-proof-svg" role="img" aria-label="Proof graph. The same connections are listed in the table below.">
        <defs>
          <marker id="proof-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path className="mp-arrow" d="M0 0 L10 5 L0 10 Z" />
          </marker>
        </defs>
        {shown.map((e, i) => {
          const a = positions[e.from]
          const b = positions[e.to]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.max(Math.hypot(dx, dy), 1)
          const sx = a.x + (dx / d) * 4
          const sy = a.y + (dy / d) * (NODE_H / 2)
          const ex = b.x - (dx / d) * 4
          const ey = b.y - (dy / d) * (NODE_H / 2 + 4)
          const type = e.type === 'computed_with' || e.type === 'uses_data_from' ? 'same_hardware' : e.type
          return (
            <line
              key={`${e.from}-${e.to}-${i}`}
              className={`mp-edge mp-edge-${type}`}
              x1={sx}
              y1={sy}
              x2={ex}
              y2={ey}
              markerEnd="url(#proof-arrow)"
            />
          )
        })}
        {graph.nodes.map((n) => {
          const p = positions[n.id]
          if (!p) return null
          return (
            <g key={n.id} className="fd-node" data-type={n.type} transform={`translate(${p.x - NODE_W / 2} ${p.y - NODE_H / 2})`}>
              <title>{`${TYPE_LABELS[n.type] ?? n.type}: ${n.label ?? n.id}`}</title>
              <rect width={NODE_W} height={NODE_H} rx="6" />
              <text x={NODE_W / 2} y={NODE_H / 2 + 4} textAnchor="middle">
                {clip(n.type === 'investigation' ? labelFor(n.id) : (n.label ?? n.id))}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="ev-table-wrap">
        <table>
          <caption>Connections in the proof graph</caption>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">Relation</th>
              <th scope="col">To</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {graph.edges.map((e, i) => (
              <tr key={i}>
                <th scope="row">{clip(byId.get(e.from)?.label ?? e.from, 40)}</th>
                <td>{EDGE_LABELS[e.type] ?? e.type}</td>
                <td>{clip(byId.get(e.to)?.label ?? e.to, 40)}</td>
                <td>{e.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
