import OpenAI from "openai";
import { pool } from "./db";
import fs from "fs";
import path from "path";

const log = (msg: string) => console.log(`${new Date().toLocaleTimeString()} [express] ${msg}`);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// FIX 1: Præcis vision-prompt med eksplicit farve-vokabular
const VISION_PROMPT = `Analyze this room photo with EXTREME color precision.

Return JSON:
{
  "description": "short description",
  "objects": [
    { "type": "sofa", "color": "beige", "style": "scandinavian", "material": "fabric" },
    { "type": "coffee_table", "color": "natural_wood", "style": "scandinavian", "material": "wood" }
  ],
  "types": ["sofa", "coffee_table"],
  "colors": ["beige", "natural_wood"],
  "styles": ["scandinavian"],
  "materials": ["fabric", "wood"]
}

TYPE VALUES — use ONLY: sofa, lounge_chair, dining_chair, bed, lamp, floor_lamp, dining_table, coffee_table, side_table, bookshelf, mirror, rug, curtain, sideboard, wardrobe

COLOR RULES — use ONLY these exact values:
sofas/chairs: beige, grey, white, black, brown, cream, tan, olive
wood: natural_wood, light_wood, dark_wood, oak, walnut, pine
metals: brass, gold, chrome, black_metal
plants: green
glass: clear_glass, tinted_glass

Be SPECIFIC. "beige fabric sofa" not "light colored seating".`;

// ── A. Vision analyse — GPT-4o-mini beskriver hvert møbelobjekt ──────────────
async function analyzeVision(imageUrl: string, roomType: string): Promise<{
  description: string;
  objects: Array<{ type: string; color: string; style: string; material: string }>;
  types: string[];
  colors: string[];
  styles: string[];
  materials: string[];
}> {
  let base64Image: string;
  if (imageUrl.startsWith("/uploads/")) {
    const filePath = path.join(process.cwd(), imageUrl);
    const buf = fs.readFileSync(filePath);
    base64Image = buf.toString("base64");
  } else {
    const { default: fetch } = await import("node-fetch");
    const res = await fetch(imageUrl);
    const arr = await res.arrayBuffer();
    base64Image = Buffer.from(arr).toString("base64");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: VISION_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: `Analyze furniture objects in this ${roomType}.` },
          // FIX 1: detail "high" for better color accuracy
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" } }
        ]
      }
    ],
    max_tokens: 500,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw);

  // Ensure objects array exists — fallback to top-level arrays
  if (!parsed.objects || !Array.isArray(parsed.objects)) {
    parsed.objects = (parsed.types || []).map((t: string, i: number) => ({
      type: t,
      color: (parsed.colors || [])[i] ?? "neutral",
      style: (parsed.styles || [])[0] ?? "scandinavian",
      material: (parsed.materials || [])[i] ?? "mixed",
    }));
  }

  return parsed;
}

// ── Color mapping: GPT vocabulary → Danish DB color values ───────────────────
const COLOR_TO_DK: Record<string, string[]> = {
  beige:        ["beige"],
  cream:        ["beige", "hvid"],
  tan:          ["beige", "brun"],
  grey:         ["grå", "lysegrå", "mørkegrå"],
  gray:         ["grå", "lysegrå"],
  white:        ["hvid"],
  black:        ["sort"],
  black_metal:  ["sort"],
  brown:        ["brun", "lysbrun", "mørkebrun"],
  olive:        ["grøn", "oliven"],
  green:        ["grøn", "oliven"],
  natural_wood: ["neutral", "brun", "beige"],
  light_wood:   ["beige", "neutral"],
  dark_wood:    ["brun", "mørkebrun"],
  oak:          ["brun", "neutral"],
  walnut:       ["brun", "mørkebrun"],
  pine:         ["beige", "brun"],
  brass:        ["guld", "sølv"],
  gold:         ["guld"],
  chrome:       ["sølv"],
  clear_glass:  ["neutral"],
  tinted_glass: ["grå"],
  blue:         ["blå", "lyseblå", "mørkeblå"],
  red:          ["rød"],
  yellow:       ["gul"],
  orange:       ["orange"],
  pink:         ["lyserød"],
  purple:       ["lilla"],
  neutral:      ["neutral", "beige"],
};

function toDbColors(colors: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const c of colors) {
    const mapped = COLOR_TO_DK[c.toLowerCase()] ?? [c];
    for (const dk of mapped) {
      if (!seen.has(dk)) { seen.add(dk); result.push(dk); }
    }
  }
  return result;
}

