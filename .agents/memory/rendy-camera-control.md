---
name: Rendy camera control via cameraActionKey
description: How Rendy's public API handles camera-movement keys, upload format quirks, and how to probe its Zod schema safely at zero cost
---

# Rendy camera control

- Rendy's public API (`https://api.rendy.io/api/public/v1`, header `x-api-key`) exposes `GET /camera-movements` returning 11 keys (`SLIDER_LEFT/RIGHT`, `PARALLAX_LEFT/RIGHT`, `PUSH-IN`, `PULL-OUT`, `CRANE-UP/DOWN`, `PEDESTAL-UP/DOWN`, `STATIC`) as `{key, movement, direction}`.
- **Camera keys go in the per-image `cameraActionKey` field on `POST /listings` — NOT `presetKey`** (that field is for VFX presets only). Sending a camera key as `presetKey` passes schema validation but fails the ENTIRE listing at generation time with `status=error`, `progress=0`, empty `videos[]`, `creditsDeducted=false` (verified July 2026 with paired single-image tests: presetKey=PARALLAX_LEFT → instant error; cameraActionKey=PARALLAX_LEFT → success).
- Listing image schema: `imageUrls[{url, presetKey?, cameraActionKey?, originalImageWidth?, originalImageHeight?}]`. If dims are provided, Rendy skips reading dimensions from the URL at submit; without dims an unreadable URL is rejected upfront ("could not read image dimensions from url").
- Rendy re-encodes ALL uploads (`POST /images/upload`) to WebP server-side — a stored `.jpeg`/`.jpg` URL containing WebP bytes is NORMAL and not an error signal. Don't diagnose failures from stored file format.
- Failed listings (error before video tasks) never deduct credits (`creditsDeducted:false`), so submit-and-instant-error tests are effectively free.
- There is no DELETE /listings/:id (404) — a started generation can't be cancelled.
- Music is NOT controllable via the public API (no known field).
- Camera movements have no official sample videos anywhere (unlike VFX presets, which stream from Rendy's Supabase) — verified exhaustively: API, landing page, Supabase path guesses, and ALL public webpack chunks. Rendy's own picker instead renders 3D-transform previews of the user's own image (their form schema has `cameraActionKey` enum + `cameraCustom {horizontal, vertical, zoom, pan, tilt, rotate}`). Replicate with CSS `perspective()` transforms, not videos.
- To enumerate a Next.js site's full public chunk set: fetch `webpack-*.js` runtime, extract `chunkId:"16hexhash"` pairs → `/_next/static/chunks/{id}-{hash}.js`, download all, grep. Route-level app chunks behind auth are NOT in this map.

**How to apply:** any change to which keys we forward to Rendy should be validated against the live `/camera-movements` and `/presets` endpoints (both free GET calls), and camera vs VFX keys must be routed to their separate fields.

# Zero-cost schema probing trick (Zod APIs)

- Send a request with an invalid URL plus a candidate field with a deliberately WRONG type (e.g. number). Zod aggregates all errors for known fields: if the response contains a type error for the candidate ("expected string, received number"), the field exists; if only the URL error appears, the field is unknown/ignored.
- Always run the control first with a KNOWN field to confirm the API aggregates errors.
- To test whether a *value* is accepted without creating anything, pair it with a guaranteed-failing sibling (e.g. an unreadable image URL) — but on Rendy, OMIT originalImageWidth/Height or the bogus URL is accepted and a doomed listing is created (still credit-free, but noisy).

**Why:** lets you map a third-party API's schema and value validation without spending render credits or creating junk objects.
