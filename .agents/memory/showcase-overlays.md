---
name: Showcase video overlays (FFmpeg)
description: How property title + address are burned into Rendy showcase videos via FFmpeg drawtext.
---

## Rule
Use `burnShowcaseOverlays()` (not `burnEuWatermark()`) for showcase videos. It burns:
1. EU badge — bottom-right, `y=h-text_h-16`, `fontsize=36`
2. Overskrift (headline) — bottom-left, `y=h-text_h-186` (or `-108` if no address), `fontsize=46`, bold
3. Address — bottom-left, `y=h-text_h-108`, `fontsize=30`, regular

**Why:** Always use `textfile=` not `text=` for the property text to avoid FFmpeg drawtext escaping issues with Danish special chars (apostrophes, colons, etc. in addresses). The text files are written to `os.tmpdir()` and cleaned up in `finally`.

**How to apply:** In `server/routes.ts` `rendyWatermark` callback, call `burnShowcaseOverlays(rawMp4, wmTmp, lang, overskrift, address)`. The `overskrift` and `address` are closed over from the route handler scope. An empty string for either means that text layer is skipped.

## Positioning logic
- Portrait 1080×1920 and landscape 1920×1080 both work with `h-text_h-N` expressions
- `h` = video height (FFmpeg variable), `text_h` = actual rendered text height
- Overskrift box bottom ≈ 154px from video edge; address box bottom ≈ 96px; EU badge ≈ 50px
- No horizontal overlap: title/address are left-anchored (`x=32`), EU badge is right-anchored (`x=w-text_w-32`)
