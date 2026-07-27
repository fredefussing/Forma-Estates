---
name: Seedance 2.0 transform video (aspect ratio)
description: Transform/walkthrough videos run on bytedance/seedance-2.0/image-to-video; aspect_ratio rules and how to probe the live schema.
---

## Rule
The before→after video product runs on fal endpoint `bytedance/seedance-2.0/image-to-video` (NO `fal-ai/` prefix — with the prefix, API calls and the schema URL return null/404). Input shape: `image_url` + `end_image_url`, `duration` "4"–"15" or "auto", `resolution` 480p/720p/1080p/4k, `generate_audio`.

- **Morph ("Forvandling") must send `aspect_ratio: "auto"`** — auto follows the input image's orientation. A hardcoded `"9:16"` crop-zooms landscape inputs into a vertical slice (users saw only the ceiling).
- **Cinematic walkthrough intentionally stays `"9:16"`** — it is a vertical product and its prompt says vertical.

**Why:** aspect_ratio overrides the input image framing; the model crops to satisfy it. Verified 2026-07-27 with a live 480p probe: 1264×843 landscape inputs + auto → 752×560 landscape output, first/last frames match inputs uncropped.

**How to apply:**
- Any new video mode with user-supplied images should default to `"auto"` unless the product is explicitly vertical.
- Probe the live input schema for free: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.0/image-to-video` (works for other endpoints too; try without `fal-ai/` prefix if null).
- Cheap end-to-end verification: direct `curl` to `https://queue.fal.run/<endpoint>` with `resolution: "480p"`, `duration: "4"`, then ffprobe the output dimensions.
- UI: result `<video>` elements need `maxHeight` + `objectFit: contain` so an unexpected portrait video can never blow up the layout.

Historical: the product previously ran on Kling v1.6/pro, which had discriminated-union input modes (`image_url`+`tail_image_url` vs `start_image_url`+`end_image_url`, 422 at worker if mixed). Irrelevant unless Kling is reintroduced.
