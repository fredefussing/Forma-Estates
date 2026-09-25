---
name: Kling O1 continuation duration
description: The live start-frame image-to-video worker has a narrower duration limit than its advertised enum.
---

For Kling O1 image-to-video with a start image but no end/reference image, use a duration of **5 or 10 seconds**. An 8-second request can enter the queue and report COMPLETED, then fail on result retrieval with HTTP 422: “Duration only support 5 or 10 seconds when no refer image.”

**Why:** The endpoint's published schema lists 3–10 seconds, but the worker applies a narrower conditional rule. Queue submission and status alone do not validate the actual result.

**How to apply:** When continuing a video from its last frame without an end image, request 5 or 10 seconds and always fetch the final result before declaring success.