---
name: Video transparency without obstructing Rendy
description: Rendy showcase videos stay visually clean; provenance is retained without burning a visible AI label into the frames.
---

Rendy showcase previews and saved videos must not have a visible AI label burned into them. Preserve the clean provider pixels and retain provenance through the durable job/listing records and any non-visual provider/container metadata.

**Why:** The user confirmed that the clean Rendy video is the desired final quality. A visible “AI Redigeret” badge obstructs the composition and should not be coupled to generation or saving.

**How to apply:** Do not call visible watermark/overlay helpers from the Rendy completion or recovery paths. Store the downloaded provider MP4 durably without re-encoding. Treat optional text and branding as a separate, explicit post-generation edit.