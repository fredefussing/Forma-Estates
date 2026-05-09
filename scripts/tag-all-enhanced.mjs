#!/usr/bin/env node
/**
 * ENHANCED TAGGING — Nordic Homebuild AI
 * Forbedret stil-detektion med regex på dansk tekst + shop-defaults
 *
 * Brug:
 *   node scripts/tag-all-enhanced.mjs
 *
 * Tilsidesætter eksisterende tags med bedre stil-detektion.
 * Kører ~500 prod/sek — alle 243k på ~10 min.
 */

import pg from "pg";
import fs from "fs";
import { config } from "dotenv";

config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const LOG_FILE = "tagging-enhanced.log";
const PROGRESS_FILE = "tagging-enhanced-progress.json";

const CONFIG = {
  BATCH_SIZE: 500,
  PAUSE_MS:   50,
  SAVE_EVERY: 20,
  TARGET:     parseInt(process.env.TAG_TARGET || "250000"),
};

// ─── Stil-regler ──────────────────────────────────────────────────────────────

const STYLE_RULES = [
  { pattern: /skan|nord|hygge|wegner|jacobsen|muuto|hay\b|egetræ|eg\s|naturtræ|lys træ|hvidpigmenteret|enkel|minimal|funktional|ren linje|dansk design/i, style: "scandinavian" },
  { pattern: /moderne|modern|minimalist|clean|contemporary|sort mat|hvid højglans|krom|glat/i,                                                             style: "modern" },
  { pattern: /industri|raw|metal ben|stål ben|jern ben|beton|ubehandlet|factory/i,                                                                         style: "industrial" },
  { pattern: /luksus|luxury|premium|marmor|velour|fløjl|guld\b|messing poleret|læder anilin/i,                                                             style: "luxury" },
  { pattern: /coastal|strand|hav\b|rattan|hø r|hvidvasket|beach|driftwood/i,                                                                               style: "coastal" },
  { pattern: /boho|bohem|farverig|mønstret|etnisk|macrame|patchwork|kilim|orientalsk|indisk/i,                                                             style: "bohemian" },
  { pattern: /retro|50s|60s|midcentury|mid-century|teak|palisander|tulip|eames/i,                                                                          style: "midcentury" },
  { pattern: /farmhouse|bondegård|distressed|shabby|country|provence/i,                                                                                    style: "farmhouse" },
  { pattern: /japandi|wabi|japansk|zen\b|tatami|ask\b|sortbejdset/i,                                                                                       style: "japandi" },
];

const SHOP_STYLES = {
  "boligretning":  "scandinavian",
  "homeroom":      "modern",
  "designshoppen": "scandinavian",
  "boboonline":    "modern",
  "lampeguru":     "modern",
  "moebelringen":  "scandinavian",
  "3-nordic":      "scandinavian",
  "nordicdream":   "scandinavian",
};

// ─── Farve-kort ───────────────────────────────────────────────────────────────

const COLOR_MAP = {
  "hvid":     /hvid|hvidt|white|snow|ivory/i,
  "sort":     /sort|sorte|black|mat sort/i,
  "grå":      /grå|gråt|grey|gray|silver|antracit|charcoal/i,
  "beige":    /beige|sand|creme|cream|off-white|ecru|taupe/i,
  "brun":     /brun|brune|brown|mørk|dark|walnut|valnød|nød/i,
  "blå":      /blå|blåt|blue|navy|marine|petrol|turkis/i,
  "grøn":     /grøn|grønt|green|oliven|sage|mint/i,
  "gul":      /gul|gult|yellow|okker|mustard/i,
  "rød":      /rød|rødt|red|bordeaux|rust/i,
  "orange":   /orange|terracotta|koral|coral/i,
  "lyserød":  /lyserød|pink|rosa/i,
  "lilla":    /lilla|purple|lavendel/i,
  "guld":     /guld|gold|messing|brass/i,
  "sølv":     /sølv|silver|krom|chrome/i,
  "træ":      /naturtræ|lyst træ|egetræ/i,
};

const COLOR_FAMILY = {
  "hvid": "light",  "beige": "neutral", "grå": "neutral",
  "sort": "dark",   "brun": "warm",     "træ": "warm",
  "guld": "warm",   "orange": "warm",   "gul": "warm",   "rød": "warm",
  "blå": "cool",    "grøn": "cool",     "lilla": "cool",
  "lyserød": "pastel", "sølv": "neutral",
};

// ─── Materiale-kort ───────────────────────────────────────────────────────────

const MATERIAL_MAP = {
  "egetræ":   /egetræ|eg\s|egt\b/i,
  "træ":      /træ|naturtræ|bambus|akacia|sheesham|bøg|fyr|birk/i,
  "rattan":   /rattan|rotting|flet/i,
  "fløjl":    /fløjl|velour|velvet|sammet/i,
  "læder":    /læder|kunstlæder|pu-læder/i,
  "metal":    /metal|jern|aluminium|zink/i,
  "stål":     /stål|steel/i,
  "messing":  /messing|brass/i,
  "stof":     /stof|tekstil|bomuld|polyester|hør|linen|uld|bouclé|boucle/i,
  "glas":     /glas|glass/i,
  "marmor":   /marmor|granit/i,
  "keramik":  /keramik|porcelæn/i,
  "plastik":  /plast|plastik|polypropylen|akryl/i,
};

