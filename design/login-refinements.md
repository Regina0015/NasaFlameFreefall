Refine the approved cinematic login. Inspect the existing implementation
and use the installed UI skill. Do not rebuild the sequence or dashboard.

Preserve the Earth opening and especially the existing bright reveal
that creates the spacecraft: that effect is approved.

1. ADD A PARTICLE WORD BEFORE SPACECRAFT ASSEMBLY
During the existing stardust gathering:
- Converge the particles into the exact word “Twisters”.
- Use elegant, readable typography rendered as actual particle targets,
  not a solid HTML text overlay.
- Hold the completed word for approximately 1–1.5 seconds.
- Release those same particles into curved streams that progressively
  assemble the existing NASA station.
- Continue into the approved glow/reveal without replacing its effect.

Generate text targets from a locally available font using canvas sampling
or existing tooling. Normalize particle counts between text and model
targets, use seeded correspondence, and interpolate smoothly.
Keep the word legible and centered across desktop/mobile.
Avoid an abrupt text-to-model swap or a random particle explosion.
Expose stage durations as constants; keep the added delay modest.

2. STRONGER FROSTED GLASS
The current login panel looks too opaque.
Use a translucent blue-gray surface with approximately 35–50% opacity,
backdrop blur around 18–24px, a subtle light border, faint inner highlight,
and restrained shadow. Tune against the actual rendered background.

The station and stars should be softly perceptible through the panel,
while labels and inputs remain clearly readable.
Avoid applying opacity to the entire panel and its text.
Make input surfaces slightly translucent too, with clear focus states.
Provide an opaque accessible fallback when backdrop-filter is unsupported.

Keep the existing form functionality and responsive layout.
Replace the oversized demo explanation with a concise, accurate
“Demo mode — authentication is not connected” notice only when true.
Keep any necessary additional explanation available through a details link.
Do not introduce fake authentication or new hardcoded credentials.

3. GENTLE AMBIENT MOTION AFTER LOGIN REVEAL
Replace the previous requirement to freeze everything:
- Stop camera travel and station assembly as before.
- Keep only background stars drifting slowly with subtle depth/parallax.
- Use sparse, soft twinkling without flashes or sudden brightness changes.
- Keep Earth/station and the form steady.
- Keep all particles behind the HTML interface.
- Maintain a darker, quieter region behind form text.
- Do not restart the cinematic intro or loop the assembly.

Add an accessible “Pause background motion” control.
With prefers-reduced-motion, show the final static state without ambient
animation. Pause rendering when the tab is hidden and reduce effects
on mobile. Reuse the existing animation loop; do not create duplicates.

4. PRESERVE AND VERIFY
Preserve authentication, Student/Professional behavior, routing,
Skip intro, Replay, and session handling.

Skip at any stage must immediately reach the final usable login.
Replay must reset text formation, assembly, and glow cleanly.
Asset/WebGL failure must never block access to the form.

Run the build. If browser tools are available, inspect particle-word
readability, text-to-station continuity, the approved glow, glass contrast,
ambient pause, reduced motion, and mobile layout.
Report only checks performed; keep the report brief.

All UI text in English.
Do not stage, commit, push, or deploy.