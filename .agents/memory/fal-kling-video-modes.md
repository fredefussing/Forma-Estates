---
name: Kling v1.6 image-to-video field modes
description: fal-ai/kling-video/v1.6/pro/image-to-video has two distinct input shapes; mixing them up causes a 422 at generation time (not at submit).
---

## Rule
`fal-ai/kling-video/v1.6/pro/image-to-video` validates input in two mutually exclusive modes:

- **Single-image mode** (one input frame → free camera motion): the required field is **`image_url`**. Optional `tail_image_url` for an end frame.
- **Start→end interpolation mode** (morph/walkthrough between two frames): use **`start_image_url`** + **`end_image_url`**.

Sending only `start_image_url` (no `end_image_url`) satisfies *neither* mode → worker rejects with `422 Unprocessable Entity`, detail `{loc: ["body","image_url"], msg: "Field required"}`.

**Why:** The two modes are a discriminated union. `start_image_url` alone is not a valid single-image request — single-image mode keys off `image_url`.

**How to apply for our two video modes:**
- **Cinematisk gennemgang** (cinematic walkthrough): use `image_url` (before/start) + `tail_image_url` (after/end) + `duration: "5"`. These are the CORRECT kling field names for two-frame interpolation. `start_image_url`/`end_image_url` are NOT valid for this endpoint and cause 422 "image_url Field required" at the worker.
- **Forvandling** (morph): now uses the SAME known-good fields as cinematic — `image_url` (before) + `tail_image_url` (after) + `duration: "5"` — keeping only the distinct `TRANSFORM_VIDEO_MORPH_PROMPT`. Resolved defensively: the old `start_image_url`/`end_image_url` + `duration: "8"` was rejected by `tsc` (SDK allows only `"5" | "10"`) and contradicted our cinematic-branch comment (those names 422 on this endpoint). A prior session claimed the old shape "happened to work" but it was never re-verified against live fal; aligning to the proven cinematic shape removes the risk. Both modes go through `uploadVideoPairToFal` (equal-dim crop).
- Cinematic requires `uploadVideoPairToFal()` (Jimp center-crop to same dimensions) before upload.

## Critical debugging note
`fal.queue.submit` **accepts** an invalid body and returns a `request_id` — the 422 only surfaces later when polling `fal.queue.result`/`status` (job status becomes FAILED). So "submit succeeded" does NOT mean the input is valid. Always poll to confirm, and capture `err.body.detail` (not just `err.message`, which is the generic "Unprocessable Entity") to see the exact field error.
