/**
 * Test-only helpers for the repeatable capacity harness.
 *
 * These paths are deliberately impossible to enable in production. They let
 * the harness exercise authenticated HTTP, uploads, database writes, quota
 * checks and the local showcase queue without calling paid AI providers.
 */
const LOAD_TEST_TOKEN = /^load-test:([a-z0-9-]{1,80})$/;

export function isLoadTestMode(): boolean {
  return process.env.NODE_ENV === "test" && process.env.LOAD_TEST_MODE === "1";
}

export function getLoadTestIdentity(token: string): {
  uid: string;
  email: string;
  name: string;
  emailVerified: true;
} | null {
  if (!isLoadTestMode()) return null;
  const match = LOAD_TEST_TOKEN.exec(token);
  if (!match) return null;

  const id = match[1];
  return {
    uid: `load-test-${id}`,
    email: `load-test-${id}@loadtest.invalid`,
    name: `Load test ${id}`,
    emailVerified: true,
  };
}

export function getLoadTestRenderDelayMs(): number {
  const parsed = Number.parseInt(process.env.LOAD_TEST_RENDER_DELAY_MS ?? "100", 10);
  return Number.isFinite(parsed) ? Math.max(20, Math.min(parsed, 1_000)) : 100;
}