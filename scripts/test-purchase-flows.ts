// Automated purchase-flow tests. Run with: npx tsx scripts/test-purchase-flows.ts
// Uses the dev database + real storage/purchases modules. NO AI calls, NO emails.
process.env.SMTP_PASSWORD = ""; // hard-disable outgoing mail for this run

const { storage } = await import("../server/storage");
const { pool } = await import("../server/db");
const { claimAndGrant, claimPendingPurchasesForUser, isStripeSessionProcessed } = await import("../server/purchases");

const TEST_DOMAIN = "fe-test.local";
let pass = 0;
const failures: string[] = [];

function check(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ FAIL: ${msg}`); }
}

async function userRow(id: number) {
  return (await pool.query(`SELECT * FROM users WHERE id=$1`, [id])).rows[0];
}

async function mkUser(name: string) {
  return storage.createUser({
    email: `${name}@${TEST_DOMAIN}`,
    firebaseUid: `test-uid-${name}-${Date.now()}`,
    displayName: name,
    creditsRemaining: 0,
    totalCreditsUsed: 0,
  } as any);
}

async function cleanup() {
  await pool.query(`DELETE FROM pending_purchases WHERE email LIKE '%@${TEST_DOMAIN}' OR external_id LIKE 'stripe:test\\_%' OR external_id LIKE 'shopify:test\\_%'`);
  await pool.query(`DELETE FROM credit_transactions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@${TEST_DOMAIN}')`);
  await pool.query(`DELETE FROM team_members WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@${TEST_DOMAIN}') OR team_id IN (SELECT id FROM teams WHERE owner_user_id IN (SELECT id FROM users WHERE email LIKE '%@${TEST_DOMAIN}'))`);
  await pool.query(`DELETE FROM teams WHERE owner_user_id IN (SELECT id FROM users WHERE email LIKE '%@${TEST_DOMAIN}')`);
  await pool.query(`DELETE FROM users WHERE email LIKE '%@${TEST_DOMAIN}'`);
}

await cleanup();

// ── T1: Subscription bought BEFORE signup → auto-claimed at account creation ──
console.log("\nT1: Pre-signup Pro subscription auto-claims at signup");
await storage.upsertPendingPurchase({
  provider: "stripe",
  externalId: "stripe:test_sub_1",
  email: `Anna@${TEST_DOMAIN}`, // uppercase on purpose — matching must be case-insensitive
  kind: "subscription",
  payload: { tier: "pro", amountTotal: 74900 },
});
const anna = await mkUser("anna");
const annaGrants = await claimPendingPurchasesForUser({ id: anna.id, email: anna.email });
check(annaGrants.length === 1 && annaGrants[0].kind === "subscription", "exactly one subscription granted");
let a = await userRow(anna.id);
check(a.subscription_tier === "pro" && a.subscription_status === "active", "tier is pro + active");
check(a.quota_ai_visualizations === 25 && a.quota_floor_plans === 5 && a.quota_transform_videos === 5 && a.quota_showcase_videos === 3, "exact Pro quotas 25/5/5/3");
check(a.used_ai_visualizations === 0 && a.used_floor_plans === 0, "usage counters start at 0");
check(a.quota_resets_at !== null, "subscription has a monthly reset date");
check(await isStripeSessionProcessed("test_sub_1"), "session marked processed in ledger");

// ── T2: The SAME payment can never activate a second account ──
console.log("\nT2: Same Stripe session cannot be claimed by a second account");
const bob = await mkUser("bob");
const bobGrant = await claimAndGrant("stripe:test_sub_1", bob.id);
check(bobGrant === null, "second claim returns null (already claimed)");
const b = await userRow(bob.id);
check(b.subscription_tier === null && b.quota_ai_visualizations === null, "second account got nothing");
const bobByEmail = await claimPendingPurchasesForUser({ id: bob.id, email: bob.email });
check(bobByEmail.length === 0, "email-based claim also grants nothing");