const MATERIAL_FAMILY = {
  "egetræ": "wood", "træ": "wood", "rattan": "natural",
  "fløjl": "fabric", "stof": "fabric", "læder": "leather",
  "metal": "metal", "stål": "metal", "messing": "metal",
  "glas": "glass", "marmor": "stone", "keramik": "stone", "plastik": "plastic",
};

// ─── Type-kort ────────────────────────────────────────────────────────────────

const TYPE_MAP = {
  "sofa":         /sofa|chaiselong|hjørnesofa|\b3-pers\b|\b2-pers\b/i,
  "lounge_chair": /lænestol|læne stol|armstol|hvilestol/i,
  "dining_chair": /spisebordsstol|køkkenstol|spisestol/i,
  "bar_stool":    /barstol/i,
  "dining_table": /spisebord|køkkenbord/i,
  "coffee_table": /sofabord|salongbord/i,
  "side_table":   /sidebord|bakkebord/i,
  "nightstand":   /sengebord|natbord|nakkebord/i,
  "bed":          /\bseng\b|sengestel|daybed/i,
  "shelf":        /reol|hylde|bogreol|vægreol/i,
  "cabinet":      /kommode|skab|garderobeskab|skoskab/i,
  "sideboard":    /sideboard|skænk|anretter/i,
  "floor_lamp":   /gulvlampe/i,
  "table_lamp":   /bordlampe/i,
  "pendant":      /pendel|loftlampe/i,
  "lamp":         /lampe|lygte|væglampe/i,
  "mirror":       /spejl/i,
  "rug":          /tæppe|gulvtæppe|løber|kelim/i,
  "pillow":       /pude|hynde/i,
  "vase":         /vase|krukke|urtepotte/i,
  "plant":        /plante|blomst/i,
};

// ─── Hjælpefunktioner ─────────────────────────────────────────────────────────

function guessStyle(name, category, shop) {
  const text = `${name} ${category || ""}`;
  for (const { pattern, style } of STYLE_RULES) {
    if (pattern.test(text)) return style;
  }
  const shopDefault = SHOP_STYLES[shop?.toLowerCase()];
  if (shopDefault && Math.random() < 0.6) return shopDefault;
  return "unknown";
}

function guessColor(name) {
  for (const [color, regex] of Object.entries(COLOR_MAP)) {
    if (regex.test(name)) return color;
  }
  return "neutral";
}

function guessMaterial(name) {
  for (const [mat, regex] of Object.entries(MATERIAL_MAP)) {
    if (regex.test(name)) return mat;
  }
  return "blandet";
}

function guessType(name) {
  for (const [type, regex] of Object.entries(TYPE_MAP)) {
    if (regex.test(name)) return type;
  }
  return "unknown";
}

function guessSize(name, price) {
  if (/xl|stor\b|large|kæmpe|180|200|220|240/i.test(name)) return "large";
  if (/lille|small|mini|compact|\b60\b|\b80\b|\b100\b/i.test(name)) return "small";
  if (price > 8000) return "large";
  if (price < 1500) return "small";
  return "medium";
}

function guessShape(name) {
  if (/rund|cirkel|oval|bue/i.test(name)) return "round";
  if (/kvadrat|firkant|cube/i.test(name)) return "square";
  return "rectangular";
}

function buildTag(name, category, shop, price, existingTags = {}) {
  const style    = guessStyle(name, category, shop);
  const color    = existingTags.color !== "unknown" && existingTags.color
                     ? existingTags.color : guessColor(name);
  const material = existingTags.material !== "unknown" && existingTags.material
                     ? existingTags.material : guessMaterial(name);
  const type     = existingTags.type !== "unknown" && existingTags.type
                     ? existingTags.type : guessType(name);

  const styleKnown = style !== "unknown";
  const typeKnown  = type  !== "unknown";
  const confidence = styleKnown && typeKnown ? 0.75
                   : styleKnown || typeKnown  ? 0.55
                   : 0.35;

  return {
    type,
    subtype: existingTags.subtype || type,
    color,
    color_family:    COLOR_FAMILY[color] || "neutral",
    material,
    material_family: MATERIAL_FAMILY[material] || "mixed",
    style,
    size:    guessSize(name, price),
    shape:   existingTags.shape !== "unknown" && existingTags.shape
               ? existingTags.shape : guessShape(name),
    indoor:  true,
    confidence,
  };
}

