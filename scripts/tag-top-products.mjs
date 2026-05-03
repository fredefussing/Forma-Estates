/**
 * Batch tag produkter med AI
 * Kør med: node scripts/tag-top-products.mjs
 *
 * Tagger produkter via:
 * 1. Navn-parsing (gratis, hurtig)
 * 2. GPT-4o-mini Vision (når navn-parsing er usikker)
 */

import pg from "pg";
import OpenAI from "openai";
import { config } from "dotenv";

config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TARGET = parseInt(process.env.TAG_TARGET || "5000");
const BATCH_SIZE = parseInt(process.env.TAG_BATCH || "50");
const DELAY_MS = parseInt(process.env.TAG_DELAY || "1500");

const COLOR_MAP = {
  "hvid": "white", "hvidt": "white", "off-white": "off_white",
  "sort": "black", "sorte": "black",
  "grå": "gray", "lysegrå": "light_gray", "mørkegrå": "dark_gray", "antracit": "anthracite",
  "beige": "beige", "sand": "beige", "ecru": "beige", "natur": "beige", "creme": "cream",
  "brun": "brown", "lysebrun": "light_brown", "mørkebrun": "dark_brown", "valnød": "walnut", "eg": "oak",
  "blå": "blue", "lyseblå": "light_blue", "mørkeblå": "dark_blue", "marine": "navy",
  "grøn": "green", "oliven": "olive", "rød": "red", "rosa": "pink", "orange": "orange",
};

const MATERIAL_MAP = {
  "læder": "leather", "kunstlæder": "faux_leather", "stof": "fabric", "tekstil": "fabric",
  "velour": "velvet", "fløjl": "velvet", "træ": "wood", "eg": "oak", "bøg": "beech",
  "fyr": "pine", "valnød": "walnut", "birk": "birch", "metal": "metal", "stål": "steel",
  "messing": "brass", "glas": "glass", "rattan": "rattan", "rotting": "rattan",
  "flet": "woven", "boucle": "boucle", "hør": "linen",
};

const TYPE_MAP = {
  "sofa": "sofa", "sovesofa": "sofa", "hjørnesofa": "corner_sofa", "chaiselong": "sofa",
  "lænestol": "lounge_chair", "hvilestol": "lounge_chair",
  "spisestol": "dining_chair", "køkkenstol": "dining_chair", "barstol": "bar_stool",
  "spisebord": "dining_table", "sofabord": "coffee_table", "salongbord": "coffee_table",
  "sidebord": "side_table", "sengebord": "nightstand", "nakkebord": "nightstand",
  "reol": "shelf", "bogskab": "shelf", "skab": "cabinet", "kommode": "cabinet",
  "sideboard": "sideboard", "seng": "bed", "sengestel": "bed",
  "lampe": "lamp", "bordlampe": "table_lamp", "gulvlampe": "floor_lamp", "pendel": "pendant",
  "tæppe": "rug", "gulvtæppe": "rug", "løber": "runner",
  "plante": "plant", "vase": "vase", "spejl": "mirror", "pude": "pillow",
};

function parseFromName(name) {
  const lower = name.toLowerCase();
  let color = "unknown", colorFamily = "neutral";
  for (const [dk, en] of Object.entries(COLOR_MAP)) {
    if (lower.includes(dk)) { color = en; break; }
  }
  let material = "unknown";
  for (const [dk, en] of Object.entries(MATERIAL_MAP)) {
    if (lower.includes(dk)) { material = en; break; }
  }
  let type = "unknown";
  for (const [dk, en] of Object.entries(TYPE_MAP)) {
    if (lower.includes(dk)) { type = en; break; }
  }
  const found = [color, material, type].filter(v => v !== "unknown").length;
  return { type, subtype: type, color, color_family: colorFamily, material, material_family: "mixed",
    style: "unknown", indoor: true, size: "medium", shape: "unknown", confidence: found / 3 };
}

async function tagWithVision(imageUrl, name, fallback) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: [
        { type: "text", text: `Analyze this furniture. Name: "${name}". Return ONLY JSON:
{"type":"sofa|lounge_chair|dining_chair|bar_stool|dining_table|coffee_table|side_table|nightstand|bed|lamp|rug|shelf|cabinet|sideboard|plant|mirror|clock|pillow|vase|decor",
"subtype":"specific","color":"exact color EN","color_family":"neutral|warm|cool|dark|light|white|black|pastel|earth",
"material":"exact material EN","material_family":"wood|metal|fabric|leather|glass|plastic|natural|stone|mixed",
"style":"scandinavian|modern|industrial|classic|bohemian|minimalist|rustic|luxury|mid_century|contemporary",
"indoor":true,"size":"small|medium|large|xl","shape":"rectangular|square|round|oval|l_shaped","confidence":0.0-1.0}
scandinavian=light wood+clean lines+natural materials.` },
        { type: "image_url", image_url: { url: imageUrl } },
      ]}],
      response_format: { type: "json_object" },
      max_tokens: 250,
      temperature: 0.1,
    });
    const r = JSON.parse(response.choices[0].message.content || "{}");
    return { type: r.type || fallback.type, subtype: r.subtype || fallback.subtype,
      color: r.color || fallback.color, color_family: r.color_family || fallback.color_family,
      material: r.material || fallback.material, material_family: r.material_family || fallback.material_family,
      style: r.style || "unknown", indoor: r.indoor !== undefined ? r.indoor : true,
      size: r.size || "medium", shape: r.shape || "rectangular", confidence: r.confidence || 0.5 };
  } catch (e) {
    console.error("Vision failed:", e.message);
    return { ...fallback, confidence: fallback.confidence * 0.7 };
  }
}

