---
name: Screenshot tool has no WebGL
description: The app_preview screenshot tool's headless browser cannot create a WebGL context, so Three.js / canvas-3D scenes never render in screenshots.
---

# Screenshot tool cannot render WebGL

The `screenshot` tool (app_preview) runs a headless browser with **no WebGL context** — it logs `THREE.WebGLRenderer: A WebGL context could not be created` / `Could not create a WebGL context`. Any Three.js / WebGL canvas shows only the HTML chrome around it (toolbars, spinners, overlays), never the 3D scene itself.

**Why:** don't waste a screenshot round-trip trying to visually confirm a 3D viewer, and don't mistake the blank canvas + WebGL error for a real bug — it's a tooling limitation, not the app's code.

**How to apply:** to validate 3D geometry, test the *data* that feeds the scene instead (e.g. tint detected wall rects over the source image and read that PNG). Real users' browsers have WebGL, so trust a scene that mirrors an already-working viewer's pattern.
