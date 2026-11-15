import { lazy, Suspense, useState } from 'react'
import { Brand, Segmented, ThemeToggle } from '../components/ui.jsx'
import Investigaciones from '../secciones/Investigaciones.jsx'
import Ranking from '../secciones/Ranking.jsx'
import Hallazgos from '../secciones/Hallazgos.jsx'
import Grafo from '../secciones/Grafo.jsx'
import ChatPanel from '../chat/ChatPanel.jsx'

const StationViewer = lazy(() => import('../components/StationViewer.jsx'))

// The existing sections expect these values (see _config/audiences.md).
const VIEWS = [
  { id: 'estudiante', label: 'Student' },
  { id: 'cientifico', label: 'Professional' },
]

const MODELS = [
  { id: 'solid', label: 'Solid' },
  { id: 'hologram', label: 'Hologram' },
]

function Panel({ title, tag, children }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
        {tag && <span className="tag">{tag}</span>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}

/**
 * Phase 1 preview shell: the frame the dashboard will live in. It shows no
 * telemetry, results or scores of its own. `mode` is 'demo' or 'account'.
 */
export default function DemoShell({ mode, initialView, session, theme, onToggleTheme, onLeave }) {
  const [view, setView] = useState(initialView === 'professional' ? 'cientifico' : 'estudiante')
  const [model, setModel] = useState('solid')
  const isDemo = mode === 'demo'

  return (
    <div className="shell">
      <header className="shell-bar">
        <Brand />
        <span className="tag tag-accent">{isDemo ? 'Demo preview' : session?.local ? 'Demo account' : 'Signed in'}</span>
        <div className="shell-bar-end">
          <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" className="btn btn-secondary btn-compact" onClick={onLeave}>
            {isDemo ? 'Exit demo' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="shell-grid" id="main">
        <h1 className="visually-hidden">Dashboard preview</h1>

        <section className="shell-stage" aria-label="Station model">
          <div className="stage-backdrop" aria-hidden="true" />
          <div className="stage-model">
            <Suspense fallback={null}>
              <StationViewer key={model} variant={model} interactive label="Conceptual 3D model of a space station" />
            </Suspense>
          </div>
          <div className="stage-frame" aria-hidden="true" />
          <div className="shell-stage-top">
            <span className="eyebrow">Station · conceptual model</span>
            <Segmented label="Model style" options={MODELS} value={model} onChange={setModel} />
          </div>
          <p className="stage-note shell-stage-note">
            Conceptual model, not a real spacecraft. No telemetry is shown. Drag to rotate.
          </p>
        </section>

        <div className="shell-side shell-side-left">
          <Panel title="Session" tag={isDemo ? 'Read-only' : null}>
            <p>
              {isDemo
                ? 'You are exploring without an account. Nothing you do here is saved.'
                : `Signed in as ${session?.email ?? 'your account'}${session?.local ? ' (local demo account).' : '.'}`}
            </p>
            <p className="muted">
              Student and Professional change how results are worded. They do not change what you can access.
            </p>
          </Panel>
          <Panel title="Environments" tag="Not built yet">
            <p className="muted">
              Ranking investigations by crewed environment arrives in a later phase. Nothing is ranked or scored here.
            </p>
          </Panel>
        </div>

        <aside className="shell-side shell-side-right" aria-label="Research assistant">
          <Panel title="Research assistant" tag="Local model">
            <ChatPanel view={view} />
          </Panel>
        </aside>

        <details className="panel legacy">
          <summary>
            Current data sections <span className="tag">Earlier prototype · Spanish · sample data</span>
          </summary>
          <div className="legacy-sections">
            <Investigaciones vista={view} />
            <Ranking vista={view} />
            <Hallazgos vista={view} />
            <Grafo vista={view} />
          </div>
        </details>
      </main>
    </div>
  )
}
