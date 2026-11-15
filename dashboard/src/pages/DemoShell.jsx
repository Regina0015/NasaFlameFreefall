import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Brand, Segmented, ThemeToggle } from '../components/ui.jsx'
import Evidence, { formatTime } from '../components/Evidence.jsx'
import MapView from '../components/MapView.jsx'
import FindingsView from '../components/FindingsView.jsx'
import FindingsSummary from '../components/FindingsSummary.jsx'
import InvestigationBrowser from '../components/InvestigationBrowser.jsx'
import CoverageGaps from '../components/CoverageGaps.jsx'
import EvidenceDrawer from '../components/EvidenceDrawer.jsx'
import InvestigationDetails from '../components/InvestigationDetails.jsx'
import OxygenChart from '../components/OxygenChart.jsx'
import LabView from '../components/LabView.jsx'
import { investigationDetail } from '../lib/investigation.js'
import ResearchSearch from '../components/ResearchSearch.jsx'
import ResearchResults from '../components/ResearchResults.jsx'
import { useFindings } from '../lib/findings/useFindings.js'
import { useChat } from '../chat/useChat.js'
import { useEvidence } from '../lib/evidence.js'
import { ASSET_NOTE } from '../lib/habitat/metadata.js'

const StationViewer = lazy(() => import('../components/StationViewer.jsx'))
const HabitatViewer = lazy(() => import('../components/HabitatViewer.jsx'))

// Internal view ids stay as the adapters and the chat expect them.
const VIEWS = [
  { id: 'estudiante', label: 'Student' },
  { id: 'cientifico', label: 'Professional' },
]

const STAGE_MODES = [
  { id: 'station', label: 'Station' },
  { id: 'map', label: 'Map' },
]

const MODELS = [
  { id: 'iss', label: 'NASA ISS' },
  { id: 'solid', label: 'Concept' },
  { id: 'hologram', label: 'Hologram' },
  { id: 'habitat', label: 'Habitat' },
]

const HABITAT_MODES = [
  { id: 'cutaway', label: 'Cutaway' },
  { id: 'interior', label: 'Interior' },
]

// What exists is a link; what does not is shown as unavailable, never as a dead link.
const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'investigations', label: 'Investigations' },
  { id: 'results', label: 'Research history', needsTurns: true },
  { id: 'findings', label: 'Findings' },
  { id: 'explorer', label: 'Visual explorer' },
  { id: 'lab', label: 'Lab' },
]

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scrollAndFocus(element) {
  if (!element) return
  element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  element.focus({ preventScroll: true })
}

