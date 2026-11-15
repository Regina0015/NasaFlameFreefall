# FlameTrace — Research Dashboard V2

## Purpose and precedence

This brief replaces previous dashboard layout directions:
- No permanent assistant sidebar.
- No spacecraft-monitoring or emergency-control framing.
- Research evidence is the main content.
- The approved cinematic login remains unchanged.

Read this together with DASHBOARD.md, design/repo-handoff.md,
current schemas, and relevant implementation.

Verify current artifacts where documentation disagrees.
Do not hardcode scientific examples or counts from this document.

All product text must be English.
Preserve unrelated work.
Do not stage, commit, push, or deploy.

## The project in plain language

NASA has conducted combustion experiments, many aboard the ISS.
Their results are distributed across technical records and tables.

Engineers and researchers need to understand:
- What has been tested?
- Under which conditions?
- What happened?
- What evidence is relevant to a selected habitat?
- What remains untested or undocumented?

FlameTrace organizes this research into understandable, traceable answers.
It supports fire-safety research; it does not monitor spacecraft sensors
or predict a live fire.

Selected habitat scenarios may use increased oxygen and reduced pressure.
Their values must come from sourced project definitions, not assumptions.

## Three scientific roles

### Investigator

Reads investigation records and produces:
- Plain-language and technical summaries.
- Prevention, detection, or suppression classifications.
- Relevant environments where supported.
- Source references for the statements.

Missing information remains explicitly missing.

### Calculator

Receives a research question and chooses a supported computation.
Code performs the arithmetic; the language model explains the result.

Supported examples include:
- Counting tests.
- Finding oxygen ranges.
- Filtering tests by experimental conditions.
- Comparing coverage across fuel phases.
- Converting pressure units using documented rules.

Numerical claims must come from recorded program outputs.
A question with insufficient evidence may legitimately return no data.

### Auditor

Independently checks the calculation against original source tables.
Displays the recorded grade: A, B, C, no data, or rejected.

Independence concerns the checking process and implementation.
Do not claim a separate computer is required unless the current system
actually guarantees that deployment.

Match audit versions to finding versions.
Pending or stale audits must not appear as completed verification.
Rejected findings are not accepted public conclusions.

## What makes FlameTrace different

Every accepted answer has an inspectable evidence chain:

Question → claim → calculation → exact source rows → DOI → audit.

No invented numerical results.
Independent review.
Visible assumptions and limitations.
No data is a useful research outcome, not an error or a safety verdict.

Scope absence claims to the available dataset:
“No matching tests in the current snapshot” is different from
“NASA has never performed this experiment.”

Inspect current local model/backend capabilities.
Do not promise cloud availability or a particular cost model.

## Entry after login

After successful login or Explore demo:

1. Show a full-viewport black transition screen.
2. Type the centered sentence:
   “Welcome back, Astronaut.”
3. Follow with:
   “Explore what has been tested. Discover what remains unknown.”
4. Transition smoothly into the dashboard with a subtle upward exit
   and reveal of the workspace below.

Use “Welcome aboard, Astronaut.” for demo entry if appropriate.
Do not invent a personal name or claim a returning account was detected.

Keep the transition brief, approximately 2–3 seconds total.
Provide Skip and reduced-motion behavior.
Do not repeat on each tab change, refresh, or assistant request.
Do not announce individual typed characters to screen readers.

This screen is a transition, not a fake data-loading sequence.
Actual data loading has its own honest states.

## Main dashboard: research first

The default overview should immediately answer:
“What evidence is available, and what can I explore?”

Suggested structure:

### Header

- FlameTrace logo and identity.
- Student / Professional view switch.
- Theme toggle.
- Source/snapshot information and refresh.
- Account or Exit demo controls.

Avoid “Today's spacecraft status” wording.
Use “Research overview” or “Evidence overview”.

### Main content

- Available investigation and test coverage summaries.
- Investigation browser with fuel, phase, and supported condition filters.
- Eligible findings with recorded audit states.
- Missing-data coverage and documented research gaps.
- Clear actions to inspect evidence.

Use actual supported data sources and complete pagination.
Do not fabricate graphs or fill empty panels with invented metrics.
Do not merge local snapshot and database results without provenance.

Ground studies without their own test rows must not be presented as
experiments with zero results.

### Optional visual exploration

Keep the working investigation relationship map.

Existing station/interior viewers may remain accessible under
“Visual explorer”, but do not dominate the default evidence dashboard.
They are contextual illustrations without scientific location mappings.

Do not delete working viewers merely to change the default composition.
No arbitrary red markers or live-fire interpretation.

## Assistant: bottom request bar

Remove the permanent right-hand assistant column.

