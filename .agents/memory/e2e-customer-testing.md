---
name: E2E customer-journey testing on this app
description: How to run realistic new-customer tests (signup verification bypass) and why tester claims must be checked against the DB
---

## Test signups (dev)
- Signup gates on `users.email_verified` (Postgres), not Firebase's flag. The 6-digit code is SHA-256 hashed in DB — unreadable. Bypass for test accounts: `UPDATE users SET email_verified = true WHERE email ILIKE '<test email>'` (emails are stored lowercased).
- Free trial: 2 AI images (`FREE_TRIAL_QUOTAS.ai`), everything else 0. `quota_ai_visualizations` NULL means "use trial default".

## Verify tester claims against the DB
The Playwright testing subagent twice misreported generation outcomes: it claimed a design-agent generation "was blocked by quota" while `generated_images` showed it completed seconds earlier (its own generation had consumed the quota). **Why:** the tester infers from UI state after the fact and can rationalize; `generated_images` rows + `used_*` counters are ground truth. **How to apply:** after any generation test, check `generated_images` (user_id, created_at, is_design_agent, image_url) before believing "failed/blocked" — and before reporting quota bugs.

## Trial gating is entry-point dependent
Sidebar "AI Design Agent" page hard-paywalls non-subscribers (`subscriptionStatus === "active"`) even with trial quota left, while the dashboard quick-generation flow lets trial users run design-agent images. Same backend feature, different client gates — remember when interpreting "paywall" reports.
