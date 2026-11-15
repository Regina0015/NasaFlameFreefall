# FlameTrace — Dashboard Design and Implementation Brief

## Goal

Build a readable scientific research workspace with a prominent station
visualization, floating glass panels, and a persistent research assistant.

Preserve the approved cinematic login, branding, animation, authentication,
and navigation. Redesign the dashboard without modifying the login.

All product text must be in English.
Do not stage, commit, push, deploy, or alter Git history.
Preserve unrelated and uncommitted work.

## Read first

- CLAUDE.md and applicable repository instructions.
- DASHBOARD.md.
- design/repo-handoff.md, if present.
- Relevant existing dashboard components and data adapters.
- Schemas, current findings, audits, and environment definitions.
- Installed UI/design skill instructions.

The handoff is a point-in-time inspection, not permanent truth.
Verify relevant code before implementation.

If documentation conflicts with current artifacts:
- Do not hardcode the documented example.
- Use the actual version and matching audit.
- Surface missing or stale artifacts honestly.
- Keep unresolved scientific policy configurable.

Do not read secrets or scan node_modules, dist, or the entire dataset.

## Visual references

Images are inside dashboard/dashboard-references/.

Inspect images directly; do not infer their content from filenames.

Primary roles:
- 05-main-layout.png: overall composition and large central visualization.
- 01-floating-panels.png: floating glass surfaces.
- reference2.png and reference3.png: supporting data around a central object.
- reference4.png: hierarchy, thin borders, and technical precision.
- reference5.png: restrained holographic detail.

Other interior, cockpit, floorplan, and cutaway images are style references.
They do not establish available 3D assets or scientific location mappings.

Do not copy screenshot frames, video controls, tiny text, fictional metrics,
or unrelated labels.

## Design principles

Scientific information must be easier to understand because of the design.

- Large central station or investigation map.
- Compact navigation and supporting panels.
- A distinct, tall assistant panel on the right.
- Clear hierarchy, generous spacing, readable labels.
- Main body text around 16px; avoid dense miniature HUD typography.
- Use progressive disclosure for technical detail.
- Never communicate status using color alone.
- Complete dark/light themes and visible keyboard focus.
- Responsive layouts, accessible dialogs, and reduced-motion support.

Use glass selectively:
- Assistant and bottom dock: more translucent with noticeable blur.
- Scientific panels: more opaque for comfortable reading.
- Tables and charts: stable backgrounds with accessible contrast.
- Thin borders, subtle highlights, restrained shadows.
- Provide solid-surface fallbacks when backdrop blur is unsupported.

Suggested dark tokens:
Background #10171F
Surface #18222D
Elevated surface #22303E
Border #354455
Text #EDF2F7
Secondary text #A7B5C5
Accent #65D6E5

Reserve semantic chart/status colors for their documented meanings.
Audit confidence is not fire-risk severity.

## Entry experience

After successful login or Explore demo:
- Briefly display “Welcome aboard, Astronaut.”
- Supporting line: “Explore the latest fire-safety evidence.”
- Use the person's name only if actually available.
- Offer Skip and honor reduced motion.
- Play once on entry, not on every route or refresh.

Reveal dashboard panels with short, staggered opacity/position transitions.
These are nonmodal workspace panels, not repeated blocking pop-ups.

Show real loading skeletons while data loads.
Do not animate invented values or imply live telemetry.

## Workspace layout

### Left navigation

Overview
Investigations
Findings
Lab

Show unfinished capabilities as explicitly unavailable.
Do not create dead navigation links.

Include Refresh data:
- Refetch supported sources.
- Show loading, last successful refresh, source, and errors.
- Preserve conversation, filters, and selected scenario.
- Distinguish local snapshot time from database refresh time.

### Main area

A prominent stage with Station / Map modes.
Compact evidence summaries and investigation details around it.
Avoid a generic grid of oversized cards.

### Research assistant

Reuse dashboard/src/chat/ChatPanel.jsx.

Place in a tall glass panel visually distinct from scientific panels.
Allow collapse and expansion.
On mobile use an accessible drawer or full-width view.

Keep the conversation mounted across workspace tab changes.
Clear user-specific state when signing out or changing accounts.

### Bottom dock

A collapsible glass dock with useful shortcuts:
Overview, Evidence, Reset view, and Lab when implemented.

Keep a visible reopen control.
Do not cover content, keyboard focus, or mobile form controls.

## Data integrity and access

Use existing source adapters and expose provenance.
Never silently combine incompatible snapshot and database totals.

Supabase queries must paginate: responses may be limited to 1,000 rows.
Only present complete totals, or clearly label partial/filtered counts.

Do not hardcode counts from documentation.
Compute descriptive summaries deterministically from loaded records;
do not perform new scientific finding calculations in the browser.

Show missing O2/pressure separately from zero.
Preserve units and documented conversion rules.
Distinguish chamber atmosphere from burner-stream oxygen.
Do not imply that microgravity data directly represents lunar gravity.

Student and Professional change presentation, not access permissions.
Do not imply that login protects public-read data.
Do not bundle private datasets into public JSON fallbacks.

## Student / Professional

Student:
- Plain-language summaries.
- Clear terminology and context.
- Source links and concise audit explanation.
- Warnings and limitations always available.

Professional:
- Detailed conditions and units.
- Values tables, methods, source rows, DOI, and audit checks.
- Data tables beside visualizations.
- Technical explanations through progressive disclosure.

Both see the same underlying evidence and critical warnings.
Preserve existing internal view IDs where adapters require them.

## Scientific sections

### Evidence overview

Show supported totals for investigations, tests, fuel phases,
and missing-data coverage.

