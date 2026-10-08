import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { getAllBoligPrompts, normalizeBoligRoom } from "../shared/boligPrompts";
import { IMAGE_PROMPT_COMMON } from "../shared/canonicalImagePrompt";
import { SCANDINAVIAN_EXCLUSIVE_DIRECTION, SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION } from "../shared/scandinavianExclusiveDirection";
import { MODERN_EXCLUSIVE_TEMPLATE, MODERN_EXCLUSIVE_ROOM_APPLICATIONS, MODERN_EXCLUSIVE_RENOVATION_INVENTORIES } from "../shared/modernExclusivePrompt";
import { STANDARD_TIER2_REVISION } from "../shared/standardTier2Renovation";

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
const LOCK_FILE_SHA256 = "d541e7faed2e9199cd045121995902374124632cc8c127465663e31683b0798b";
// Separately approved style refinement; update only with an intentional revision.
const EXCLUSIVE_DIRECTION_SHA256 = "a5049dfe3a3eb982377f3d4a34eff5106d3a41234ac20cc935d65c1ccdf7291a";
const SCANDINAVIAN_BATHROOM_RENOVATION_SHA256 = "b057c5c1c0365bf6fddf28de2b840cc4e7a29e3e8cc681e827a8c75594c8456e";
const MODERN_EXCLUSIVE_SHA256 = "ec67aa2d567712e10de59d58d2d42d1f41628b796a0360321177707e5c9b5ee3";
const STANDARD_TIER2_SHA256 = "227babe87cdeaa0e41f2f608e372bd3ab381b629c80df3b944a4ead3e570010b";

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
  return normalizeBoligRoom(room).replace(/\s+/g, "_");
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
  const lock = getLock();
  const common = {
    __canonical_integrity__: IMAGE_PROMPT_COMMON.image_integrity_and_realism,
    __canonical_furnishing_scope__: IMAGE_PROMPT_COMMON.edit_scopes.furnishing_only,
    __canonical_renovation_scope__: IMAGE_PROMPT_COMMON.edit_scopes.renovation_visualization,
    __canonical_conflicts__: IMAGE_PROMPT_COMMON.conflict_resolution,
  };
  for (const [key, text] of Object.entries(common)) {
    if (lock[key] !== text) throw new Error(`PROMPT_INTEGRITY_VIOLATION: ${key}`);
  }
  if (crypto.createHash("sha256").update(SCANDINAVIAN_EXCLUSIVE_DIRECTION).digest("hex") !== EXCLUSIVE_DIRECTION_SHA256) {
    throw new Error("PROMPT_INTEGRITY_VIOLATION: Scandinavian Exclusive direction");
  }
  if (crypto.createHash("sha256").update(SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION).digest("hex") !== SCANDINAVIAN_BATHROOM_RENOVATION_SHA256) {
    throw new Error("PROMPT_INTEGRITY_VIOLATION: Scandinavian Exclusive bathroom renovation");
  }
  const modernSource = JSON.stringify({ template: MODERN_EXCLUSIVE_TEMPLATE, rooms: MODERN_EXCLUSIVE_ROOM_APPLICATIONS, inventories: MODERN_EXCLUSIVE_RENOVATION_INVENTORIES });
  if (crypto.createHash("sha256").update(modernSource).digest("hex") !== MODERN_EXCLUSIVE_SHA256) {
    throw new Error("PROMPT_INTEGRITY_VIOLATION: Modern Exclusive room profiles");
  }
  if (crypto.createHash("sha256").update(JSON.stringify(STANDARD_TIER2_REVISION)).digest("hex") !== STANDARD_TIER2_SHA256) {
    throw new Error("PROMPT_INTEGRITY_VIOLATION: Standard tier2 renovation profiles");
  }
  // Reject mixed source/lock releases at boot, before a customer spends quota.
  for (const preset of getAllBoligPrompts()) {
    assertPromptLocked(preset.room, preset.style, preset.tier, preset.prompt);
  }
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
  const key = `${style.toLowerCase().trim()}/${roomKey}/${tier}`;

  const expected = lock[key];

  if (expected === undefined) {
    // Unsupported combinations must never silently substitute another preset.
    throw new Error(`PROMPT_INTEGRITY_VIOLATION: Ingen låst reference for "${key}"`);
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
