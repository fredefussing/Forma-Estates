---
name: Landing media URL verification
description: Why a successful response status is not enough to verify public landing videos and images.
---

Public landing media references must resolve to actual playable files. An absent static video URL can receive an HTML 200 response from the SPA fallback while the browser renders a black video area.

**Why:** A visual review found a black hero and missing example media even though requests to the stale video paths returned HTTP 200. TypeScript checks cannot detect missing media assets.

**How to apply:** When editing landing media, check referenced local paths exist and confirm served Content-Type is video/mp4 or image/* as appropriate. Inspect at least one rendered desktop and mobile state.