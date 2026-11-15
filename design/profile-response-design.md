# FlameTrace — Profile-Based Research Responses

## Scope and precedence

Redesign how research answers are presented for Student and Professional.

This supersedes previous instructions about top search, corner assistant,
and replacing the previous result with each new question.

NEW INTERACTION:
A compact glass question bar sits at the bottom.
Submitted questions and their answers form a persistent, vertically
scrollable research history above it. New turns append below earlier ones.

Preserve approved login, docking/welcome transition, authentication,
existing scientific integrations, map, and 3D viewers.
Do not stage, commit, push, or deploy.
All product text must be English.

## Read first

Read CLAUDE.md, DASHBOARD.md, design/content-and-response-map.md,
current response/tool contracts, publication policy, and relevant UI code.
Use the installed UI skill.

Inspect:
- dashboard/dashboard-references/student-response-layout.png
- dashboard/dashboard-references/professional-response-layout.png

The content map is a point-in-time inspection. Verify current capabilities.
Do not assume that recommended fields such as answer_type already exist.
Do not read secrets, scan node_modules, or repeat a full repository audit.

## Shared scientific foundation

Both profiles use the SAME permitted evidence and actual audit states.
Profiles change explanation, density, and default disclosure.
They do not grant privileges or hide scientific limitations.

Keep these distinct:
- Audited finding with matching version and exact hash.
- Grade C indication.
- Pending or stale audit.
- Ungraded conversational answer.
- Exploratory lab result.
- Withheld/rejected result.

Never assign a finding's grade to an entire conversational answer.
Preserve publication rules and do not weaken audit/hash checks.
Do not normalize research files as part of this UI task.

Never equate missing data with zero, safety, or fire risk.
Scope absence claims to the available snapshot.
Show units, provenance, limitations, and partial-gravity warnings.
Distinguish burner-stream oxygen from chamber atmosphere.
No invented calculations, scientific recommendations, or live telemetry.

## Bottom glass question bar

Replace the corner launcher and top composer as the primary interaction.
Reuse ONE conversation store and the existing backend.

Appearance:
- Compact centered floating-looking glass surface.
- Comfortable maximum width, not a solid full-width bottom slab.
- Translucent blue-gray background, visible blur, fine border.
- Darker readable input, clear Send button.
- Rounded question suggestions immediately below the input when useful.
- Collapse suggestions after the conversation begins, with a way to reopen.

Layout:
Use a normal-flow bottom region that reserves its actual height.
The message/history region above gets the remaining viewport height.
The glass bar must never overlay scientific content.

Textarea grows to a modest maximum, then scrolls internally.
Support mobile keyboard, safe areas, browser zoom, and short screens.

Behavior:
- Typing does not submit, navigate, or change displayed results.
- Enter sends; Shift+Enter inserts a newline.
- Clicking a suggestion submits once.
- Keep earlier questions/results in order; do not replace them.
- Append a loading turn, then update only that turn.
- Scroll to the new turn on explicit submission.
- Do not pull users away while they read older results.
- Show a New response indicator when appropriate.
- Preserve request IDs to prevent stale responses overwriting newer turns.
- Preserve honest offline/error/retry states.
- Provide Clear conversation with appropriate confirmation.

Keep “See status” available to restore the overview and its filters/scroll.
Provide a way back to the research history without losing it.
Keep each response compact enough to scan, with expandable details.

## Student presentation

Reference: student-response-layout.png.

Take:
- One dominant visual with supporting panels around it.
- Clear sections and strong visual hierarchy.
- Technical precision, simplified into a readable educational layout.

Do not copy its tiny labels, dense decorative widgets, or geographic globe.

Each response:
1. Question in plain language.
2. “Short answer”: approximately 1–3 clear sentences.
3. Audit/ungraded state with a plain-language explanation.
4. “What this means”: explain the result without turning it into advice.
5. One main visual when useful; a second only if it adds understanding.
6. Compact supporting conditions and test counts.
7. Visible warnings and limitations.
8. “Explore the evidence” disclosure for sources and calculations.

Define terms such as O2 concentration, pressure, fuel phase, and microgravity
using a small reusable glossary.

Prefer:
- Horizontal bars for category counts.
- Range bars for tested oxygen ranges.
- Simple comparisons with direct labels.
- Clearly separated “No data” categories.
- Descriptive captions explaining how to read the chart.

