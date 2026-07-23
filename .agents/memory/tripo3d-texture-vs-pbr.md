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
- Node.js fetch() is blocked by Replit proxy — always use `spawn("curl", [...])` for Tripo3D API calls
- React model-viewer: inject script into head via `ensureModelViewerScript()`, render `<model-viewer>` directly (no iframe/sandbox — those block GLB loading)

## GLB URLs must be localized server-side (never sent raw to browser)
Tripo3D CDN GLB URLs are doubly unusable in the browser: the CDN blocks browser CORS
(model-viewer fetch fails → eternal "loading" spinner), AND the signed URLs expire after ~9h.

**How to apply:**
- Server downloads the GLB (curl, tmp+rename) to `/uploads/` on the success poll, uploads to R2, and returns only the local `/uploads/...` URL to the client.
- Never fall back to the remote URL on download failure — that silently reinstates the CORS bug. Instead return `status:"running"` so the client re-polls (capped retries), then fail explicitly.
- Serve `.glb` with `Content-Type: model/gltf-binary` + immutable Cache-Control.
- Blob-page (`URL.createObjectURL`) viewers can't resolve relative `/uploads/...` paths — prefix with `window.location.origin`.
