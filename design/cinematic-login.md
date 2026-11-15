REDESIGN THE EXISTING LOGIN.

Replace its current visual composition, layout, background, and styling.
Do not treat the old login appearance as a design constraint.
Do not create a second login route.

Preserve only working authentication behavior, necessary validation,
and navigation to the dashboard. Inspect these before editing.

Read:
- design/cinematic-login.md
- motion-reference1.png
- motion-reference2.png
- Relevant existing login components and project instructions
- The installed UI/design skill

NEW VISUAL DIRECTION
A full-screen cinematic space experience:
1. Recognizable Earth centered in deep charcoal space.
2. Fine silver-white and cyan stardust flowing around Earth.
3. Particles eventually assemble into our spacecraft hologram.
4. The camera and main motion stop.
5. A centered frosted-glass login appears above the scene.

The final form contains email, password, Student/Professional experience
selection, Sign in, and Explore demo.
Experience selection does not grant security permissions.

IMPLEMENT ONLY PHASE A THIS TURN
Create the new full-screen composition with:
- Centered Earth with recognizable continental detail.
- Restrained atmospheric rim.
- Fine star field.
- Curved particle motion and gentle camera push-in.
- An explicit “Skip intro” control.
- A newly styled, centered glass login panel.

For this phase, reveal the login after the short Earth introduction.
The spacecraft assembly will be added in the next phase.
Keep the animation structured so that transition can be inserted later.

Replace the old split-screen or card-grid composition.
Use a real HTML form above the canvas.
Ensure the background does not compromise form readability.
Do not use a prerecorded video as the animation.

Use charcoal, blue-gray, silver-white, and restrained cyan.
No rainbow effects, excessive glow, or decorative fake telemetry.

Preserve working authentication. If authentication is not connected,
state that honestly and keep Explore demo functional.
Do not implement fake successful credential validation.

Support mobile, keyboard navigation, reduced motion, and WebGL failure.
Reduced-motion and failure states must show the form immediately.
Prevent animation loops and GPU resource leaks.
Reuse existing dependencies where practical.

Run the production build.
If browser tools are available, inspect desktop and mobile and fix
visible composition problems. Otherwise report that limitation.

All product text must be in English.
Keep the final report concise and include how to preview the login.

DO NOT STAGE, COMMIT, PUSH, OR DEPLOY.