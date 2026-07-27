---
name: Structural prompt lock sync
description: Editing shared/structuralPrompt.ts requires syncing shared/promptLock.json or ALL generations hard-fail
---

`server/promptGuard.ts` (`assertStructuralPrefixLocked`) compares `STRUCTURAL_PRESERVATION_PREFIX` from `shared/structuralPrompt.ts` against `shared/promptLock.json` key `__structural_preservation_prefix__` at generation time and **throws on any byte difference — bricking every staging/design generation** (dev AND prod, since the lock file ships with the repo).

**Why:** Integrity guard against accidental prompt drift; discovered when tightening the prefix 2026-07-27.

**How to apply:** After editing the prefix, sync + verify in one step (lock file is 2-space JSON with trailing newline):

```bash
npx tsx -e "
import { STRUCTURAL_PRESERVATION_PREFIX } from './shared/structuralPrompt';
import * as fs from 'fs';
const p='shared/promptLock.json';
const l=JSON.parse(fs.readFileSync(p,'utf8'));
l['__structural_preservation_prefix__']=STRUCTURAL_PRESERVATION_PREFIX;
fs.writeFileSync(p, JSON.stringify(l,null,2)+'\n');
console.log('MATCH:', JSON.parse(fs.readFileSync(p,'utf8'))['__structural_preservation_prefix__']===STRUCTURAL_PRESERVATION_PREFIX);
"
```

MATCH must print `true`; then restart the workflow (guard caches the lock in module state). Other lock keys are per-style prompts and do NOT embed the prefix (verified) — only the one key needs sync.

Related: generation-success side effects are duplicated per flow (upload / season / regen / video / design agent) — each must invalidate queries AND `window.dispatchEvent(new Event("quota:refresh"))`, or trial-UI (onboarding card, banner counts) goes stale until the 30s poll.
