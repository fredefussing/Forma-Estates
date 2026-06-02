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
  const roomKey = normalizeRoom(room);
  const key = `${style.toLowerCase()}/${roomKey}/${tier}`;

  const expected = lock[key];

  if (expected === undefined) {
    throw new Error(
      `[PROMPT_GUARD] Ingen låst prompt fundet for nøgle "${key}". ` +
      `Stil="${style}", rum="${room}", tier="${tier}". ` +
      `Genereringen er stoppet.`,
    );
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

function firstDiff(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}