Use readable axes, units, legends, and accessible table alternatives.
No decorative donuts, gauges, invented time series, or forced graphs.
A single value or no-data answer may need no chart.

## Professional presentation

Reference: professional-response-layout.png.

Take:
- A substantial central analysis area.
- Compact supporting panels.
- Restrained dark surfaces, precise controls, and efficient information density.

Replace the reference's map with the analysis appropriate to the question.
Do not add cybersecurity labels or fake operational metrics.

Each response:
1. Question and concise technical answer.
2. Explicit source scope, experimental conditions, units, and audit state.
3. Main chart/table with inspectable data.
4. Supporting values and missing-data counts when supplied.
5. Method, function, parameters, formula, and conversions WHEN recorded.
6. Provenance: investigation, source table, columns, rows, DOI.
7. Matching audit checks and failure details.
8. Assumptions, limitations, and source/version information.
9. Existing export/comparison actions only where actually supported.

Allow more detailed graphs, not gratuitously complex graphs:
- Investigation relationship graph for relationships.
- Finding proof graph for provenance.
- Detailed coverage tables for filtered tests.
- Distribution/scatter/range views only with compatible real data.

Do not invent formulas, uncertainty estimates, significance tests,
predictions, correlations, or higher-order calculations.
Complexity must come from available artifacts, not visual decoration.

## Answer-type-driven rendering

Build a shared validated presentation model for:
- Count.
- Range.
- Category list.
- Coverage.
- Supported comparison.
- Existing finding.
- No data.
- Plain-text fallback.

Derive type and values from structured tool outputs and approved artifacts.
Do not extract scientific numbers from generated prose with regex.
If the backend needs an additive structured response field, preserve
compatibility and validate it on the server and client.

Unknown or incomplete output must fall back to a sourced text response,
never a fabricated visualization.

Preserve the same underlying values when switching profiles.
Do not call the model again merely to redraw a chart or expand evidence.
If profile-specific wording is unavailable, use neutral existing text
rather than fabricating a new scientific summary.

## Chart eligibility

Respect existing chart policy and audit C9 requirements for stored findings.
Do not bypass a missing approved chart by redrawing the same finding
under a different label.

Student's visual emphasis does not automatically authorize publishing
new finding charts. Chart-request policy is unresolved:
preserve current eligibility and request behavior until the team decides.

Supported visualizations of structured exploratory tool output must be
explicitly labeled ungraded and must not imply independent audit approval.

Professional also receives a table alternative.
Both profiles can inspect the same evidence on demand.

## Existing components

Inspect and reuse:
- ResearchResults.jsx
- ResearchSearch.jsx
- ChatPanel.jsx and useChat.js
- FindingChart.jsx and chartSpec.js
- ProofGraph.jsx and MapView.jsx
- EvidenceDrawer.jsx and GradeBadge.jsx
- Existing findings eligibility/policy code

Refactor carefully rather than creating competing chat implementations.
Keep large visualizations lazy-loaded, especially within long histories.
Do not remount every chart whenever a person types in the composer.

## Visual rules

Keep the approved near-black background and restrained grid.
Use silver text, blue-gray glass, and selective cyan accents.
Preserve semantic confidence/pillar colors.
Scientific content surfaces must be more opaque than the composer.

At least approximately 16px body text on desktop.
Use whitespace, headings, and progressive disclosure to control density.
No constant motion around graphs or reading areas.
Support dark/light themes, reduced motion, and keyboard interaction.

## Implementation order

1. Bottom composer and persistent turn history using existing requests.
2. Shared structured answer adapter with safe fallback.
3. Student renderer and Professional renderer using existing supported data.
4. Progressive evidence details and eligible visualizations.
5. Accessibility, responsive layout, and regression verification.

Do not add unsupported backend science, alter research data,
or implement emergency effects in this task.

## Acceptance checks

- Two questions leave both answers available in order.
- Growing the input never covers content.
- Profile switching changes presentation without changing values.
- Unsupported charts remain unavailable.
- No data, zero, pending, indication, and ungraded are distinguishable.
- Provenance and warnings remain accessible in both profiles.
- See status and return-to-history preserve state.
- Real disconnected services produce honest states.
- Login, map, and viewers remain intact.

Run the build and relevant existing tests.
Use isolated fixtures for unavailable response types; do not modify research
records or claim fixtures verify real services.
Inspect desktop/mobile in the browser if tooling is available.
No report needed; only flag blockers or unresolved errors.
Do not stage, commit, push, or deploy.