---
name: Email deliverability debugging (Brevo)
description: How to debug "user never got the activation/reset mail" and the known DNS/reputation gaps for formaestates.com
---

# "User didn't get the email" — debug via Brevo API, not code

**Rule:** When a user reports a missing activation/reset mail, first query Brevo's transactional log — the code path is almost never the problem.
- `GET https://api.brevo.com/v3/smtp/emails?email=<addr>` (was it sent?) and `GET /v3/smtp/statistics/events?email=<addr>&days=30` (was it delivered/deferred/bounced + reason). `api-key: $BREVO_API_KEY` header; curl from shell (dig is absent — use Cloudflare DoH `https://cloudflare-dns.com/dns-query?name=X&type=TXT` with `accept: application/dns-json` for DNS checks).
- An `opened` event seconds after `requests` on a corporate domain is a security-gateway pixel prefetch, NOT the human opening it.

**Known findings (Aug 2026):**
- Strict corporate mail servers (e.g. mail.hentsch.ch) time out Brevo's connections → deferred → softBounce; mail never arrives. Recipient-side; workaround = private address (that user self-solved via iCloud) or their IT whitelists the sender.
- SPF TXT for formaestates.com is `v=spf1 include:secureserver.net -all` — **Brevo is missing** (`include:spf.brevo.com`). DKIM (brevo1/brevo2 CNAMEs) + brevo-code TXT are in place, DMARC is `p=quarantine`. Gmail intermittently throttles with `421-4.7.28 unusual rate ... your SPF`; some mails softBounce after the 36h retry window. Fix is a DNS edit (GoDaddy per Brevo) — user action, agent cannot change DNS.
- Brevo free plan: 300 mails/day shared IPs; shared-IP reputation is a standing risk.

**Why:** hours saved — the "old user / legacy pending_ uid" theory was disproven in minutes by the Brevo log (7 codes sent, 0 delivered to hentsch.ch). Legacy `pending_*` firebase_uid rows link fine on signup.

**How to apply:** any missing-email report → Brevo events first, then DNS (SPF/DKIM/DMARC via DoH), then recipient-domain MX behavior. Remember the Replit "production" DB replica is STALE for this project (live DB is Render's own Postgres) — never diagnose live data from it.
