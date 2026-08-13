---
name: Long-running server calls need timeouts
description: Pattern for adding hard timeouts to fal.ai, Collov, Tripo3D and other third-party calls that have no built-in timeout.
---

## Rule
Every third-party API call that can take >10 seconds MUST have a hard timeout. Without it, one hung provider request stalls the Express route forever — the client spinner never stops.

**Why:** fal.ai queue backups (2-5 min), Collov hung fetches, and Tripo3D polling all default to no timeout. On Render, this shows as "just loads / spinner never stops" because there's no proxy timeout rescuing the request.

## Patterns

### fal.subscribe — use Promise.race
```typescript
const timeoutP = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error("timeout after 4 min")), 4 * 60 * 1000)
);
const result = await Promise.race([fal.subscribe("fal-ai/...", { input }), timeoutP]);
```
Used in: `server/fal.ts` `generate3DFloorplanFromUrl()` and `generate3DFloorplan()`

### fetch() — use fetchWithTimeout helper
```typescript
async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}
```
Used in: `server/routes.ts` for all Collov API calls (generate, poll, VST step1/step2/poll)

### Polling loops — max attempts
Replace `while(true)` with `let attempts = 0; while (attempts < MAX) { attempts++; ... }` — ensures a definite end even if the provider never signals done.

## Applies to
- `fal.subscribe()` calls: 3D floorplan, AI tour panorama, transform video (Seedance)
- Collov `fetch()` calls: generate, getRecord, emptyRoom, getEmptyRoomRecord, generateImgOnCommon, vst/getRecord  
- Showcase export polling in client dashboard: max 90 × 2s = 3 min
- Tripo3D client polling: 4-minute `setTimeout` + 5-retry tolerance on network errors
