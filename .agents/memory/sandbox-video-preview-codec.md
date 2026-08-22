---
name: Sandbox video preview codec
description: Browser preview compatibility for derived Rendy video clips in the mockup sandbox.
---

Use VP9/WebM for short, derived video previews in the mockup sandbox when a source H.264 MP4 will not initialize in the preview browser. Keep the original uploaded MP4 delivery as the untouched reference asset.

**Why:** The sandbox could serve user-provided H.264 MP4 files with correct range support, but the preview browser left the derived `yuvj420p` clips at `readyState = 0`, so playback never began. Re-encoding the same footage to VP9 `yuv420p` made preloading, autoplay, and two-layer transitions reliable.

**How to apply:** For an editor UI, use browser-safe WebM derivatives for playback cards and clip transitions, and reserve the original delivery format for preservation or server-side export. Verify both selected-output playback and an edited multi-clip sequence after changing codecs.