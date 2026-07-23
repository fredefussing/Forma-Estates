// Test: strukturbeskyttelse i BoligPotentiale-prompts
// Sender 5 rigtige rumfotos til Collov med det NYE prompt (STRUCTURAL_PRESERVATION_PREFIX + låst stilprompt)
// og gemmer resultaterne i /tmp/structure-test/ til visuel analyse.
// Kør: npx tsx scripts/test-structure-preservation.ts
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getBoligPrompt } from "../shared/boligPrompts";
import { STRUCTURAL_PRESERVATION_PREFIX } from "../shared/structuralPrompt";

const COLLOV_BASE = "https://api.collov.ai";
const API_KEY = process.env.COLLOV_API_KEY;
const DOMAIN = process.env.REPLIT_DEV_DOMAIN;
if (!API_KEY) { console.error("COLLOV_API_KEY mangler"); process.exit(1); }
if (!DOMAIN) { console.error("REPLIT_DEV_DOMAIN mangler"); process.exit(1); }

const OUT_DIR = "/tmp/structure-test";
fs.mkdirSync(OUT_DIR, { recursive: true });

const TESTS: { name: string; room: string; file: string }[] = [
  { name: "spisestue-rumdeler", room: "dining room", file: "1784809487398-cferev1ep8s.jpeg" },
  { name: "stue-panoramavindue", room: "living room", file: "1784712755569-d4aoio8tcv.jpg" },
  { name: "sovevaerelse-skraavaeg", room: "bedroom", file: "1784712167259-12f4caiur9tj.JPG" },
  { name: "koekken-glasvaeg", room: "kitchen", file: "1784712239799-67ryvgzr9i2.jpeg" },
  { name: "badevaerelse-blaa-fliser", room: "bathroom", file: "1784713048738-7ldf88j451u.jpg" },
];

function curl(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("curl", ["-s", "--max-time", "60", ...args]);
    let out = "", err = "";
    p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (err += d));
    p.on("close", code => (code === 0 ? resolve(out) : reject(new Error(`curl exit ${code}: ${err}`))));
  });
}

async function runOne(t: { name: string; room: string; file: string }) {
  const stylePrompt = getBoligPrompt(t.room, "scandinavian", "tier2");
  const prompt = STRUCTURAL_PRESERVATION_PREFIX + stylePrompt;
  const uploadUrl = `https://${DOMAIN}/uploads/${t.file}`;

  console.log(`[${t.name}] start — prompt ${prompt.length} tegn, upload=${uploadUrl}`);

  const genRaw = await curl([
    "-X", "POST", `${COLLOV_BASE}/flair/enterpriseApi/edit/generate`,
    "-H", `apiKey: ${API_KEY}`,
    "-F", `uploadUrl=${uploadUrl}`,
    "-F", `prompt=${prompt}`,
  ]);
  let gen: any;
  try { gen = JSON.parse(genRaw); } catch { throw new Error(`[${t.name}] ugyldigt svar: ${genRaw.slice(0, 200)}`); }
  if (!gen.success || !gen.data?.uuid) throw new Error(`[${t.name}] generate fejlede: ${gen.message || genRaw.slice(0, 200)}`);
  const uuid = gen.data.uuid;
  console.log(`[${t.name}] uuid=${uuid} — poller…`);

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollRaw = await curl(["-H", `apiKey: ${API_KEY}`, `${COLLOV_BASE}/flair/enterpriseApi/edit/getRecord?uuid=${encodeURIComponent(uuid)}`]);
    let poll: any;
    try { poll = JSON.parse(pollRaw); } catch { continue; }
    const status = poll.data?.status;
    if (status === "SUCCESS" && poll.data?.generateUrl) {
      const dest = path.join(OUT_DIR, `${t.name}-after.jpg`);
      await curl(["-L", "-o", dest, poll.data.generateUrl]);
      console.log(`[${t.name}] FÆRDIG → ${dest} (${poll.data.generateUrl})`);
      return { name: t.name, ok: true, url: poll.data.generateUrl };
    }
    if (status === "FAILED") throw new Error(`[${t.name}] FAILED: ${poll.data?.failReason || "ukendt"}`);
  }
  throw new Error(`[${t.name}] timeout efter 180s`);
}

(async () => {
  const results = await Promise.allSettled(TESTS.map(runOne));
  let ok = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") { ok++; }
    else console.error(`FEJL: ${TESTS[i].name}: ${r.reason?.message || r.reason}`);
  });
  console.log(`\n=== ${ok}/${TESTS.length} genereringer lykkedes ===`);
  process.exit(ok === TESTS.length ? 0 : 1);
})();