// ── B. Match ét enkelt objekt mod products-tabellen ───────────────────────────
async function matchSingleObject(obj: {
  type: string; color: string; style: string; material: string;
}): Promise<Array<{ id: number; name: string; name_en: string | null; price: string; image_url: string; affiliate_link: string; shop: string; tags: any; score: number }>> {
  if (!obj.type) return [];

  const dbColors = toDbColors([obj.color]);
  const styles = [obj.style].filter(Boolean);
  const materials = [obj.material].filter(Boolean);

  log(`[Affiliate] Object: type=${obj.type} color=${obj.color}→[${dbColors}] style=${obj.style}`);

  // FIX 2: Mandatory type filter, COLOR scores highest (60%)
  const { rows } = await pool.query<{
    id: number; name: string; name_en: string | null; price: string;
    image_url: string; affiliate_link: string; shop: string; tags: any; score: number;
  }>(`
    SELECT
      p.id, p.name, p.name_en, p.price,
      p.image_url, p.affiliate_link, p.shop, p.tags,
      (
        CASE WHEN p.tags->>'color' = ANY($2::text[]) THEN 60 ELSE 0 END +
        CASE WHEN p.tags->>'style' = ANY($3::text[]) THEN 20 ELSE 0 END +
        CASE WHEN p.tags->>'material' = ANY($4::text[]) THEN 20 ELSE 0 END
      ) AS score
    FROM products p
    WHERE
      p.image_url IS NOT NULL AND p.image_url != ''
      AND p.affiliate_link IS NOT NULL AND p.affiliate_link != ''
      AND p.tags->>'type' = $1
    ORDER BY score DESC, random()
    LIMIT 6
  `, [obj.type, dbColors, styles, materials]);

  return rows;
}

// ── C. Hoved-matching: matcher hvert objekt individuelt, maks 2 per objekt ───
async function matchProducts(
  designId: number,
  vision: {
    objects: Array<{ type: string; color: string; style: string; material: string }>;
    types: string[];
    styles: string[];
  },
  roomType: string,
): Promise<any[]> {
  // FIX 3: Match hvert objekt individuelt
  const objects = vision.objects?.length > 0
    ? vision.objects.slice(0, 4)  // maks 4 objekter
    : [{ type: roomType, color: "neutral", style: vision.styles[0] ?? "scandinavian", material: "mixed" }];

  const allMatches: any[] = [];
  const seenIds = new Set<number>();

  for (const obj of objects) {
    const objMatches = await matchSingleObject(obj);
    let taken = 0;
    for (const m of objMatches) {
      if (taken >= 2) break;  // maks 2 per objekt
      if (seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      allMatches.push(m);
      taken++;
    }
    if (allMatches.length >= 8) break;
  }

  // Top 3 = same_style, next 3 = alternative
  const top6 = allMatches.slice(0, 6);
  const sameStyle = top6.slice(0, 3);
  const alternative = top6.slice(3, 6);

  const matches = [
    ...sameStyle.map((r, i) => ({ ...r, match_type: "same_style", rank: i + 1 })),
    ...alternative.map((r, i) => ({ ...r, match_type: "alternative", rank: i + 4 })),
  ];

  // Slet gamle matches og indsæt nye
  await pool.query(`DELETE FROM product_matches WHERE design_id = $1`, [designId]);

  for (const m of matches) {
    await pool.query(`
      INSERT INTO product_matches (design_id, product_id, match_score, match_type, rank)
      VALUES ($1, $2, $3, $4, $5)
    `, [designId, m.id, m.score, m.match_type, m.rank]);
  }

  return matches;
}

// ── D. Hoved-pipeline — kaldes når billede er completed ──────────────────────
export async function runAffiliatePipeline(
  designId: number,
  resultImageUrl: string,
  roomType: string,
): Promise<void> {
  try {
    log(`[Affiliate] Design ${designId}: starting vision analysis...`);
    const vision = await analyzeVision(resultImageUrl, roomType);

    await pool.query(
      `UPDATE designs SET vision_description = $1 WHERE id = $2`,
      [vision.description, designId],
    );
    log(`[Affiliate] Design ${designId}: vision="${vision.description?.slice(0, 80)}" objects=${vision.objects?.length ?? 0}`);

    const matches = await matchProducts(designId, vision, roomType);
    log(`[Affiliate] Design ${designId}: ${matches.length} product matches saved`);
  } catch (err: any) {
    log(`[Affiliate] Design ${designId}: pipeline error — ${err.message}`);
  }
}