async function main() {
  console.log("=== NORDIC HOMEBUILD — TAGGING SYSTEM ===");
  console.log(`Mål: ${TARGET} produkter | Batch: ${BATCH_SIZE} | Delay: ${DELAY_MS}ms\n`);

  const { rows: [initial] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE tag_processed=TRUE) as tagged, COUNT(*) FILTER (WHERE tag_processed=FALSE OR tag_processed IS NULL) as untagged FROM products`
  );
  console.log(`Allerede tagget: ${initial.tagged} | Utagget: ${initial.untagged}\n`);

  let totalSuccess = 0, totalFailed = 0, nameOnly = 0, visionUsed = 0;

  while (totalSuccess + totalFailed < TARGET) {
    const remaining = TARGET - (totalSuccess + totalFailed);
    const batchSize = Math.min(BATCH_SIZE, remaining);
    const batchNum = Math.floor((totalSuccess + totalFailed) / BATCH_SIZE) + 1;

    const { rows: products } = await pool.query(
      `SELECT id, name, image_url FROM products WHERE (tag_processed=FALSE OR tag_processed IS NULL) AND image_url IS NOT NULL AND image_url!='' ORDER BY price DESC NULLS LAST LIMIT $1`,
      [batchSize]
    );

    if (products.length === 0) { console.log("Ingen flere produkter at tagge."); break; }

    console.log(`\n--- Batch ${batchNum} (${products.length} produkter) ---`);

    for (const p of products) {
      try {
        await new Promise(r => setTimeout(r, DELAY_MS));
        const parsed = parseFromName(p.name);
        let tag;

        if (parsed.confidence > 0.65) {
          tag = { ...parsed, style: "unknown" };
          nameOnly++;
        } else {
          tag = await tagWithVision(p.image_url, p.name, parsed);
          visionUsed++;
        }

        await pool.query(
          `UPDATE products SET tags=$1, tag_confidence=$2, tag_processed=TRUE, tag_processed_at=NOW() WHERE id=$3`,
          [JSON.stringify(tag), tag.confidence, p.id]
        );
        totalSuccess++;
        if (totalSuccess % 100 === 0) process.stdout.write(`  ✓ ${totalSuccess} tagget...\n`);
      } catch (e) {
        console.error(`  ✗ Fejl på produkt ${p.id}:`, e.message);
        await pool.query(`UPDATE products SET tag_processed=TRUE, tag_processed_at=NOW() WHERE id=$1`, [p.id]);
        totalFailed++;
      }
    }

    const pct = Math.round(((totalSuccess + totalFailed) / TARGET) * 100);
    console.log(`Progress: ${totalSuccess + totalFailed}/${TARGET} (${pct}%) | Navn: ${nameOnly} | Vision: ${visionUsed} | Fejl: ${totalFailed}`);

    if ((totalSuccess + totalFailed) % 1000 === 0 && remaining > batchSize) {
      console.log("--- Pause 30s for rate limits ---");
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  console.log("\n=== FÆRDIG ===");
  console.log(`Total: ${totalSuccess + totalFailed} | Success: ${totalSuccess} | Fejl: ${totalFailed}`);
  console.log(`Navn-parsing: ${nameOnly} | Vision brugt: ${visionUsed}`);
  console.log(`Estimeret OpenAI-omkostning: ~$${(visionUsed * 0.005).toFixed(2)}`);

  const { rows: styles } = await pool.query(
    `SELECT tags->>'style' as style, COUNT(*)::int as count FROM products WHERE tag_processed=TRUE GROUP BY tags->>'style' ORDER BY count DESC LIMIT 10`
  );
  console.log("\nStil-fordeling:");
  styles.forEach(s => console.log(`  ${s.style || "unknown"}: ${s.count}`));

  const { rows: types } = await pool.query(
    `SELECT tags->>'type' as type, COUNT(*)::int as count FROM products WHERE tag_processed=TRUE GROUP BY tags->>'type' ORDER BY count DESC LIMIT 10`
  );
  console.log("\nType-fordeling:");
  types.forEach(t => console.log(`  ${t.type || "unknown"}: ${t.count}`));

  await pool.end();
  process.exit(0);
}

main().catch(e => {
  console.error("Fatal fejl:", e);
  pool.end();
  process.exit(1);
});