// ── T3: One-time custom package → exact amounts, tier custom, NO monthly renewal ──
console.log("\nT3: Custom package grants exactly what was bought, never renews");
const carl = await mkUser("carl");
await storage.upsertPendingPurchase({
  provider: "stripe",
  externalId: "stripe:test_pkg_1",
  email: carl.email,
  kind: "package",
  payload: { aiVisual: 7, plan3d: 2, transformVideo: 0, showcase: 1, amountTotal: 180000 },
});
const carlGrant = await claimAndGrant("stripe:test_pkg_1", carl.id);
check(carlGrant?.kind === "package", "package granted");
let c = await userRow(carl.id);
check(c.quota_ai_visualizations === 7 && c.quota_floor_plans === 2 && c.quota_transform_videos === 0 && c.quota_showcase_videos === 1, "exact package amounts 7/2/0/1");
check(c.subscription_tier === "custom" && c.subscription_status === "active", "account activated as custom");
check(c.quota_resets_at === null, "NO reset date — one-time package never renews");
const carlAgain = await claimAndGrant("stripe:test_pkg_1", carl.id);
check(carlAgain === null, "re-claiming the same package grants nothing");
c = await userRow(carl.id);
check(c.quota_ai_visualizations === 7, "quota unchanged after duplicate claim attempt");

// ── T4: Package top-up for an active Pro subscriber → stays Pro, adds on top ──
console.log("\nT4: Top-up package for a Pro subscriber adds on top, keeps Pro");
const resetsBefore = a.quota_resets_at;
await storage.upsertPendingPurchase({
  provider: "stripe",
  externalId: "stripe:test_pkg_2",
  email: anna.email,
  kind: "package",
  payload: { aiVisual: 10, plan3d: 0, transformVideo: 0, showcase: 0, amountTotal: 100000 },
});
await claimAndGrant("stripe:test_pkg_2", anna.id);
a = await userRow(anna.id);
check(a.subscription_tier === "pro", "tier stays pro (not downgraded to custom)");
check(a.quota_ai_visualizations === 35, "AI quota 25+10=35");
check(a.quota_floor_plans === 5 && a.quota_showcase_videos === 3, "other quotas untouched");
check(String(a.quota_resets_at) === String(resetsBefore), "subscription reset date unchanged by top-up");

// ── T5: Monthly reset restores tier base + carries over ONLY unused top-up ──
console.log("\nT5: Monthly reset refills Pro base, carries unused top-up, never re-inflates");
await pool.query(`UPDATE users SET used_ai_visualizations=30, quota_resets_at=NOW() - INTERVAL '1 day' WHERE id=$1`, [anna.id]);
const t5res = await storage.checkAndIncrementQuota(anna.id, "ai");
check(t5res.allowed === true, "usage allowed after period reset");
a = await userRow(anna.id);
// quota was 35 (25 base + 10 top-up), 30 used → 5 unused → new quota 25 + 5 = 30
check(a.quota_ai_visualizations === 30, `reset quota = base 25 + 5 unused top-up (got ${a.quota_ai_visualizations})`);
check(a.used_ai_visualizations === 1, "usage reset to 0, then +1 for this generation");
check(new Date(a.quota_resets_at) > new Date(), "next reset date pushed a month ahead");

// ── T6: Custom-only user is blocked when exhausted — no silent renewal ──
console.log("\nT6: Custom package user gets blocked at cap, quota never refills");
await pool.query(`UPDATE users SET used_ai_visualizations=7 WHERE id=$1`, [carl.id]);
const t6res = await storage.checkAndIncrementQuota(carl.id, "ai");
check(t6res.allowed === false, "blocked when all 7 purchased visualizations used");
c = await userRow(carl.id);
check(c.quota_ai_visualizations === 7 && c.used_ai_visualizations === 7 && c.quota_resets_at === null, "quota/usage untouched, still no reset date");

// ── T7: Team sharing with a CUSTOM-package owner (the Jørgen/Peter case) ──
console.log("\nT7: Member usage draws down custom-package owner's shared pool");
const jorgen = await mkUser("jorgen");
await storage.upsertPendingPurchase({
  provider: "stripe",
  externalId: "stripe:test_pkg_3",
  email: jorgen.email,
  kind: "package",
  payload: { aiVisual: 3, plan3d: 0, transformVideo: 0, showcase: 0, amountTotal: 30000 },
});
await claimAndGrant("stripe:test_pkg_3", jorgen.id);
const team = await storage.createTeam("Test Ejendomme", jorgen.id);
const peter = await mkUser("peter");
await storage.addTeamMember({ teamId: team.id, userId: peter.id, role: "user" } as any);

