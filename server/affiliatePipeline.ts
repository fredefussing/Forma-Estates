import OpenAI from "openai";
import { pool } from "./db";
import fs from "fs";
import path from "path";

const log = (msg: string) => console.log(`${new Date().toLocaleTimeString()} [express] ${msg}`);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── A. Vision analyse — GPT-4o-mini beskriver møbler (base64, ikke URL) ──────
async function analyzeVision(imageUrl: string, roomType: string): Promise<{
  description: string;
  types: string[];
  colors: string[];
  styles: string[];
  materials: string[];
}> {
  // Læs lokalt fra disk (undgår localhost-problem for OpenAI)
  let base64Image: string;
  if (imageUrl.startsWith("/uploads/")) {
    const filePath = path.join(process.cwd(), imageUrl);
    const buf = fs.readFileSync(filePath);
    base64Image = buf.toString("base64");
  } else {
    // Ekstern URL (Collov CDN) — hent som buffer
    const { default: fetch } = await import("node-fetch");
    const res = await fetch(imageUrl);
    const arr = await res.arrayBuffer();
    base64Image = Buffer.from(arr).toString("base64");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Analyze furniture in this AI-generated ${roomType} image. Return ONLY JSON:
{ "description": "brief one sentence", "types": ["sofa","coffee_table","lamp"], "colors": ["grey","white"], "styles": ["scandinavian"], "materials": ["fabric","wood"] }
Use these exact type values: sofa, lounge_chair, dining_chair, bed, lamp, floor_lamp, dining_table, coffee_table, side_table, bookshelf, mirror, rug, curtain, sideboard, wardrobe.`
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Analyze this ${roomType}.` },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "low" } }
        ]
      }
    ],
    max_tokens: 300,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content || "{}";
  return JSON.parse(raw);
}

// ── B. Match produkter via tags (jsonb) i products tabel ─────────────────────
async function matchProducts(
  designId: number,
  vision: { types: string[]; colors: string[]; styles: string[]; materials: string[] },
  roomType: string,
): Promise<any[]> {
  const types = vision.types.length > 0 ? vision.types : [roomType];
  const colors = vision.colors.length > 0 ? vision.colors : [];
  const styles = vision.styles.length > 0 ? vision.styles : [];
  const materials = vision.materials.length > 0 ? vision.materials : [];

  const { rows } = await pool.query<{
    id: number; name: string; name_en: string | null; price: string;
    image_url: string; affiliate_link: string; shop: string; tags: any; score: number;
  }>(`
    SELECT
      p.id, p.name, p.name_en, p.price,
      p.image_url, p.affiliate_link, p.shop, p.tags,
      (
        CASE WHEN p.tags->>'type' = ANY($1::text[]) THEN 60 ELSE 0 END +
        CASE WHEN p.tags->>'color' = ANY($2::text[]) THEN 25 ELSE 0 END +
        CASE WHEN p.tags->>'style' = ANY($3::text[]) THEN 20 ELSE 0 END +
        CASE WHEN p.tags->>'material' = ANY($4::text[]) THEN 15 ELSE 0 END
      ) AS score
    FROM products p
    WHERE
      p.image_url IS NOT NULL AND p.image_url != ''
      AND p.affiliate_link IS NOT NULL AND p.affiliate_link != ''
      AND (
        p.tags->>'type' = ANY($1::text[])
        OR p.tags->>'style' = ANY($3::text[])
      )
    ORDER BY score DESC, random()
    LIMIT 12
  `, [types, colors, styles, materials]);

  const sameStyle = rows.slice(0, 3);
  const alternative = rows.slice(3, 6);

  const matches: any[] = [
    ...sameStyle.map((r, i) => ({ ...r, match_type: "same_style", rank: i + 1 })),
    ...alternative.map((r, i) => ({ ...r, match_type: "alternative", rank: i + 4 })),
  ];

  for (const m of matches) {
    await pool.query(`
      INSERT INTO product_matches (design_id, product_id, match_score, match_type, rank)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (design_id, product_id) DO NOTHING
    `, [designId, m.id, m.score, m.match_type, m.rank]);
  }

  return matches;
}

// ── C. Hoved-pipeline — kaldes når billede er completed ──────────────────────
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
    log(`[Affiliate] Design ${designId}: vision="${vision.description.slice(0, 80)}"`);

    const matches = await matchProducts(designId, vision, roomType);
    log(`[Affiliate] Design ${designId}: ${matches.length} product matches saved`);
  } catch (err: any) {
    log(`[Affiliate] Design ${designId}: pipeline error — ${err.message}`);
  }
}
