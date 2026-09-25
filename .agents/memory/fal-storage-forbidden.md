---
name: fal.storage URLs and model workers
description: Model workers may fail to fetch fal.storage media despite a successful public curl.
---

For model inputs, do not assume a fal.storage-uploaded URL is usable merely because a local curl returns HTTP 200. In addition to the known nano-banana-2/edit 403 issue, a Veo reference-to-video request failed at result time with “Failed to download the file” for a fal.storage URL but succeeded with the same image on a publicly reachable `/uploads/` URL. A completed queue status does not guarantee a usable result; call queue.result and handle provider errors.

**Why:** The URL is fetched from the model worker's environment, which can differ from the agent container. An upload can look healthy locally yet be inaccessible to the generation worker.

**How to apply:** For temporary one-off reference media, normalize image orientation, serve the file through a verified public URL during generation, then delete the temporary public copy after retrieving the result. Do not leave personal reference photos in public uploads. Seedance reference-to-video may separately reject real-person reference images under its partner's content policy; that is distinct from a fetch failure.