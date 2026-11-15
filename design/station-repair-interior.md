# Repair station loading and build a conceptual interior

Read applicable project instructions and relevant viewer code.
Preserve the approved cinematic login, authentication, dashboard layout,
and unrelated changes.

All product text must be English.
Do not stage, commit, push, or deploy.

## 1. Diagnose and repair first

All dashboard station variants currently show:
“The station model could not be loaded: Failed to fetch”.

Identify the actual failing resource before editing.
Inspect browser Network/Console if available, requested URLs, HTTP responses,
Vite configuration, and loader lifecycle.

Check:
- GLB requests return actual binary files, not index.html.
- Public URLs respect BASE_URL and exclude /public/.
- Variant mappings match existing filenames exactly.
- Local Draco decoder JS/WASM requests succeed where needed.
- CSP, request cancellation, or disposed loaders are not causing failures.
- Compare against the working cinematic login loader.

Assets exist in dashboard/public/models/:
- iss-b.glb
- iss-a.glb
- twisters-station-solid.glb
- twisters-station-hologram.glb

Do not regenerate or overwrite those assets to mask a loading bug.
Do not merely replace the error message.
Do not silently substitute another variant and call it fixed.

Verify NASA ISS, Concept, and Hologram separately.
Preserve glTF LINES in the hologram.
Keep useful retry/error handling.

Supabase and Ollama availability are separate issues.
Do not invent connections, modify secrets, or hide their status.
If unavailable, flag the specific missing service/configuration.

## 2. Create a real conceptual interior

After the loading issue is fixed, create an ORIGINAL procedural habitat
using Three.js geometry and existing dependencies.

This should be an actual explorable 3D scene, not a background image.

Create:
- A central passage connecting three compartments.
- Rounded hatch frames and visible wall thickness.
- Equipment racks and restrained cable/conduit details.
- Ventilation grilles.
- Storage panels and a research workstation.
- Soft practical lighting, blue-gray materials, small cyan accents.

Keep geometry efficient and reuse materials.
Use dashboard/dashboard-references/02-iss-interior.png for spatial cues
and the cutaway references for presentation.
Do not copy their screenshot overlays or imply an accurate ISS replica.

Provide modes:
- NASA exterior: existing NASA model.
- Concept cutaway: new habitat with an opened/removable roof.
- Concept interior: camera viewpoints inside that SAME new habitat.

Do not pretend the invented interior is inside the NASA exterior.
Clearly label the two as different assets.

Use meaningful stable IDs for conceptual compartments.
Keep geometry and compartment metadata separate.
Save the generator/source in the project.
Export a reusable GLB to public/models/flametrace-habitat-concept.glb
using existing tooling if feasible; do not claim export if only runtime
geometry was created.

## 3. Navigation and selection

Clicking a conceptual compartment:
- Highlights its boundary.
- Shows its name.
- Offers “Enter compartment”.
- Moves to a carefully framed interior viewpoint.

Include Back to cutaway and Reset view.
Support touch, keyboard-accessible equivalent controls, reduced motion,
and safe camera bounds.
Do not let camera movement clip through walls.
No VR dependency is required.

## 4. Demonstration marker

Add a separate optional “Demo scenario” control.
It may highlight a selected conceptual equipment rack with a red marker
and open an explanation panel.

Label it:
“Illustrative scenario — no live telemetry”.

Do not associate a real finding with that location without source-backed
mapping. Do not invent risk thresholds, sensor readings, fire predictions,
or emergency notifications.

Keep demo markers separate from scientific records and counts.

## 5. Verification

Complete repair before introducing the new interior.
Run the build and relevant existing checks.
If browser tools are available, verify each model mode, asset requests,
compartment selection, enter/back/reset, mobile, and reduced motion.

Do not claim visual verification unless performed.
No report needed; only flag blockers or unresolved errors.