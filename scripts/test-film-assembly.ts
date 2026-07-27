// Gratis validering af Forvandlingsfilm-sammensætningen: bruger et allerede
// downloadet morph-klip (duplikeret ×2) i stedet for betalte fal-kald.
// Kør: npx tsx scripts/test-film-assembly.ts
import fs from "fs";
import path from "path";
import { assembleFilmFromClips } from "../server/showcase";

async function main() {
  const src = path.join(process.cwd(), "uploads", "1785157761404-0gg7p8sxb98.mp4");
  if (!fs.existsSync(src)) throw new Error(`Testklip mangler: ${src}`);
  const a = path.join(process.cwd(), "uploads", "film-test-a.mp4");
  const b = path.join(process.cwd(), "uploads", "film-test-b.mp4");
  fs.copyFileSync(src, a);
  fs.copyFileSync(src, b);
  try {
    const t0 = Date.now();
    const url = await assembleFilmFromClips([a, b], path.join(process.cwd(), "uploads"), "Testvej 1, 2900 Hellerup", "calm");
    console.log(`OK: ${url} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    const out = path.join(process.cwd(), "uploads", path.basename(url));
    const st = fs.statSync(out);
    console.log(`Fil: ${(st.size / 1e6).toFixed(1)} MB`);
  } finally {
    fs.unlinkSync(a);
    fs.unlinkSync(b);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("FEJL:", e?.message || e); process.exit(1); });
