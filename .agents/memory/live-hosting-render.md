---
name: Live hosting is Render, not Replit
description: Where formaestates.com actually runs, which database it uses, and Render's network limits — critical for any "works in dev, broken in live" report.
---

# Live hosting setup (verified July 2026)

- **formaestates.com is served by Render** (behind Cloudflare), NOT by the Replit deployment. The Replit deployment (room-stylist.replit.app, autoscale) was **suspended by the user in early June 2026** and 404s.
- Render **auto-deploys from the GitHub remote `origin`** (fredefussing/Forma-Estates). Replit checkpoints push to that repo, so code changes reach live automatically within ~2–5 minutes — no Replit publish needed for code.
- The Render app uses **Render's OWN Postgres** (host `dpg-…`), NOT the Replit prod DB. It was a June copy of the schema; missing tables/columns were repaired in July 2026 via a temporary migrate endpoint (since removed from the codebase after the repair succeeded).
- **Render blocks ALL outbound SMTP at TCP level** (ports 587 and 465 time out; verified via TCP checks in the live diag endpoint). HTTPS (443) works fine. Email from live therefore must go via an HTTP API — `sendBrevoEmail` auto-switches to Brevo's HTTPS API when `BREVO_API_KEY` is set. **`BREVO_API_KEY` was added in Render on July 21, 2026 — user confirmed activation-code and contact emails work on live.** Brevo free plan: 300 mails/day, sender kontakt@formaestates.com is verified.
- Render env is still missing `ADMIN_PASSWORD` and `STRIPE_WEBHOOK_SECRET` (Stripe webhooks likely broken on live — flagged to user).

**How to apply:** any "virker i dev men ikke i live" bug → first suspect the Render DB schema or Render network limits; probe live endpoints with curl (a valid Firebase token can be minted via the identitytoolkit REST API with the public apiKey from the live JS bundle; delete probe accounts afterwards via accounts:delete). The key-guarded `GET /api/health/live-diag` endpoint still exists (migrate endpoint removed) — remove live-diag once `ADMIN_PASSWORD` + `STRIPE_WEBHOOK_SECRET` are set in Render and verified. One orphaned probe user row (id 10, probe-…@formaestates-test.dk) remains in the Render DB.
**Why:** hours were spent discovering this: live signup was broken by the stale Render DB schema, and email was broken by Render's SMTP block — two independent failures behind one symptom.