Every metric has a source and scope.
Ground studies without their own rows are not equivalent to zero tests.

### Investigations

Filter and inspect real investigation records.
Show available summaries, platform, hardware, DOI, tier, and test coverage.
Missing reviews or summaries remain explicitly unavailable.

### Investigation map

Use actual investigations and relations.
Pillar colors, tier rings, edge styles, and legends follow DASHBOARD.md.
Provide an accessible list/table alternative.
Missing pillar metadata stays unclassified.

Clicking a node opens its investigation details.
This graph is distinct from the proof graph of an individual finding.

### Environment coverage

Only enable sourced atmosphere comparisons currently supported.
The handoff identifies lunar base and pressurized rover as supported.
Other environments need verified sources before numerical comparison.

Show partial-gravity limitations where relevant.
Do not treat the proposed 34% / 8.2 psi option as an approved universal
habitat threshold; verify its experimental meaning and source first.

### Findings and transparent analysis

Inspect the actual finding schema and corresponding audit version.

Display published findings only under an explicit eligibility policy.
Rejected findings must not appear as accepted conclusions.
Pending findings are “Not audited yet”, never assigned a grade.
A stale audit does not verify the current finding.

Grade C with unreviewed checks needs team publication policy.
Until resolved, do not promote it to a verified public conclusion.

Show claim, appropriate summary, source, units, assumptions,
limitations, warnings, and available audit details.

Evidence drawer:
claim → calculation → source rows → DOI → matching audit.

Do not invent a findings table or successful publication.
Legacy sample JSON does not match the current schema:
do not silently treat it as audited real data.

If no eligible source exists, provide an honest empty state.
Connect future findings through a replaceable adapter.

Charts use stored supported specifications and load on request.
Inspect dependencies before adding chart/graph libraries.
No fabricated charts or decorative scientific values.

## Assistant behavior

Preserve existing read-only tools:
query_tests, check_environment, get_findings.

Current assistant responses are ungraded, not audited findings.
Show this clearly alongside provenance and warnings.

The current backend is local-only and depends on the dev server,
Python/uv, the repository snapshot, and Ollama.
Display availability accurately; do not simulate a successful connection
or imply it works on Vercel without backend changes.

Preserve number-check warnings and existing response metadata.

Current tools do not navigate, highlight locations, generate findings,
or launch /ask from the browser.
Do not execute chat text as shell commands.

Future contextual UI actions require a validated adapter with allowed
action types and existing record IDs. Prefer visible action buttons.
Do not rearrange the workspace unpredictably while a person is reading.
Always provide Back to overview.

## Station and interior

Use the existing NASA ISS B asset when available, preserving attribution.
Reuse the existing renderer/viewer and local Draco support where required.

Station visualization is contextual, not a live spacecraft model.
Allow orbit, bounded zoom where supported, reset, and accessible controls.

No data-to-module mapping currently exists.
Do not put red risk markers on arbitrary modules.

Exterior GLBs do not supply an interior.
Interior/VR navigation requires a suitable licensed model or panorama.
For now, show unavailable states rather than fake navigable rooms.

An optional conceptual cutaway or marker belongs only in explicit demo mode,
labeled “Illustrative placement — no live telemetry”.

## Interpretation lab — later phase

The supported concept is a sensitivity/interpretation lab:
change reading choices and compare experimental coverage.

It is not a predictive fire simulator.

Always label results:
“Exploration, ungraded. Not a finding.”

Inspect existing query_tests support for custom oxygen/pressure thresholds
and fuel, phase, and investigation filters.

New controls must have actual normalized data and backend support.
Initial/mean/final pressure selection, inverse-flame filtering,
official-versus-lab recomputation, saving, and user-data ingestion
are not assumed available.

Do not fake reactive results from decorative sliders.
Unavailable controls explain the missing requirement.
Preserve original records and distinguish lab outputs from findings.

## Emergency visual treatment — demo only for now

The current system does not detect live fires or send emergency messages.

A separate labeled demonstration may show:
- Red aura and alert banner.
- “SIMULATED EMERGENCY — Training scenario”.
- Cause and illustrative location.
- Acknowledge and reset controls.

Do not flash the entire page.
Use restrained optional motion and honor reduced motion.
Never claim authorities were notified without a real integration and
confirmed delivery. In demo mode say “No notification sent”.

Keep demonstration state out of scientific counts and exports.

## Implementation phases

Implement ONE phase per request.

Phase 1:
- Preserve login.
- Welcome transition.
- Responsive workspace shell and glass design tokens.
- Existing station viewer.
- Evidence overview using available data.
- Persistent existing assistant with honest connection states.
- Sidebar, refresh, theme, and collapsible bottom dock.

Phase 2:
- Investigation browsing, details, filters, and relation map.
- Supported sourced environment comparisons.

Phase 3:
- Findings source adapter, publication/audit eligibility, evidence drawer,
  supported charts and proof graphs.
- Blocked data integrations remain explicit; do not manufacture records.

Phase 4:
- Interpretation lab after backend and data support are verified.
- Contextual assistant UI actions through a validated integration.

Phase 5:
- Optional interior assets and clearly separated emergency demonstrations.

## Verification and delivery

Inspect actual implementation before changing it.
Reuse existing dependencies and components where practical.
Avoid unrelated refactoring.

Run the production build and existing relevant checks.
With available browser tools, verify desktop/mobile, both themes,
loading/errors, keyboard interaction, assistant availability,
refresh behavior, and preservation of the cinematic login.

Do not claim checks that were not performed.
No written report needed; only flag blockers or unresolved errors.
Do not stage, commit, push, or deploy.