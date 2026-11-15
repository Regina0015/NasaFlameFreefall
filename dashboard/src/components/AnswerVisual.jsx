import { memo } from 'react'
import { fmtRange, tableFor } from '../lib/answerModel.js'

// Draws one block of the shared answer model: bars for category counts, range bars for tested oxygen, and the
// phase coverage bars. Every number is printed as text next to its bar, and the same values are available as a
// table. These visuals come from structured tool output, so they are always labeled ungraded; they are not
// audited finding charts. A single value or a no-data answer has no visual (hasVisual is false).

export const hasVisual = (block) => ['categories', 'comparison', 'range', 'coverage'].includes(block.type)

function DataTable({ block, open }) {
  const table = tableFor(block)
  if (!table) return null
  return (
    <details className="av-table" open={open || undefined}>
      <summary>{open ? 'Data table' : 'View as a table'}</summary>
      <div className="av-table-scroll" tabIndex={0} role="region" aria-label="Data table, scrollable">
        <table>
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} data-nodata={cell === 'No data' || undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function Bars({ rows, unit }) {
  const max = Math.max(...rows.map((r) => r.n), 1)
  return (
    <ul className="av-rows">
      {rows.map((r) => (
        <li key={r.label} className="av-row">
          <span className="av-label">{r.label}</span>
          <span className="av-track" aria-hidden="true">
            <span className="av-fill" style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <span className="av-value">
            {r.n} {unit}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Ranges({ rows }) {
  const top = Math.max(...rows.map((r) => r.o2?.max ?? 0), 10)
  const axisMax = Math.min(100, Math.ceil(top / 10) * 10)
  return (
    <div className="av-ranges">
      <ul className="av-rows">
        {rows.map((r) => (
          <li key={r.label} className="av-row">
            <span className="av-label">{r.label}</span>
            <span className="av-track" aria-hidden="true" data-nodata={!r.o2 || undefined}>
              {r.o2 && (
                <span
                  className="av-span"
                  style={{ left: `${(r.o2.min / axisMax) * 100}%`, width: `max(${((r.o2.max - r.o2.min) / axisMax) * 100}%, 0.4rem)` }}
                />
              )}
            </span>
            <span className="av-value">{r.o2 ? `${fmtRange(r.o2, '% O2')}` : 'No data'}</span>
          </li>
        ))}
      </ul>
      <div className="av-axis" aria-hidden="true">
        <span>0</span>
        <span>{axisMax / 2}</span>
        <span>{axisMax}% O2</span>
      </div>
    </div>
  )
}

function Coverage({ rows }) {
  return (
    <ul className="av-rows av-coverage">
      {rows.map((r) => (
        <li key={r.phase} className="av-row">
          <span className="av-label">{r.phase}</span>
          <span className="av-track" aria-hidden="true" data-nodata={r.noData || undefined}>
            {!r.noData && (
              <>
                <span className="av-fill av-fill-soft" style={{ width: `${r.n ? (r.reachO2 / r.n) * 100 : 0}%` }} />
                <span className="av-fill av-fill-strong" style={{ width: `${r.n ? (r.reachBoth / r.n) * 100 : 0}%` }} />
              </>
            )}
          </span>
          <span className="av-value">
            {r.noData ? `No data (${r.n} tests; some record no oxygen)` : `${r.reachBoth} of ${r.n} tests meet both; ${r.reachO2} reach the O2 level`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function AnswerVisual({ block, tableOpen = false, student = false }) {
  if (!hasVisual(block)) return null
  const rows = block.rows
  return (
    <figure className="av">
      <div className="av-head">
        <span className="tag">Ungraded · from assistant tool output</span>
      </div>
      {block.type === 'categories' && <Bars rows={rows} unit="test rows" />}
      {block.type === 'comparison' && <Ranges rows={rows} />}
      {block.type === 'range' && <Ranges rows={[{ label: block.scope, o2: block.o2 }]} />}
      {block.type === 'coverage' && <Coverage rows={rows} />}
      {block.type === 'coverage' && (
        <p className="av-legend">
          <span className="av-key av-fill-soft" /> reach the oxygen level <span className="av-key av-fill-strong" /> also at or below the pressure limit
        </p>
      )}
      <figcaption className="av-caption">
        {student && <strong>How to read this: </strong>}
        {block.caption}
      </figcaption>
      <DataTable block={block} open={tableOpen} />
    </figure>
  )
}

export default memo(AnswerVisual)