const p1 = await storage.checkAndIncrementQuota(peter.id, "ai");
check(p1.allowed === true && p1.remaining === 2, "Peter's 1st use allowed, 2 remaining in shared pool");
let j = await userRow(jorgen.id);
check(j.used_ai_visualizations === 1, "Jørgen's (owner) used counter increased by Peter's usage");
const peterView = await storage.getUserQuota(peter.id);
check(peterView.ai.limit === 3 && peterView.ai.used === 1, "Peter SEES the shared pool: 1 of 3 used");
const jorgenView = await storage.getUserQuota(jorgen.id);
check(jorgenView.ai.limit === 3 && jorgenView.ai.used === 1, "Jørgen sees the same pool state");
const pBlockedFeature = await storage.checkAndIncrementQuota(peter.id, "floorPlan");
check(pBlockedFeature.allowed === false, "feature the owner never bought is blocked for members");

const j1 = await storage.checkAndIncrementQuota(jorgen.id, "ai"); // owner uses own pool
const p2 = await storage.checkAndIncrementQuota(peter.id, "ai");
check(j1.allowed === true && p2.allowed === true, "pool supports mixed owner+member usage up to cap");
const p3 = await storage.checkAndIncrementQuota(peter.id, "ai");
check(p3.allowed === false, "4th use blocked — pool of 3 exhausted");
const j2 = await storage.checkAndIncrementQuota(jorgen.id, "ai");
check(j2.allowed === false, "owner also blocked once shared pool is empty");
j = await userRow(jorgen.id);
check(j.used_ai_visualizations === 3, "owner counter exactly 3 — no over-spend");

// ── T8: Team sharing with a subscription-tier owner ──
console.log("\nT8: Member of a Pro-subscription owner shares the Pro pool");
const dorte = await mkUser("dorte");
await storage.upsertPendingPurchase({
  provider: "stripe",
  externalId: "stripe:test_sub_2",
  email: dorte.email,
  kind: "subscription",
  payload: { tier: "pro", amountTotal: 74900 },
});
await claimAndGrant("stripe:test_sub_2", dorte.id);
const team2 = await storage.createTeam("Dorte Bolig", dorte.id);
const erik = await mkUser("erik");
await storage.addTeamMember({ teamId: team2.id, userId: erik.id, role: "user" } as any);
const e1 = await storage.checkAndIncrementQuota(erik.id, "showcase");
check(e1.allowed === true && e1.remaining === 2, "member showcase use allowed, 2 of 3 remaining");
const d = await userRow(dorte.id);
check(d.used_showcase_videos === 1, "owner's showcase counter charged");

// ── T9: Shopify webhook idempotency + pre-signup claim ──
console.log("\nT9: Shopify order dedupes and auto-claims at signup");
const s1 = await storage.upsertPendingPurchase({
  provider: "shopify",
  externalId: "shopify:test_ord_1",
  email: `heidi@${TEST_DOMAIN}`,
  kind: "shopify_credits",
  payload: { packageName: "Pro", images: 25, price: 1495, tierKey: "pro" },
});
const s2 = await storage.upsertPendingPurchase({
  provider: "shopify",
  externalId: "shopify:test_ord_1",
  email: `heidi@${TEST_DOMAIN}`,
  kind: "shopify_credits",
  payload: { packageName: "Pro", images: 25, price: 1495, tierKey: "pro" },
});
check(s1.inserted === true && s2.inserted === false, "duplicate webhook delivery detected (inserted=false)");
const heidi = await mkUser("heidi");
const heidiGrants = await claimPendingPurchasesForUser({ id: heidi.id, email: heidi.email });
check(heidiGrants.length === 1 && heidiGrants[0].kind === "shopify_credits", "Shopify purchase auto-claimed at signup");
const h = await userRow(heidi.id);
check(h.credits_remaining === 25, "exactly 25 credits granted");
check(h.subscription_status === "active" && h.subscription_tier === "pro", "Shopify tier activated");

// ── Summary ──
await cleanup();
console.log(`\n${"=".repeat(50)}\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
}
process.exit(0);
