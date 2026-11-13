# Pulse Relay

The folded D and its inset signal share a 32-unit grid. At 16 pixels the open left edge distinguishes the mark without lettering. The same source generates the SVG mark, horizontal lockup, monochrome variants, multi-resolution Windows icon and macOS ICNS. Run `backend/.venv/Scripts/python.exe scripts/make-icon.py` to regenerate them.

Global roles live in `frontend/src/styles/identity.css`. Dark uses graphite, slate panels and a recessed input surface. Light uses neutral paper, gray-green dividers and a darker teal. Users may choose the steel accent. Semantic success, error and warning colors retain text labels. Code, references, paths and numeric metrics use the monospace stack or tabular figures.

The persistent navigation groups work by activity. Page headings, toolbars, form fields, data tables, session inspectors, dialogs, loading states and errors reuse the same visual roles. Project lists emphasize paths and actions, conversations emphasize the current turn, and deployment detail puts evidence and metadata alongside the build state.

## Verification

Run the React build for type checking and the desktop smoke test for routing, project creation and Monaco loading. Browser preview fixtures are isolated in `frontend/preview`. They are excluded from the production desktop renderer.
