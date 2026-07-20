---
name: Live hosting is Render, not Replit
description: Where formaestates.com actually runs and which database it uses — critical for any "works in dev, broken in live" report.
---

# Live hosting setup (verified July 2026)

- **formaestates.com is served by Render** (behind Cloudflare), NOT by the Replit deployment. The Replit deployment (room-stylist.replit.app, autoscale) was **suspended by the user in early June 2026** and 404s.
- Render **auto-deploys from the GitHub remote `origin`** (fredefussing/Forma-Estates). Replit checkpoints push to that repo, so code changes reach live automatically within minutes — no Replit publish needed for code.
- The Render app **connects to the Replit-managed PRODUCTION database**. Verified by matching behavior: empty `teams` table + `users` table frozen at the pre-June schema.
- **Consequence:** schema changes made in dev (via psql DDL, since drizzle push blocks) do NOT reach live until the user clicks Publish in Replit — that is the only supported way to migrate the prod DB (publish flow diffs dev→prod). Republishing also resumes the (suspended) Replit deployment, which is harmless for autoscale.

**How to apply:** any "virker i dev men ikke i live" bug → first suspect a stale production DB schema; probe live endpoints with curl (a valid Firebase token can be minted via the identitytoolkit REST API with the public apiKey from the live JS bundle). Fast 500s on user-touching endpoints usually mean "column does not exist".
**Why:** hours were spent discovering this: live signup was broken because the prod `users` table lacked email_verified/verification_code_* /quota columns.

Unknown/unverified: whether Render has SMTP_PASSWORD set (email sending from live untested — schema error fired first).
