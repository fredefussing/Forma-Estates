import * as fs from "fs";
import * as path from "path";

let lockedPrompts: Record<string, string> | null = null;

function getLock(): Record<string, string> {
  if (!lockedPrompts) {
    const lockPath = path.resolve(process.cwd(), "shared/promptLock.json");
    lockedPrompts = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  }
  return lockedPrompts!;
}

function normalizeRoom(room: string): string {
  return room.trim().toLowerCase().replace(/\s+/g, "_");
}

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
  // Normalize room — try both original and alias-resolved version
  const roomKey = normalizeRoom(room);
  const key = `${style.toLowerCase()}/${roomKey}/${tier}`;

  const expected = lock[key];

  if (expected === undefined) {
    // Key not in lock — this is a new/unsupported combo using generic fallback.
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

// ── Lås for strukturbeskyttelses-prefixet ────────────────────────────────────
// Prefixet er gemt i promptLock.json under nøglen nedenfor. Kaldes ved HVER
// generering — hvis prefixet i koden afviger med bare ét tegn fra den låste
// version, stoppes genereringen med PROMPT_INTEGRITY_VIOLATION.
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
