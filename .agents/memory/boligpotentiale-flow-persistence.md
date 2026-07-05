---
name: Boligpotentiale generation-flow persistence
description: How the 5 generation flows persist across tab/function navigation in the boligpotentiale dashboard, and the reset-after-save timer rule.
---

The boligpotentiale dashboard has 5 generation flows (AI visualisering/UploadFlow, Floorplan3D, TransformVideo = morph + cinematic walkthrough, ShowcaseVideo, AIDesignAgent). Requirement: an in-progress generation must keep running and stay visible when the user navigates to another function and back; a finished result stays until saved to a folder (then flow resets, ready for next run) or replaced by a new generation.

**Persistence mechanism:** the 5 flows are ALWAYS mounted in `<main>`; only the active section is visible, inactive ones get Tailwind `hidden` (display:none). Do NOT switch these back to conditional `{section === "x" && ...}` render — that unmounts the component and kills in-flight fetch/SSE/polling and blob preview URLs. (PropertyTourFlow / ai-boligfremvisning is owner-only and intentionally stays conditionally mounted; it is not one of the 5.)

**Why:** keep-mounted was chosen over a localStorage/global generation store because it needs no rewrite of flow internals and blob object URLs survive tab switches. Trade-off: state does NOT survive a full page refresh — acceptable, the requirement is in-app navigation only.

**Reset-after-save rule:** each save-to-folder handler resets its flow ~1.5s after "Gemt til mappe". That delay MUST use a per-flow timer stored in a ref (e.g. `resetTimerRef`, `morphResetTimerRef`, `wtResetTimerRef`, `showcaseResetTimerRef`), cleared at the start of every "start new work" handler (handleFile/addFiles/handleGenerate) and in a `useEffect(() => () => clearTimeout(...), [])` unmount cleanup. A raw uncancelled `setTimeout` races: if the user starts a new generation within the window it wipes the fresh input.
**How to apply:** when adding/editing any of these flows, keep it always-mounted and route any delayed reset through its ref-based cancellable timer.
