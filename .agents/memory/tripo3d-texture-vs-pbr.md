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

**Why gray models appear — confirmed root causes:**
1. `pbr: true` added alongside `texture: true`: Tripo generates full PBR maps (metallic/roughness/normal channels). In Three.js, metallic surfaces require a PMREMGenerator environment map to show any color — without one, they render flat grey/black. **Fix: remove `pbr: true`; use `texture: true` alone.**
2. Gray appearance = iframe sandbox bug blocking GLB from loading (fixed earlier by removing iframe)
3. Gray in Tripo3D's own viewer = different input image (building facade, not floor plan)

**Three.js environment map is required for correct PBR rendering:**
Add `PMREMGenerator` + `RoomEnvironment` to any Three.js scene that loads Tripo GLBs.
Without it: metallic PBR materials appear grey/black regardless of albedo texture.
With it: baked albedo materials also look slightly better (more realistic indirect lighting).

```javascript
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
```

## API defaults to old v2.5 — must pin model_version for HD quality
API without `model_version` uses v2.5-20250123 + standard texture → mushy, low-poly output
(rendered preview even named `legacy_mesh.webp`). Tripo's own web "HD Model" = v3.x +
Ultra geometry (up to 2M triangles; v2.5 caps at 500k) + high-res texture.

**How to apply:** send `model_version: "v3.1-20260211", geometry_quality: "detailed", texture_quality: "detailed"` (texture_quality detailed costs +20 credits/task). Version list: GET docs /docs/generation.

**How to apply (payload basics):**
- POST body: `{ type: "image_to_model", file: { type, url }, texture: true }` — NO `pbr: true`
- Status route URL priority: `output.model ?? output.pbr_model` (model never exists, pbr_model always does)
- Node.js fetch() is blocked by Replit proxy — always use `spawn("curl", [...])` for Tripo3D API calls
- React model-viewer: use Three.js + OrbitControls directly (no iframe/sandbox — those block GLB loading)

## GLB URLs must be localized server-side (never sent raw to browser)
Tripo3D CDN GLB URLs are doubly unusable in the browser: the CDN blocks browser CORS
(model-viewer fetch fails → eternal "loading" spinner), AND the signed URLs expire after ~9h.

**How to apply:**
- Server downloads the GLB (curl, tmp+rename) to `/uploads/` on the success poll, uploads to R2, and returns only the local `/uploads/...` URL to the client.
- Never fall back to the remote URL on download failure — that silently reinstates the CORS bug. Instead return `status:"running"` so the client re-polls (capped retries), then fail explicitly.
- Serve `.glb` with `Content-Type: model/gltf-binary` + immutable Cache-Control.
- Blob-page (`URL.createObjectURL`) viewers can't resolve relative `/uploads/...` paths — prefix with `window.location.origin`.