function ConnectionLine({ label, children }) {
  return (
    <div className="ws-conn">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function DemoShell({ mode, initialView, session, theme, entering, onToggleTheme, onLeave }) {
  const [view, setView] = useState(initialView === 'professional' ? 'cientifico' : 'estudiante')
  const [model, setModel] = useState('iss')
  const [habitatMode, setHabitatMode] = useState('cutaway')
  const [stageMode, setStageMode] = useState('station')
  const [workspace, setWorkspace] = useState('overview')
  const [explorerOpened, setExplorerOpened] = useState(false)
  const [mapFocus, setMapFocus] = useState(null)
  const [openFinding, setOpenFinding] = useState(null)
  const [openInvestigation, setOpenInvestigation] = useState(null) // { id, opener }
  const [labOpened, setLabOpened] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)
  const [activeTurn, setActiveTurn] = useState(null) // null = the latest result
  const [browserPreset, setBrowserPreset] = useState(null)
  const [depth, setDepth] = useState(0) // how many steps of in-app navigation can be undone with Back
  const [cameFrom, setCameFrom] = useState(null)

  const evidence = useEvidence()
  const findings = useFindings()
  const chat = useChat(view) // one conversation for every workspace; it ends with the workspace
  const isDemo = mode === 'demo'

  const overviewHeading = useRef(null)
  const bodyRef = useRef(null)
  const savedScroll = useRef(0)
  const explorerHeading = useRef(null)

  const { refresh } = evidence
  const refreshFindings = findings.refresh
  const recheckChat = chat.recheck
  const refreshAll = useCallback(() => {
    refresh()
    refreshFindings()
    recheckChat()
  }, [refresh, refreshFindings, recheckChat])

  // Investigation labels for the evidence drawer come from the loaded investigations, never invented.
  const labelFor = useMemo(() => {
    const map = new Map((evidence.data?.graph.investigations ?? []).map((i) => [i.id, i.label || i.acronym || i.id]))
    return (id) => map.get(id) ?? id
  }, [evidence.data])

  // Investigation details: built from loaded records only. Switching to a related investigation keeps the drawer open.
  const investigationView = useMemo(() => {
    if (!openInvestigation || !evidence.data) return null
    return investigationDetail({
      id: openInvestigation.id,
      investigations: evidence.data.graph.investigations,
      tests: evidence.data.tests,
      relations: evidence.data.graph.relations,
      findingItems: findings.items,
    })
  }, [openInvestigation, evidence.data, findings.items])
  const openDetails = (id, opener) => setOpenInvestigation({ id, opener: opener ?? document.activeElement })
  const closeDetails = useCallback(() => {
    setOpenInvestigation((current) => {
      current?.opener?.focus?.()
      return null
    })
  }, [])

  const drawerItem = openFinding ? findings.items.find((i) => i.id === openFinding.id) : null
  const openEvidence = (id, opener) => setOpenFinding({ id, opener })
  const closeEvidence = useCallback(() => {
    setOpenFinding((current) => {
      current?.opener?.focus()
      return null
    })
  }, [])

  // In-app navigation history. Each change of view is a real browser history entry (same address, so the login route is
  // untouched), which makes Back and Forward, the browser buttons included, walk through the workspace in order. The
  // overview stays mounted while hidden, so its filters are kept, and its scroll position is saved when it is left.
  const apply = useCallback((state) => {
    setWorkspace(state.workspace)
    setActiveTurn(state.turn ?? null)
    if (state.workspace === 'explorer') setExplorerOpened(true)
    if (state.workspace === 'lab') setLabOpened(true)
    if (state.workspace === 'overview') {
      requestAnimationFrame(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = savedScroll.current
      })
    }
  }, [])

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), ws: { workspace: 'overview', turn: null, depth: 0 } }, '')
    const onPop = (event) => {
      const state = event.state?.ws
      if (!state) return // a hash change or an entry that is not ours
      setDepth(state.depth)
      setCameFrom(null)
      apply(state)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [apply])

  const navigate = (next, turn = null) => {
    if (next === workspace && turn === activeTurn) return
    if (workspace === 'overview' && next !== 'overview' && bodyRef.current) savedScroll.current = bodyRef.current.scrollTop
    setCameFrom(workspace)
    const nextDepth = (window.history.state?.ws?.depth ?? 0) + 1
    window.history.pushState({ ...(window.history.state ?? {}), ws: { workspace: next, turn, depth: nextDepth } }, '')
    setDepth(nextDepth)
    apply({ workspace: next, turn })
  }
  const switchWorkspace = (next) => navigate(next, next === 'results' ? activeTurn : null)

  const restoreOverview = () => navigate('overview')

  const goBack = () => window.history.back()

  const go = (id) => {
    if (id === 'overview' && workspace !== 'overview') {
      restoreOverview()
      return
    }
    if (id === 'results') {
      navigate('results', null)
      requestAnimationFrame(() => document.getElementById('rr-title')?.focus())
      return
    }
    const target = id === 'investigations' ? 'overview' : id
    switchWorkspace(target)
    if (id === 'explorer') setExplorerOpened(true)
    if (id === 'lab') setLabOpened(true)
    requestAnimationFrame(() => {
      if (id === 'findings') document.getElementById('fd-heading')?.focus()
      else if (id === 'results') document.getElementById('rr-title')?.focus()
      else if (id === 'investigations') scrollAndFocus(document.getElementById('ib-title'))
      else if (id === 'explorer') scrollAndFocus(explorerHeading.current)
      else if (id === 'lab') document.getElementById('lab-title')?.focus()
      else scrollAndFocus(overviewHeading.current)
    })
  }

  // A question from the research search: show the results view now. Navigation happens here, on the person's
  // action, never when a response arrives, so a late answer cannot move the workspace.
  const submitQuestion = (question) => {
    navigate('results', null)
    chat.ask(question)
    // The explicit submission scrolls to the new turn (the question and its loading state). A later answer never scrolls.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const turns = document.querySelectorAll('.rt')
        turns[turns.length - 1]?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }),
    )
  }

  const showLatestResult = () => go('results')

  // Explicit actions from a result (buttons built from the structured tool calls, never from model text).
  const applyBrowser = (action) => {
    setBrowserPreset({ ...action, n: Date.now() })
    restoreOverview()
    requestAnimationFrame(() => requestAnimationFrame(() => scrollAndFocus(document.getElementById('ib-title'))))
  }

  const openOnMap = (id) => {
    setStageMode('map')
    setMapFocus({ id, n: Date.now() })
    go('explorer')
  }

  // Answers the person is looking at in the results view count as seen, so the launcher shows no badge for them.
  const { markSeen } = chat
  useEffect(() => {
    if (workspace === 'results') markSeen()
  }, [workspace, chat.messages, markSeen])

  const dbLine = (() => {
    if (evidence.status === 'unavailable') return 'Not connected'
    if (evidence.status === 'loading') return 'Loading…'
    if (evidence.status === 'error') return 'Unreachable'
    return evidence.refreshedAt ? `Refreshed ${formatTime(evidence.refreshedAt)}` : 'Connected'
  })()
  const findingsLine =
    findings.status === 'loading' ? 'Loading…' : findings.source ? `${findings.source.label} (${findings.items.length})` : 'No source available'
  const chatStatus = chat.status
  const assistantLine = !chatStatus ? 'Checking…' : chatStatus.available ? 'Available (local only)' : 'Unavailable'

  const explorerActive = workspace === 'explorer'

  return (
    <div className="ws" data-entry={entering}>
      {/* The workspace is inert while the entry transition covers it, so focus cannot wander behind it.
          Its data keeps loading underneath; the cinematic never claims anything has finished. */}
      <div className="ws-shell" inert={entering ? true : undefined}>
        <header className="ws-bar">
          <Brand />

          {(isDemo || session?.local) && <span className="tag tag-accent">{isDemo ? 'Demo preview' : 'Demo account'}</span>}

          <div className="ws-bar-end">
            <div className="ws-source">
              <span className="muted ws-source-text">
                Database · {dbLine.toLowerCase()}
              </span>
              <button type="button" className="btn btn-secondary btn-compact" onClick={refreshAll} disabled={evidence.refreshing} aria-busy={evidence.refreshing}>
                {evidence.refreshing ? 'Refreshing…' : 'Refresh data'}
              </button>
              <details className="ws-sources">
                <summary>Sources</summary>
                <dl className="ws-conns" aria-live="polite">
                  <ConnectionLine label="Database">{dbLine}</ConnectionLine>
                  {evidence.error && evidence.status !== 'error' && <ConnectionLine label="Last refresh">Failed</ConnectionLine>}
                  <ConnectionLine label="Findings">{findingsLine}</ConnectionLine>
                  <ConnectionLine label="Assistant">{assistantLine}</ConnectionLine>
                  {chatStatus?.available && chatStatus.snapshot_updated && (
                    <ConnectionLine label="Assistant data snapshot">{formatTime(new Date(chatStatus.snapshot_updated))}</ConnectionLine>
                  )}
                </dl>
                <p className="muted">The assistant reads a local snapshot; the dashboard reads the database. They are never combined.</p>
              </details>
            </div>
            <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button type="button" className="btn btn-secondary btn-compact" onClick={onLeave}>
              {isDemo ? 'Exit demo' : 'Sign out'}
            </button>
          </div>
        </header>

        <div className="ws-body" ref={bodyRef}>
          <nav className="ws-nav ws-reveal" style={{ '--i': 0 }} aria-label="Workspace">
            <ul className="ws-nav-list">
              {NAV.map((item) => (
                <li key={item.id}>
                  {item.unavailable || (item.needsTurns && chat.turns.length === 0) ? (
                    <button type="button" className="ws-nav-item" disabled>
                      {item.label}
                      <span className="ws-nav-soon">{item.unavailable ? 'Not available yet' : 'Ask a question first'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ws-nav-item"
                      aria-current={workspace === item.id ? 'page' : undefined}
                      onClick={() => go(item.id)}
                    >
                      {item.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <p className="ws-access muted">
              {isDemo
                ? 'You are exploring without an account.'
                : `Signed in as ${session?.email ?? 'your account'}${session?.local ? ' (local demo account)' : ''}.`}{' '}
              Student and Professional change how results are worded. They do not change what you can access.
            </p>
          </nav>

          <main className="ws-main" id="main" tabIndex={-1}>
            <h1 className="visually-hidden">FlameTrace research overview</h1>

            {depth > 0 && workspace !== 'overview' && (
              <div className="ws-backbar">
                <button type="button" className="btn btn-ghost btn-compact" onClick={goBack}>
                  ← Back{cameFrom ? ` to ${NAV.find((n) => n.id === cameFrom)?.label.toLowerCase() ?? 'the previous view'}` : ''}
                </button>
              </div>
            )}

            {workspace === 'results' && (
              <ResearchResults
                chat={chat}
                view={view}
                findings={findings}
                investigations={evidence.data?.graph.investigations ?? []}
                labelFor={labelFor}
                activeId={activeTurn}
                scrollRef={bodyRef}
                onSeeStatus={restoreOverview}
                onOpenEvidence={openEvidence}
                onApplyBrowser={applyBrowser}
                onOpenMap={openOnMap}
              />
            )}

            {workspace === 'findings' && <FindingsView findings={findings} view={view} onOpen={openEvidence} />}

            <div className="ws-overview" hidden={workspace !== 'overview'}>
              <header className="ws-intro ws-reveal" style={{ '--i': 1 }}>
                <h2 id="overview-title" ref={overviewHeading} tabIndex={-1}>
                  Research overview
                </h2>
                <p>
                  What has NASA tested, under which conditions, and what remains unknown? Every number here comes from NASA PSI records and shows its source.
                </p>
              </header>

              <div className="ws-reveal" style={{ '--i': 2 }}>
                <Evidence evidence={evidence} view={view} />
              </div>
              <div className="ws-reveal" style={{ '--i': 3 }}>
                <OxygenChart evidence={evidence} />
              </div>
              <div className="ws-reveal" style={{ '--i': 3 }}>
                <InvestigationBrowser evidence={evidence} view={view} onOpenMap={openOnMap} onOpenDetails={(id) => openDetails(id)} preset={browserPreset} onBackToResults={chat.turns.length ? showLatestResult : null} />
              </div>
              <div className="ws-reveal" style={{ '--i': 4 }}>
                <FindingsSummary findings={findings} onOpen={openEvidence} onGoFindings={() => go('findings')} />
              </div>
              <div className="ws-reveal" style={{ '--i': 5 }}>
                <CoverageGaps evidence={evidence} />
              </div>
            </div>

            {labOpened && (
              <div className="ws-lab" hidden={workspace !== 'lab'}>
                <LabView evidence={evidence} view={view} labelFor={labelFor} />
              </div>
            )}

            {/* The visual explorer mounts the first time it is opened and then stays mounted (paused) so the renderers are not recreated. */}
            {explorerOpened && (
              <div className="ws-explorer" hidden={!explorerActive}>
                <section className="ws-stage" data-model={model} data-stage={stageMode} aria-labelledby="stage-title">
                  <div className="stage-backdrop" aria-hidden="true" />

                  <div className="ws-stage-top">
                    <div>
                      <h2 className="ws-stage-title" id="stage-title" ref={explorerHeading} tabIndex={-1}>
                        {stageMode === 'map' ? 'Investigation map' : 'Visual explorer'}
                      </h2>
                      <p className="eyebrow">
                        {stageMode === 'map' ? 'Relationships between NASA PSI investigations' : 'Contextual illustration · no live data'}
                      </p>
                    </div>

                    <div className="ws-stage-tools ws-glass">
                      <Segmented label="Stage mode" options={STAGE_MODES} value={stageMode} onChange={setStageMode} />
                      {stageMode === 'station' && <Segmented label="Model" options={MODELS} value={model} onChange={setModel} />}
                      {stageMode === 'station' && model === 'habitat' && (
                        <Segmented label="Habitat view" options={HABITAT_MODES} value={habitatMode} onChange={setHabitatMode} />
                      )}
                      <button type="button" className="hv-btn" onClick={() => setResetSignal((n) => n + 1)}>
                        Reset view
                      </button>
                    </div>
                  </div>

                  <div className="ws-stage-view" hidden={stageMode === 'map'}>
                    <div className="stage-model">
                      <Suspense fallback={null}>
                        {model === 'habitat' ? (
                          <HabitatViewer mode={habitatMode} onModeChange={setHabitatMode} resetSignal={resetSignal} active={explorerActive && stageMode === 'station'} />
                        ) : (
                          <StationViewer
                            key={model}
                            variant={model}
                            interactive
                            resetSignal={resetSignal}
                            active={explorerActive && stageMode === 'station'}
                            label={
                              model === 'iss'
                                ? 'Contextual 3D model of the International Space Station'
                                : 'Conceptual 3D model of a space station'
                            }
                          />
                        )}
                      </Suspense>
                    </div>
                  </div>

                  {stageMode === 'map' && (
                    <div className="mp-wrap">
                      <MapView evidence={evidence} view={view} resetSignal={resetSignal} focus={mapFocus} />
                    </div>
                  )}

                  <div className="ws-stage-foot">
                    {stageMode === 'map' ? (
                      <>
                        <p>
                          This is a relationship graph, not a geographic map. Every node is an investigation and every line is a row of the
                          relations table.
                        </p>
                        <p>Nothing is scored or ranked here, and nothing is live.</p>
                      </>
                    ) : (
                      <>
                        <p>
                          {model === 'iss' && 'Station model: NASA / Michael D. Carbajal. '}
                          {(model === 'solid' || model === 'hologram') && 'Concept model, not an accurate station replica. '}
                          {model === 'habitat' && `${ASSET_NOTE} `}
                          These are contextual illustrations: no research data is mapped to any part of them and nothing here is live.
                        </p>
                        <p>Choose Map for the investigation relationship graph.</p>
                      </>
                    )}
                  </div>
                </section>
              </div>
            )}
          </main>

          {drawerItem && <EvidenceDrawer key={drawerItem.id} item={drawerItem} view={view} labelFor={labelFor} onClose={closeEvidence} tests={evidence.data?.tests ?? null} />}

          {investigationView && !drawerItem && (
            <InvestigationDetails
              key={investigationView.record.id}
              detail={investigationView}
              view={view}
              onClose={closeDetails}
              onSelect={(id) => setOpenInvestigation((c) => ({ id, opener: c?.opener }))}
              onOpenMap={(id) => {
                setOpenInvestigation(null)
                openOnMap(id)
              }}
              onOpenEvidence={(id) => {
                setOpenInvestigation(null)
                setOpenFinding({ id, opener: null })
              }}
            />
          )}
        </div>

        {/* The question bar lives in normal flow below the scrolling workspace and reserves its own height. */}
        <div className="ws-dock">
          <ResearchSearch chat={chat} onSubmit={submitQuestion} onShowResult={workspace === 'results' ? undefined : showLatestResult} />
        </div>
      </div>
    </div>
  )
}
