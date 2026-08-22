---
name: Clean Rendy master videos
description: Rendy videos stay free of visible AI labels, headlines, and addresses until an optional post-generation text edit.
---

Rendy showcase generation must return and durably store the clean provider MP4 without running an FFmpeg text-overlay pass. The pre-generation UI must not ask for an address or headline.

**Why:** The user confirmed that Rendy's clean video is the quality target. Burning a placeholder/address in the lower-left and an “AI Redigeret” badge into every frame looks poor, reduces flexibility, and forces text decisions before the video can be judged.

**How to apply:** Localize the provider MP4 and upload it to durable storage byte-for-byte; the recovery path must do the same. Keep job/listing ownership as internal provenance. Add sales text only in a separate, optional post-generation editor where the user can preview font, placement, and wording before exporting.
