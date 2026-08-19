---
name: Render ephemeral uploads & R2
description: Why /uploads files vanish in production and how the R2 fallback + watermark-free proxy work
---

# Render's disk is ephemeral — /uploads files vanish on every deploy

**Rule:** Anything written to local disk in production (Render) is lost on the next deploy. User-uploaded before-images and localized videos must reach Cloudflare R2 to survive.

**Why:** Live share links and PDFs broke because before-images stored as `/uploads/...` disappeared after a redeploy. Files uploaded before the R2 integration existed are permanently lost (in neither disk nor bucket).

**How to apply:**
- The `/uploads` middleware serves disk-first, then streams from R2, then returns a real 404 (never let it fall through to the SPA catch-all — HTML with status 200 breaks `<img>` and PDF fetches confusingly).
- `r2ConfigSet` in the live-diag endpoint shows whether Render has the four `R2_*` vars. If missing on Render, uploads only live until the next deploy.
- Frontends that show before-images should tolerate a lost file (share view preloads and falls back to after-only).
- Treat R2 acknowledgement as part of a successful media operation: await it for uploads, provider results, and intermediate files whose public URL a queued provider must fetch. Provider CDN URLs may exist only inside the in-flight request, never in customer records or a success response.
- If a post-processing step changes an asset (for example, a watermark), upload the final bytes again before reporting completion. Keep database URLs as `/uploads/<key>` so disk-first/R2-fallback serving remains backward compatible.
- For legacy `/uploads` records, inventory and backfill missing R2 keys in a dry run before applying changes. Do not rewrite URLs or fabricate media that is absent from both R2 and a recovery source.

# Related: /api/proxy-image watermark contract

- Watermark ("AI-redigeret") is ALWAYS burned in for unauthenticated calls — deliberate, so the open proxy can't yield clean images.
- `plain=1` + a valid Firebase Bearer token skips the burn — used by the client-side PDF generator, which draws its own vector watermark (EFTER only; FØR must stay unbranded). Any valid account qualifies; acceptable while the watermark is disclosure branding, revisit if it becomes a paid gate.
- Browsers cannot fetch Collov CDN images directly (no CORS headers in prod) — always route canvas/PDF image fetches through the proxy.
