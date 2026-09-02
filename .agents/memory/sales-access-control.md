---
name: Sales access is server-authoritative
description: How Leads and Tele-salg access must be exposed without leaking the owner's private sales pipeline to ordinary customers.
---

Leads and Tele-salg permissions must come from the verified backend user record and be returned as explicit access flags during auth/credit refresh. Do not rely only on browser-side email checks.

**Why:** Staff access could disappear when the browser identity was stale even though the backend allowlist was correct. Subscription plans are customer entitlements and must never implicitly expose the owner's private sales pipeline.

**How to apply:** When adding a sales collaborator, update the backend allowlist and shared-owner mapping. Keep the API guards authoritative, return the permission flags from login and periodic account refreshes, and let the dashboard render from those flags.