Create a persistent glass request bar near the bottom of the workspace:
- Accessible question input.
- Send button.
- A few useful suggested questions when empty.
- Connection/loading status.
- Expand conversation and Clear conversation controls.

Example placeholder:
“Ask about NASA combustion evidence…”

The bar must not cover the last content, keyboard focus, or mobile inputs.
Reserve layout space for it and account for mobile safe areas.

Expanded conversation opens on demand as an accessible drawer or panel.
Do not keep a large empty chat panel permanently visible.

Maintain one shared conversation across workspace views.
Clear user-specific history on logout/account change.
Handle slow responses, cancellation where supported, and errors.

Reuse the existing ChatPanel and backend where practical.
Preserve existing tool checks and numerical warnings.

## How questions affect the dashboard

The user's question should guide the workspace.

Examples:
- A materials question opens relevant material/test information.
- A comparison opens a comparison section.
- An existing finding opens its summary and evidence.
- A request for sources opens the corresponding proof details.

Current assistant tools do not automatically provide navigation actions.
Inspect the actual response contract before implementing this behavior.

Do not infer UI commands by executing arbitrary model text.
Use an allowlisted, validated action adapter with existing record IDs.
Only apply filters supported by actual structured metadata.
Keep navigation controls separate from scientific outputs.

Where action metadata is absent:
- Display the answer and provenance.
- Offer existing valid finding links where available.
- Do not pretend automatic dashboard adaptation works.

Prefer an explicit “Open results” action for major view changes.
Keep the user's current filters and provide Back to overview.
Do not destroy manually opened content or move it while the user reads.

Assistant answers remain labeled as ungraded unless linked to an actual
matching audited finding. Never manufacture audited findings from chat.

## Suggested questions

- “Which investigations studied solid fuels?”
- “Which tests reached at least 30% oxygen?”
- “Which tests also met the selected pressure limit?”
- “Which materials have missing oxygen or pressure data?”
- “What evidence supports this finding?”
- “Show the calculation and its audit.”
- “What experimental coverage is missing for this scenario?”

Use project-sourced scenario definitions and show their limitations.
Missing pressure does not satisfy a pressure filter.
Burner-stream oxygen must not be confused with chamber atmosphere.
Keep microgravity versus partial-gravity limitations visible.

## Student and Professional

Same underlying evidence; different presentation.

Student:
- Plain-language summaries.
- Defined terms and concise explanations.
- Sources, warnings, and confidence explained clearly.

Professional:
- Experimental conditions, units, values tables.
- Calculation method and parameters.
- Exact evidence rows, DOI, and available audit checks.

These modes are not permission levels.
Do not claim restricted access without actual backend authorization.

## Design language

Scientific readability comes first, with restrained visual impact.

- Deep charcoal and blue-gray surfaces.
- Silver text with selective cyan accents.
- Floating panels with clear alignment.
- Thin borders and comfortable spacing.
- Compact supporting controls.
- Full light and dark themes.

Stronger glass:
- Bottom assistant bar.
- Expanded conversation container.
- Small floating controls.

More opaque surfaces:
- Scientific text.
- Tables.
- Charts and evidence details.

Short staggered panel reveals are welcome.
No perpetual movement around reading areas.
No automatic modals, flashing page, fake telemetry, or invented progress.

Do not collapse critical warnings into decorative tooltips.
Use labels/icons alongside semantic colors.

## Implementation order

### Phase A — Correct the dashboard composition

- Preserve the approved login.
- Add the brief black welcome transition.
- Replace the assistant sidebar with the bottom request bar.
- Reorganize the overview around research evidence.
- Keep existing functional map/viewers accessible.
- Reuse working data and assistant integrations.
- Implement honest unavailable states.

### Phase B — Question-driven workspace

- Inspect and extend the assistant integration boundary where necessary.
- Add validated contextual actions.
- Open existing findings, evidence, and supported filtered views.
- Preserve conversation and navigation history.

### Phase C — Complete scientific exploration

- Improve investigation browsing, charts, proof details, and tables.
- Follow actual publication and audit eligibility rules.
- Add the interpretation lab only when its backend/data are supported.

Do not build predictive fire simulation, emergency notification,
or arbitrary spacecraft hazard localization.

## Verification

Run the build and relevant existing checks.
With browser tooling, verify:
- Login preservation and entry transition.
- Demo entry and reduced motion.
- Bottom request bar and expanded conversation.
- Keyboard navigation and mobile keyboard layout.
- Source/loading/error states.
- Student / Professional behavior.
- Existing map and visual viewers.
- No content hidden behind the bottom bar.

Do not claim verification that was not performed.
No report needed; only flag blockers or unresolved errors.
Do not stage, commit, push, or deploy.