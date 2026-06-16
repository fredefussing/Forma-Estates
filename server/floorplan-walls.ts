import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);
const uploadDir = path.join(process.cwd(), "uploads");

export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DollhouseData {
  gridW: number;
  gridH: number;
  rects: WallRect[];
  floorBase64: string;
  floorMime: string;
}

const MAX_INPUT_BYTES = 30_000_000; // 30 MB hård grænse mod oppustede billeder.

// Henter en plantegning til en lokal fil. KUN app-egne /uploads/-billeder
// accepteres: enten direkte fra disk (samme session) eller via vores egen
// server på localhost (som streamer fra R2 efter deploy/cross-session).
// Vilkårlige eksterne URL'er og absolutte filstier afvises bevidst — det fjerner
// SSRF og vilkårlig fil-læsning, og dukkehuset skal alligevel bruge den rene
// 2D-plan, aldrig fal.ai-renderet.
async function resolveToLocalFile(
  urlOrPath: string,
): Promise<{ file: string; cleanup: boolean }> {
  if (!urlOrPath.startsWith("/uploads/")) {
    throw new Error("Ugyldig plantegnings-sti (kun /uploads/ understøttes)");
  }
  // path.basename fjerner enhver mappe-navigation (../) → kan ikke forlade uploadDir.
  const base = path.basename(urlOrPath);
  const local = path.join(uploadDir, base);
  if (fs.existsSync(local)) {
    if (fs.statSync(local).size > MAX_INPUT_BYTES) {
      throw new Error("Plantegningsbillede er for stort");
    }
    return { file: local, cleanup: false };
  }
  // Ikke på disk → hent fra vores egen /uploads/-endpoint (R2-fallback).
  const tmp = path.join(
    os.tmpdir(),
    `wall-input-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await execFileAsync("curl", [
    "-sS",
    "-f",
    "--max-time",
    "30",
    "--max-filesize",
    String(MAX_INPUT_BYTES),
    "-o",
    tmp,
    `http://localhost:5000/uploads/${base}`,
  ]);
  return { file: tmp, cleanup: true };
}

// Find "papir-hvid": gråtone-værdien ved en høj percentil. Robust mod cremede/
// scannede baggrunde, så tærsklen tilpasser sig det enkelte billede.
function brightPercentile(hist: number[], total: number, pct: number): number {
  const goal = total * pct;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= goal) return i;
  }
  return 255;
}

// Morfologisk dilatation (3x3): bygger tynde/brudte vægstreger sammen til ét
// sammenhængende netværk, så de overlever komponent-filtreringen.
function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

// Behold kun de store sammenhængende komponenter (væg-netværket). Isolerede
// klatter — tekst, mål-tal, kompas, møbel-ikoner — falder væk. Beholder
// komponenter der er mindst `ratio` af den største, så adskilte fløje bevares.
// 4-naboskab flood fill.
function keepLargeComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minAbs: number,
  ratio: number,
): void {
  const labels = new Int32Array(w * h);
  const components: number[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1 || labels[start] !== 0) continue;
    const id = components.length + 1;
    stack.length = 0;
    stack.push(start);
    labels[start] = id;
    const cells: number[] = [];
    while (stack.length) {
      const idx = stack.pop()!;
      cells.push(idx);
      const cx = idx % w;
      const cy = (idx / w) | 0;
      if (cx > 0) { const n = idx - 1; if (mask[n] === 1 && labels[n] === 0) { labels[n] = id; stack.push(n); } }
      if (cx < w - 1) { const n = idx + 1; if (mask[n] === 1 && labels[n] === 0) { labels[n] = id; stack.push(n); } }
      if (cy > 0) { const n = idx - w; if (mask[n] === 1 && labels[n] === 0) { labels[n] = id; stack.push(n); } }
      if (cy < h - 1) { const n = idx + w; if (mask[n] === 1 && labels[n] === 0) { labels[n] = id; stack.push(n); } }
    }
    components.push(cells);
  }
  let maxArea = 0;
  for (const c of components) if (c.length > maxArea) maxArea = c.length;
  const keep = Math.max(minAbs, Math.round(maxArea * ratio));
  for (const c of components) {
    if (c.length < keep) {
      for (const idx of c) mask[idx] = 0;
    }
  }
}

// Greedy meshing: dæk væg-masken med så få akse-justerede rektangler som muligt,
// så vi kan bygge få, store BoxGeometry-vægge i stedet for tusindvis af celler.
function greedyMesh(mask: Uint8Array, w: number, h: number): WallRect[] {
  const used = new Uint8Array(w * h);
  const rects: WallRect[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1 || used[i]) continue;
      let rw = 1;
      while (x + rw < w && mask[y * w + x + rw] === 1 && !used[y * w + x + rw]) rw++;
      let rh = 1;
      grow: while (y + rh < h) {
        for (let k = 0; k < rw; k++) {
          const j = (y + rh) * w + x + k;
          if (mask[j] !== 1 || used[j]) break grow;
        }
        rh++;
      }
      for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
          used[(y + dy) * w + x + dx] = 1;
        }
      }
      rects.push({ x, y, w: rw, h: rh });
    }
  }
  return rects;
}

export async function extractFloorplanWalls(
  planUrl: string,
): Promise<DollhouseData> {
  const { file, cleanup } = await resolveToLocalFile(planUrl);
  let tmpClean: string | null = cleanup ? file : null;
  try {
    const { Jimp } = await import("jimp");
    const img = await Jimp.read(file);

    // Nedskalér til et håndterbart grid, men bevar sideforholdet.
    const targetMax = 300;
    const ow = img.bitmap.width;
    const oh = img.bitmap.height;
    const scale = targetMax / Math.max(ow, oh);
    const gridW = Math.max(8, Math.round(ow * scale));
    const gridH = Math.max(8, Math.round(oh * scale));

    const small = img.clone();
    small.resize({ w: gridW, h: gridH });
    const data = small.bitmap.data; // RGBA
    const total = gridW * gridH;

    // Gråtone + histogram.
    const gray = new Uint8Array(total);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < total; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      gray[i] = lum;
      hist[lum]++;
    }

    // Tærskel ift. papir-hvid, så også tynde lysegrå vægstreger fanges (ikke kun
    // de helt sorte). Plantegninger tegnes ofte med grå linjer på hvid bund.
    const paperWhite = brightPercentile(hist, total, 0.9);
    const threshold = Math.max(60, Math.min(Math.round(paperWhite * 0.86), 235));

    // Linjer/vægge = pixels mørkere end papiret.
    let mask = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      mask[i] = gray[i] < threshold ? 1 : 0;
    }

    // Byg brudte/tynde vægstreger sammen til ét netværk …
    mask = dilate(mask, gridW, gridH);
    // … og behold kun de store sammenhængende strukturer (vægge), så tekst,
    // mål-tal, kompas og møbel-ikoner falder fra.
    keepLargeComponents(mask, gridW, gridH, Math.round(total * 0.002), 0.2);

    const rects = greedyMesh(mask, gridW, gridH);

    // Gulv-tekstur: brug selve plantegningen (skarpt, perfekt på linje med vægge).
    const floorBuffer = fs.readFileSync(file);
    const isPng = file.toLowerCase().endsWith(".png");
    const floorMime = isPng ? "image/png" : "image/jpeg";

    return {
      gridW,
      gridH,
      rects,
      floorBase64: floorBuffer.toString("base64"),
      floorMime,
    };
  } finally {
    if (tmpClean) fs.unlink(tmpClean, () => {});
  }
}