// ─── Logging & progress ───────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const d = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      log(`Genoptager fra offset ${d.offset} — ${d.tagged} allerede tagget`);
      return d;
    }
  } catch { log("Starter fra begyndelsen"); }
  return { offset: 0, tagged: 0, failed: 0 };
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ─── Core batch ───────────────────────────────────────────────────────────────

async function tagBatch(offset, limit) {
  const { rows } = await pool.query(
    `SELECT id, name, category, shop, price::float, tags
     FROM products
     ORDER BY id
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  if (rows.length === 0) return { success: 0, failed: 0, processed: 0 };

  const cases = [];
  const ids   = [];

  for (const p of rows) {
    const existing = typeof p.tags === "string" ? JSON.parse(p.tags) : (p.tags || {});
    const tag = buildTag(p.name, p.category, p.shop, p.price, existing);
    cases.push(`WHEN id = ${p.id} THEN '${JSON.stringify(tag).replace(/'/g, "''")}'::jsonb`);
    ids.push(p.id);
  }

  try {
    await pool.query(`
      UPDATE products
      SET tags = CASE ${cases.join(" ")} END,
          tag_confidence = CASE
            ${rows.map(p => {
              const ex = typeof p.tags === "string" ? JSON.parse(p.tags) : (p.tags || {});
              const tag = buildTag(p.name, p.category, p.shop, p.price, ex);
              return `WHEN id = ${p.id} THEN ${tag.confidence}`;
            }).join(" ")}
          END,
          tag_processed = TRUE,
          tag_processed_at = NOW()
      WHERE id = ANY($1::int[])
    `, [ids]);

    return { success: rows.length, failed: 0, processed: rows.length };
  } catch (e) {
    log(`Batch fejl: ${e.message} — forsøger enkeltvis`);
    let success = 0, failed = 0;
    for (const p of rows) {
      try {
        const existing = typeof p.tags === "string" ? JSON.parse(p.tags) : (p.tags || {});
        const tag = buildTag(p.name, p.category, p.shop, p.price, existing);
        await pool.query(
          `UPDATE products SET tags=$1, tag_confidence=$2, tag_processed=TRUE, tag_processed_at=NOW() WHERE id=$3`,
          [JSON.stringify(tag), tag.confidence, p.id]
        );
        success++;
      } catch { failed++; }
    }
    return { success, failed, processed: rows.length };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("=== ENHANCED TAGGING STARTET ===");
  log(`Mål: ${CONFIG.TARGET} | Batch: ${CONFIG.BATCH_SIZE}`);

  const { rows: [s] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE tag_processed=TRUE) as tagged, COUNT(*) as total FROM products`
  );
  log(`DB: ${s.total} total, ${s.tagged} allerede tagget`);

  const progress = loadProgress();
  let { offset, tagged: totalTagged, failed: totalFailed } = progress;
  let batchCount = 0;
  const startTime = Date.now();

  while (offset < CONFIG.TARGET) {
    batchCount++;
    const result = await tagBatch(offset, CONFIG.BATCH_SIZE);

    if (result.processed === 0) { log("Ingen flere produkter."); break; }

    totalTagged += result.success;
    totalFailed += result.failed;
    offset += result.processed;

    if (batchCount % 10 === 0 || batchCount <= 5) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (offset / elapsed).toFixed(0);
      const etaMin = Math.round((CONFIG.TARGET - offset) / Math.max(parseInt(rate), 1) / 60);
      log(`Batch ${batchCount}: ${offset}/${CONFIG.TARGET} (${((offset/CONFIG.TARGET)*100).toFixed(1)}%) | ${rate} prod/sek | ETA ~${etaMin} min`);
    }

    if (batchCount % CONFIG.SAVE_EVERY === 0) {
      saveProgress({ offset, tagged: totalTagged, failed: totalFailed });
    }

    await new Promise(r => setTimeout(r, CONFIG.PAUSE_MS));
  }

  saveProgress({ offset, tagged: totalTagged, failed: totalFailed });

  log("\n=== FÆRDIG ===");
  log(`Tagget: ${totalTagged} | Fejlet: ${totalFailed} | Tid: ${Math.round((Date.now()-startTime)/60000)} min`);

  const { rows: styles } = await pool.query(
    `SELECT tags->>'style' as style, COUNT(*)::int as count
     FROM products WHERE tag_processed=TRUE GROUP BY tags->>'style' ORDER BY count DESC`
  );
  log("\nStil-fordeling:");
  styles.forEach(s => log(`  ${s.style || "unknown"}: ${s.count}`));

  const { rows: types } = await pool.query(
    `SELECT tags->>'type' as type, COUNT(*)::int as count
     FROM products WHERE tag_processed=TRUE GROUP BY tags->>'type' ORDER BY count DESC LIMIT 15`
  );
  log("\nType-fordeling:");
  types.forEach(t => log(`  ${t.type || "unknown"}: ${t.count}`));

  await pool.end();
  process.exit(0);
}

main().catch(e => {
  log(`FATAL: ${e.message}\n${e.stack}`);
  pool.end().finally(() => process.exit(1));
});
