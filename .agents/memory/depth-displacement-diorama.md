---
name: Depth-displacement 3D floorplan viewer
description: How to make the single-plane depth-displacement 3D viewer look good and avoid the "torn sheet" failure mode.
---

# Depth-displacement diorama viewer

The interactive 3D floorplan viewer (client/src/components/floorplan-3d-viewer.tsx
+ server/depth.ts) is a single Three.js PlaneGeometry displaced by a DepthAnything
depth map. This technique is a 2.5D relief, NOT a real 3D model.

**Rule:** present it as a top-down diorama, never let the user see it edge-on.
- Lay the plane flat (`rotation.x = -PI/2`) and view top-down; do NOT leave it
  vertical facing the camera.
- Constrain OrbitControls polar angle (≈ 0..0.95 rad). Rotating to the side
  exposes a thin shredded/melted sheet — that is the inherent failure mode the
  user reported, not a bug to "fix" with more geometry.
- Build geometry AFTER the texture loads and use the real image aspect ratio;
  a hardcoded aspect stretches the plan.
- Keep displacementScale low (~0.16). High values stretch triangles across depth
  cliffs into vertical "skirts."

**Why:** a displaced single plane cannot represent walls from the side; only the
near-top-down parallax view looks premium.

**Depth map prep (server/depth.ts):** normalize to full 0-255 range and `blur(3)`
the depth before sending it — softens sharp depth cliffs that tear the displaced
mesh. Jimp v1 API (`new Jimp({width,height})`, `getBuffer("image/png")`).
