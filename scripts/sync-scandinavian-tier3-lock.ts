import fs from "node:fs/promises";
import crypto from "node:crypto";
import { getAllBoligPrompts } from "../shared/boligPrompts";
import { IMAGE_PROMPT_COMMON } from "../shared/canonicalImagePrompt";

// Regenerate the approved data manifest, never edit the integrity guard itself.
// The supplied complete revision explicitly authorizes the entire preset matrix.
async function main() {
  const file = "shared/promptLock.json";
  const before: Record<string, string> = JSON.parse(await fs.readFile(file, "utf8"));
  const after: Record<string, string> = Object.fromEntries(Object.entries(before).filter(([key]) => key.startsWith("__")));
  const changed: string[] = [];
  for (const entry of getAllBoligPrompts()) {
    const key = `${entry.style}/${entry.room.replace(/\s+/g, "_")}/${entry.tier}`;
    if (before[key] !== entry.prompt) changed.push(key);
    after[key] = entry.prompt;
  }
  after.__canonical_integrity__ = IMAGE_PROMPT_COMMON.image_integrity_and_realism;
  after.__canonical_furnishing_scope__ = IMAGE_PROMPT_COMMON.edit_scopes.furnishing_only;
  after.__canonical_renovation_scope__ = IMAGE_PROMPT_COMMON.edit_scopes.renovation_visualization;
  after.__canonical_conflicts__ = IMAGE_PROMPT_COMMON.conflict_resolution;
  const content = JSON.stringify(after, null, 2) + "\n";
  await fs.writeFile(file, content);
  console.log(JSON.stringify({ changedKeys: changed.length, sha256: crypto.createHash("sha256").update(content).digest("hex") }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
