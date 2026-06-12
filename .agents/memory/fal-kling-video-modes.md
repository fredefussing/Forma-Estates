---
name: Kling v1.6 image-to-video field modes
description: fal-ai/kling-video/v1.6/pro/image-to-video has two distinct input shapes; mixing them up causes a 422 at generation time (not at submit).
---

## Rule
`fal-ai/kling-video/v1.6/pro/image-to-video` validates input in two mutually exclusive modes:

- **Single-image mode** (one input frame → free camera motion): the required field is **`image_url`**. Optional `tail_image_url` for an end frame.
- **Start→end interpolation mode** (morph between two frames): use **`start_image_url`** + **`end_image_url`**.

Sending only `start_image_url` (no `end_image_url`) satisfies *neither* mode → worker rejects with `422 Unprocessable Entity`, detail `{loc: ["body","image_url"], msg: "Field required"}`.

**Why:** The two modes are a discriminated union. `start_image_url` alone is not a valid single-image request — single-image mode keys off `image_url`.

**How to apply:** For a flythrough/camera-move clip from one image (our "Cinematisk gennemgang"), send `image_url`. For a before→after morph (our "Forvandling"), send `start_image_url` + `end_image_url`.

## Critical debugging note
`fal.queue.submit` **accepts** an invalid body and returns a `request_id` — the 422 only surfaces later when polling `fal.queue.result`/`status` (job status becomes FAILED). So "submit succeeded" does NOT mean the input is valid. Always poll to confirm, and capture `err.body.detail` (not just `err.message`, which is the generic "Unprocessable Entity") to see the exact field error.
