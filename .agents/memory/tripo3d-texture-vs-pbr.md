---
name: Tripo3D texture vs pbr parameter
description: Tripo3D image_to_model output format and color/texture behavior
---

# Tripo3D image_to_model: output format

## The rule
ALL `image_to_model` tasks return `output.pbr_model` only — there is no `output.model` field.
This is true regardless of whether `texture: true` or `pbr: true` is set or omitted.

Use `texture: true` (without `pbr`) in the POST body — it is semantically correct and produces the same output.

The `pbr_model` GLB **IS fully textured with colors from the input image** (baked albedo, roughness, metalness). It is NOT gray — confirmed by checking Tripo3D's own `rendered_image` preview which shows cream walls, wood tones, plants.

**Why gray models appear:**
- Gray appearance = iframe sandbox bug blocking GLB from loading (fixed by removing iframe)
- The model itself always has colors when input image has colors
- Gray in Tripo3D's own viewer = different input image (building facade, not floor plan)

**How to apply:**
- POST body: `{ type: "image_to_model", file: { type, url }, texture: true }`
- Status route URL priority: `output.model ?? output.pbr_model` (model never exists, pbr_model always does)
- Tripo3D signed URLs expire after ~9 hours; users must regenerate after expiry
- Node.js fetch() is blocked by Replit proxy — always use `spawn("curl", [...])` for Tripo3D API calls
- React model-viewer: inject script into head via `ensureModelViewerScript()`, render `<model-viewer>` directly (no iframe/sandbox — those block GLB loading)
