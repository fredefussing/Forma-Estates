import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// ██████████████████████████  PROMPT LOCK SYSTEM  ██████████████████████████████
// ═══════════════════════════════════════════════════════════════════════════════
//
//  DO NOT EDIT shared/promptLock.json without updating LOCK_FILE_SHA256 below.
//  DO NOT EDIT shared/boligPrompts.ts bathroom sections without updating the lock.
//  DO NOT EDIT shared/styleVocabulary.ts bathroom sections without updating the lock.
//  DO NOT EDIT shared/structuralPrompt.ts without updating the lock.
//
//  To change ANY prompt legally:
//    1. Edit the source file (boligPrompts.ts / styleVocabulary.ts)
//    2. Edit promptLock.json to match exactly
//    3. Recompute SHA-256 of promptLock.json and update LOCK_FILE_SHA256 below
//    4. Restart the server — it will refuse to boot if anything is out of sync
//
//  To recompute SHA-256:
//    node -e "const c=require('crypto'),f=require('fs');
//             console.log(c.createHash('sha256').update(f.readFileSync('shared/promptLock.json')).digest('hex'));"
//
// ═══════════════════════════════════════════════════════════════════════════════

// ── SHA-256 of shared/promptLock.json — computed 2026-07-28 ──────────────────
// If this does not match the file on disk the server WILL NOT START.
const LOCK_FILE_SHA256 = "284d36ead469779fc28631174d089d19d5f999f0a1c08e5917a6fb62afb2bbf9";

let lockedPrompts: Record<string, string> | null = null;

function getLockPath(): string {
  return path.resolve(process.cwd(), "shared/promptLock.json");
}

function getLock(): Record<string, string> {
  if (!lockedPrompts) {
    const raw = fs.readFileSync(getLockPath(), "utf8");
    lockedPrompts = JSON.parse(raw);
  }
  return lockedPrompts!;
}

function normalizeRoom(room: string): string {
  return room.trim().toLowerCase().replace(/\s+/g, "_");
}

// ── LAYER 1: Lock-file checksum — called once at server startup ───────────────
// Verifies that promptLock.json has not been modified since the last intentional
// prompt update. Any change to the file (even whitespace) will fail this check
// and prevent the server from starting.
export function assertLockFileIntegrity(): void {
  const raw = fs.readFileSync(getLockPath());
  const actual = crypto.createHash("sha256").update(raw).digest("hex");

  if (actual !== LOCK_FILE_SHA256) {
    const msg =
      `\n${"═".repeat(72)}\n` +
      `  PROMPT LOCK VIOLATION — SERVER STARTUP BLOCKED\n` +
      `  shared/promptLock.json has been modified without updating LOCK_FILE_SHA256\n` +
      `  Expected SHA-256: ${LOCK_FILE_SHA256}\n` +
      `  Actual   SHA-256: ${actual}\n\n` +
      `  To fix: update LOCK_FILE_SHA256 in server/promptGuard.ts to the actual value\n` +
      `  above — but ONLY after intentionally approving the prompt changes.\n` +
      `${"═".repeat(72)}\n`;
    console.error(msg);
    throw new Error("PROMPT_LOCK_FILE_INTEGRITY_VIOLATION");
  }

  console.log(`[prompt-guard] ✓ promptLock.json integrity verified (SHA-256 match)`);
}

// ── LAYER 2: Per-request prompt check ────────────────────────────────────────
export interface PromptViolation {
  style: string;
  room: string;
  tier: string;
  lockKey: string;
  expected: string;
  actual: string;
}

export function assertPromptLocked(
  room: string,
  style: string,
  tier: string,
  actualPrompt: string,
): void {
  const lock = getLock();
  const roomKey = normalizeRoom(room);
  const key = `${style.toLowerCase()}/${roomKey}/${tier}`;

  const expected = lock[key];

  if (expected === undefined) {
    // Key not in lock — new/unsupported combo using generic fallback.
    // Log a warning but do NOT block generation.
    console.warn(`[PROMPT_GUARD] Ingen låst reference for "${key}" — tillader generering med fallback-prompt.`);
    return;
  }

  if (actualPrompt !== expected) {
    const violation: PromptViolation = { style, room, tier, lockKey: key, expected, actual: actualPrompt };
    const msg =
      `[PROMPT_GUARD] PROMPT-AFVIGELSE OPDAGET — generering stoppet!\n` +
      `  Nøgle:    ${key}\n` +
      `  Forventet: ${expected}\n` +
      `  Faktisk:   ${actualPrompt}\n` +
      `  Første forskel ved tegn ${firstDiff(expected, actualPrompt)}`;
    console.error(msg);
    throw Object.assign(new Error(msg), { violation });
  }
}

// ── LAYER 3: Structural prefix integrity ─────────────────────────────────────
const STRUCTURAL_PREFIX_LOCK_KEY = "__structural_preservation_prefix__";

export function assertStructuralPrefixLocked(actualPrefix: string): void {
  const lock = getLock();
  const expected = lock[STRUCTURAL_PREFIX_LOCK_KEY];

  if (expected === undefined) {
    const msg =
      `[PROMPT_GUARD] STRUKTURBESKYTTELSE MANGLER I LÅSEN (nøgle "${STRUCTURAL_PREFIX_LOCK_KEY}") — generering stoppet!`;
    console.error(msg);
    throw new Error(msg);
  }

  if (actualPrefix !== expected) {
    const msg =
      `[PROMPT_GUARD] STRUKTURBESKYTTELSE ÆNDRET — generering stoppet!\n` +
      `  Første forskel ved tegn ${firstDiff(expected, actualPrefix)}\n` +
      `  Forventet længde: ${expected.length}, faktisk længde: ${actualPrefix.length}`;
    console.error(msg);
    throw new Error(msg);
  }
}

function firstDiff(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}
