#!/usr/bin/env node
/**
 * OVERNIGHT TAGGING — Nordic Homebuild AI
 * Kører stabilt natten over uden rate limits
 *
 * Brug:
 *   node scripts/tag-overnight.mjs
 *
 * - KUN navn-parsing (gratis, ingen API)
 * - Ingen rate limits — kører 50.000 på ~2 timer
 * - Logger til tagging-overnight.log
 * - Gemmer progress — kan genoptages hvis den crasher
 */

import pg from "pg";
import fs from "fs";
import { config } from "dotenv";

config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const LOG_FILE = "tagging-overnight.log";
const PROGRESS_FILE = "tagging-progress.json";

const CONFIG = {
  BATCH_SIZE: 500,
  PAUSE_MS: 100,
  SAVE_EVERY: 10,
  TARGET: parseInt(process.env.TAG_TARGET || "50000"),
};

// ─── Parsing maps (identisk med server/tagProducts.ts) ────────────────────────

const COLOR_MAP = {
  "hvid": "white", "hvidt": "white", "off-white": "off_white",
  "sort": "black", "sorte": "black",
  "grå": "gray", "lysegrå": "light_gray", "mørkegrå": "dark_gray", "antracit": "anthracite",
  "beige": "beige", "sand": "beige", "ecru": "beige", "natur": "beige", "creme": "cream",
  "brun": "brown", "lysebrun": "light_brown", "mørkebrun": "dark_brown", "valnød": "walnut", "eg": "oak",
  "blå": "blue", "lyseblå": "light_blue", "mørkeblå": "dark_blue", "marine": "navy",
  "grøn": "green", "oliven": "olive", "sage": "sage",
  "gul": "yellow", "oker": "ochre",
  "rød": "red", "bordeaux": "burgundy",
  "rosa": "pink", "lyserød": "light_pink",
  "orange": "orange", "terracotta": "terracotta",
  "lilla": "purple", "lavendel": "lavender",
};

const MATERIAL_MAP = {
  "læder": "leather", "kernelæder": "leather", "kunstlæder": "faux_leather",
  "stof": "fabric", "tekstil": "fabric", "polyester": "fabric",
  "velour": "velvet", "fløjl": "velvet",
  "træ": "wood", "eg": "oak", "bøg": "beech", "fyr": "pine", "valnød": "walnut", "birk": "birch",
  "metal": "metal", "stål": "steel", "jern": "iron", "messing": "brass",
  "glas": "glass",
  "rattan": "rattan", "rotting": "rattan", "flet": "woven", "vævet": "woven",
  "boucle": "boucle", "bouclé": "boucle",
  "hør": "linen", "linen": "linen",
  "marmor": "marble", "sten": "stone",
};

const TYPE_MAP = {
  "sofa": "sofa", "sovesofa": "sofa", "chaiselong": "sofa", "hjørnesofa": "corner_sofa",
  "lænestol": "lounge_chair", "læne stol": "lounge_chair", "hvilestol": "lounge_chair",
  "spisestol": "dining_chair", "køkkenstol": "dining_chair", "barstol": "bar_stool",
  "spisebord": "dining_table", "sofabord": "coffee_table", "salongbord": "coffee_table",
  "sidebord": "side_table", "sengebord": "nightstand", "nakkebord": "nightstand",
  "reol": "shelf", "bogskab": "shelf", "vægreol": "wall_shelf",
  "skab": "cabinet", "kommode": "cabinet", "sideboard": "sideboard",
  "seng": "bed", "sengestel": "bed",
  "lampe": "lamp", "bordlampe": "table_lamp", "gulvlampe": "floor_lamp", "pendel": "pendant",
  "tæppe": "rug", "gulvtæppe": "rug", "løber": "runner",
  "plante": "plant", "potte": "plant",
  "vase": "vase", "spejl": "mirror", "ur": "clock", "pude": "pillow",
};

const COLOR_FAMILIES = {
  white: "light", off_white: "light", cream: "light", beige: "neutral",
  light_gray: "light", gray: "neutral", dark_gray: "dark", anthracite: "dark",
  black: "dark", light_brown: "warm", brown: "warm", dark_brown: "dark",
  walnut: "warm", oak: "warm", light_blue: "cool", blue: "cool", navy: "dark",
  green: "cool", olive: "warm", sage: "cool", yellow: "warm", ochre: "warm",
  red: "warm", burgundy: "dark", light_pink: "pastel", pink: "pastel",
  orange: "warm", terracotta: "earth", purple: "cool", lavender: "pastel",
};

const MATERIAL_FAMILIES = {
  leather: "leather", faux_leather: "leather", fabric: "fabric",
  polyester: "fabric", velvet: "fabric", wood: "wood", oak: "wood",
  beech: "wood", pine: "wood", walnut: "wood", birch: "wood",
  metal: "metal", steel: "metal", iron: "metal", brass: "metal",
  glass: "glass", rattan: "natural", woven: "natural",
  boucle: "fabric", linen: "fabric", marble: "stone", stone: "stone",
};

