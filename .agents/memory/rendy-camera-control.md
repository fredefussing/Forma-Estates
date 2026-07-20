---
name: Rendy camera control via presetKey
description: How Rendy's public API handles camera-movement keys, and how to probe its Zod schema safely at zero cost
---

# Rendy camera control (beta)

- Rendy's public API (`https://api.rendy.io/api/public/v1`, header `x-api-key`) exposes `GET /camera-movements` returning 11 keys (`SLIDER_LEFT/RIGHT`, `PARALLAX_LEFT/RIGHT`, `PUSH-IN`, `PULL-OUT`, `CRANE-UP/DOWN`, `PEDESTAL-UP/DOWN`, `STATIC`) as `{key, movement, direction}`.
- Camera keys are sent as the per-image `presetKey` on `POST /listings` — there is NO separate camera field. The listing schema only knows `address`, `ratio`, `imageUrls[{url, presetKey, originalImageWidth, originalImageHeight}]`.
- The API no longer rejects unknown presetKeys upfront (older behavior did). Unknown keys are silently ignored, so validate keys yourself against `/camera-movements` + `/presets` before sending.
- Music is NOT controllable via the public API (no known field).
- Camera movements have no official sample videos (unlike VFX presets, which stream from Rendy's Supabase).

**How to apply:** any change to which keys we forward to Rendy should be validated against the live `/camera-movements` and `/presets` endpoints (both free GET calls).

# Zero-cost schema probing trick (Zod APIs)

- Send a request with an invalid URL plus a candidate field with a deliberately WRONG type (e.g. number). Zod aggregates all errors for known fields: if the response contains a type error for the candidate ("expected string, received number"), the field exists; if only "Invalid URL" appears, the field is unknown/ignored.
- Always run the control first with a KNOWN field to confirm the API aggregates errors.
- To test whether a *value* is accepted without creating anything, pair it with a guaranteed-failing sibling (e.g. an unreadable image URL) so the request always aborts.

**Why:** lets you map a third-party API's schema and value validation without spending render credits or creating junk objects.