function parseFromName(name) {
  const lower = name.toLowerCase();

  let color = "unknown", colorFamily = "neutral";
  for (const [dk, en] of Object.entries(COLOR_MAP)) {
    if (lower.includes(dk)) { color = en; colorFamily = COLOR_FAMILIES[en] || "neutral"; break; }
  }

  let material = "unknown", materialFamily = "mixed";
  for (const [dk, en] of Object.entries(MATERIAL_MAP)) {
    if (lower.includes(dk)) { material = en; materialFamily = MATERIAL_FAMILIES[en] || "mixed"; break; }
  }

  let type = "unknown", subtype = "unknown";
  for (const [dk, en] of Object.entries(TYPE_MAP)) {
    if (lower.includes(dk)) { type = en; subtype = en; break; }
  }

  let found = 0;
  if (color !== "unknown") found++;
  if (material !== "unknown") found++;
  if (type !== "unknown") found++;

  return {
    type, subtype, color, color_family: colorFamily,
    material, material_family: materialFamily,
    style: "unknown", indoor: true, size: "medium", shape: "unknown",
    confidence: found / 3,
  };
}

// ─── Logging & progress ───────────────────────────────────────────────────────

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

async function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      log(`Genoptager fra offset ${data.offset} — ${data.tagged} allerede tagget`);
      return data;
    }
  } catch {
    log("Ingen progress fil fundet, starter fra begyndelsen");
  }
  return { offset: 0, tagged: 0, failed: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Core batch ───────────────────────────────────────────────────────────────

async function tagBatch(offset, limit) {
  const { rows: products } = await pool.query(
    `SELECT id, name
     FROM products
     WHERE (tag_processed = FALSE OR tag_processed IS NULL)
     ORDER BY id
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  let success = 0, failed = 0;

  for (const p of products) {
    try {
      const tag = parseFromName(p.name);
      await pool.query(
        `UPDATE products
         SET tags = $1, tag_confidence = $2, tag_processed = TRUE, tag_processed_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(tag), tag.confidence, p.id]
      );
      success++;
    } catch {
      failed++;
      try {
        await pool.query(
          `UPDATE products SET tag_processed = TRUE, tag_processed_at = NOW() WHERE id = $1`,
          [p.id]
        );
      } catch { /* ignore */ }
    }
  }

  return { success, failed, processed: products.length };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("=== OVERNIGHT TAGGING STARTET ===");
  log(`Mål: ${CONFIG.TARGET} produkter | Batch: ${CONFIG.BATCH_SIZE} | Pause: ${CONFIG.PAUSE_MS}ms`);

  const { rows: [initial] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE tag_processed = TRUE)  AS tagged,
       COUNT(*) FILTER (WHERE tag_processed = FALSE OR tag_processed IS NULL) AS untagged
     FROM products`
  );
  log(`DB-status: ${initial.tagged} tagget, ${initial.untagged} utagget`);

  if (parseInt(initial.untagged) === 0) {
    log("Alle produkter er allerede tagget!");
    await pool.end();
    return;
  }

  const progress = await loadProgress();
  let { offset, tagged: totalTagged, failed: totalFailed } = progress;
  let batchCount = 0;
  const startTime = Date.now();

  while (totalTagged + totalFailed < CONFIG.TARGET) {
    batchCount++;
    const batchStart = Date.now();

    const result = await tagBatch(offset, CONFIG.BATCH_SIZE);

    if (result.processed === 0) {
      log("Ingen flere utaggede produkter — færdig!");
      break;
    }

    totalTagged += result.success;
    totalFailed += result.failed;
    offset += result.processed;

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (totalTagged / elapsed).toFixed(1);
    const pct = ((totalTagged / CONFIG.TARGET) * 100).toFixed(1);
    const etaSec = Math.round((CONFIG.TARGET - totalTagged) / Math.max(parseFloat(rate), 1));
    const etaMin = Math.round(etaSec / 60);

    if (batchCount % 5 === 0 || batchCount <= 3) {
      log(`Batch ${batchCount}: +${result.success} success | Total: ${totalTagged}/${CONFIG.TARGET} (${pct}%) | ${rate} prod/sek | ETA: ~${etaMin} min`);
    }

    if (batchCount % CONFIG.SAVE_EVERY === 0) {
      saveProgress({ offset, tagged: totalTagged, failed: totalFailed });
      log(`Progress gemt (batch ${batchCount})`);
    }

    await new Promise((r) => setTimeout(r, CONFIG.PAUSE_MS));
  }

  saveProgress({ offset, tagged: totalTagged, failed: totalFailed });

  const totalSec = Math.round((Date.now() - startTime) / 1000);
  const totalMin = Math.round(totalSec / 60);

  log("\n=== FÆRDIG ===");
  log(`Total tagget: ${totalTagged} | Fejlet: ${totalFailed} | Tid: ${totalMin} min`);
  if (totalTagged + totalFailed > 0) {
    log(`Success rate: ${((totalTagged / (totalTagged + totalFailed)) * 100).toFixed(1)}%`);
  }

  const { rows: styles } = await pool.query(
    `SELECT tags->>'style' AS style, COUNT(*)::int AS count
     FROM products WHERE tag_processed = TRUE
     GROUP BY tags->>'style' ORDER BY count DESC LIMIT 10`
  );
  log("\nTop stilarter:");
  styles.forEach((s) => log(`  ${s.style || "unknown"}: ${s.count}`));

  const { rows: types } = await pool.query(
    `SELECT tags->>'type' AS type, COUNT(*)::int AS count
     FROM products WHERE tag_processed = TRUE
     GROUP BY tags->>'type' ORDER BY count DESC LIMIT 10`
  );
  log("\nTop produkttyper:");
  types.forEach((t) => log(`  ${t.type || "unknown"}: ${t.count}`));

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  log(`FATAL ERROR: ${e.message}`);
  fs.appendFileSync(LOG_FILE, `\nCRASH STACK:\n${e.stack}\n`);
  pool.end().finally(() => process.exit(1));
});
