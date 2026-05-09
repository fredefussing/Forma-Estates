import { pool } from "./db";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface MatchedProduct {
  id: number;
  name: string;
  price: number | null;
  image: string;
  shop: string;
  link: string;
  tags: Record<string, any>;
  score: number;
}

// ─── TRIN 1: Vision beskriver AI-billede ─────────────────────────────────────

export async function describeAiImage(imageUrl: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Beskriv dette AI-genererede rum-design. Fokusér på de 3-5 vigtigste møbler.
For hvert møbel: type, farve, materiale, stil, størrelse.
Format: "Grå fløjlssofa 3-pers skandinavisk. Rundt egetræsbord mellem. Gulvlampe messing moderne."`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    }],
    max_tokens: 300,
    temperature: 0.1,
  });
  return response.choices[0].message.content || "";
}

// ─── TRIN 2: Parse beskrivelse til søgeparametre ──────────────────────────────

interface ParsedDescription {
  types: string[];
  colors: string[];
  materials: string[];
  styles: string[];
}

function parseDescription(desc: string): ParsedDescription {
  const text = desc.toLowerCase();

  const typeMap: Record<string, RegExp> = {
    sofa:     /sofa|sovesofa|chaiselong/i,
    stol:     /stol|lænestol|armstol/i,
    bord:     /bord|spisebord|sofabord/i,
    lampe:    /lampe|pendel|lygte/i,
    spejl:    /spejl/i,
    reol:     /reol|hylde/i,
    kommode:  /kommode|skænk|skab/i,
    seng:     /seng/i,
    tæppe:    /tæppe|gulvtæppe/i,
  };

  const colorMap: Record<string, RegExp> = {
    grå:      /grå|gråt|grey/i,
    hvid:     /hvid|hvidt|white/i,
    sort:     /sort|sorte|black/i,
    beige:    /beige|sand|creme|taupe/i,
    brun:     /brun|brune|brown|valnød/i,
    blå:      /blå|blåt|blue/i,
    grøn:     /grøn|grønt|green/i,
    gul:      /gul|gult|yellow|guld/i,
    rød:      /rød|rødt|red/i,
  };

  const materialMap: Record<string, RegExp> = {
    fløjl:  /fløjl|velour|velvet/i,
    læder:  /læder|kunstlæder/i,
    træ:    /træ|egetræ|eg|natur/i,
    metal:  /metal|stål|jern|messing/i,
    stof:   /stof|tekstil|bomuld/i,
    glas:   /glas|glass/i,
  };

  const styleMap: Record<string, RegExp> = {
    scandinavian: /skandinavisk|nordisk|enkel|minimal/i,
    modern:       /moderne|modern|clean|kontemporær/i,
    industrial:   /industri|raw|rustik|metal/i,
    luxury:       /luksus|luxury|premium|marmor/i,
    coastal:      /coastal|strand|natur|hør/i,
    bohemian:     /boho|bohem|farverig|etnisk/i,
    midcentury:   /retro|midcentury|teak|50s/i,
    farmhouse:    /farmhouse|land|rustik|hvid/i,
    japandi:      /japandi|wabi|japansk|zen/i,
  };

  const found: ParsedDescription = { types: [], colors: [], materials: [], styles: [] };
  for (const [t, rx] of Object.entries(typeMap))     { if (rx.test(text)) found.types.push(t); }
  for (const [c, rx] of Object.entries(colorMap))    { if (rx.test(text)) found.colors.push(c); }
  for (const [m, rx] of Object.entries(materialMap)) { if (rx.test(text)) found.materials.push(m); }
  for (const [s, rx] of Object.entries(styleMap))    { if (rx.test(text)) found.styles.push(s); }
  return found;
}

// ─── TRIN 3: Hybrid tag-baseret søgning ──────────────────────────────────────

const PRICE_RANGES: Record<string, [number, number]> = {
  budget:   [0,    5000],
  standard: [1000, 15000],
  luxury:   [8000, 999999],
};

export async function findProductsForDesign(
  aiImageUrl: string,
  roomType: string,
  styleParam: string,
  budget: string | number | null,
  limit: number = 8,
): Promise<MatchedProduct[]> {
  const description = await describeAiImage(aiImageUrl);
  const parsed = parseDescription(description);

  const targetStyle = parsed.styles[0] || styleParam || "scandinavian";
  const budgetKey = typeof budget === "number"
    ? (budget < 20000 ? "budget" : budget < 60000 ? "standard" : "luxury")
    : (budget as string) || "standard";
  const [minPrice, maxPrice] = PRICE_RANGES[budgetKey] || [0, 999999];

  const midPrice = (minPrice + maxPrice) / 2;
  const priceRange = maxPrice - minPrice || 1;

  const params: any[] = [targetStyle, minPrice, maxPrice, limit * 3];
  let idx = 5;

  const typeCondition = parsed.types.length > 0
    ? `AND tags->>'type' = ANY($${idx++}::text[])`
    : "";
  if (parsed.types.length > 0) params.push(parsed.types);

  const colorCondition = parsed.colors.length > 0
    ? `AND (tags->>'color' = ANY($${idx++}::text[]) OR tags->>'color_family' = ANY($${idx - 1}::text[]))`
    : "";
  if (parsed.colors.length > 0) params.push(parsed.colors);

  const materialCondition = parsed.materials.length > 0
    ? `AND (tags->>'material' = ANY($${idx++}::text[]) OR tags->>'material_family' = ANY($${idx - 1}::text[]))`
    : "";
  if (parsed.materials.length > 0) params.push(parsed.materials);

  const sql = `
    SELECT
      id, name, price::float, image_url, shop, affiliate_link, tags,
      (
        CASE WHEN tags->>'type' = ANY($${parsed.types.length > 0 ? "5" : "null"}::text[])  THEN 40 ELSE 0 END +
        CASE WHEN tags->>'style' = $1                                                       THEN 20 ELSE 0 END +
        CASE WHEN tags->>'color' = ANY(ARRAY['${parsed.colors.join("','")}']::text[])       THEN 25 ELSE 0 END +
        CASE WHEN tags->>'material' = ANY(ARRAY['${parsed.materials.join("','")}']::text[]) THEN 15 ELSE 0 END +
        GREATEST(0, 10 - ABS(price::float - ${ params.indexOf(midPrice) > -1 ? params.indexOf(midPrice) + 1 : idx }) / NULLIF(${ priceRange }, 0) * 10)
      ) AS score
    FROM products
    WHERE tag_processed = TRUE
      AND (tags->>'style' = $1 OR tags->>'style' = 'unknown')
      AND price >= $2
      AND price <= $3
      ${typeCondition}
      ${colorCondition}
      ${materialCondition}
    ORDER BY score DESC, tag_confidence DESC
    LIMIT $4
  `;

  const buildSql = `
    SELECT
      id, name, price::float, image_url, shop, affiliate_link, tags,
      (
        ${parsed.types.length > 0    ? `CASE WHEN tags->>'type' = ANY($5::text[]) THEN 40 ELSE 0 END +` : "0 +"}
        ${parsed.colors.length > 0   ? `CASE WHEN tags->>'color' = ANY($${parsed.types.length > 0 ? 6 : 5}::text[]) THEN 25 ELSE 0 END +` : "0 +"}
        ${parsed.materials.length > 0 ? `CASE WHEN tags->>'material' = ANY($${
            (parsed.types.length > 0 ? 6 : 5) + (parsed.colors.length > 0 ? 1 : 0)
          }::text[]) THEN 15 ELSE 0 END +` : "0 +"}
        CASE WHEN tags->>'style' = $1 THEN 20 ELSE 0 END
      ) AS score
    FROM products
    WHERE tag_processed = TRUE
      AND (tags->>'style' = $1 OR tags->>'style' = 'unknown')
      AND price >= $2
      AND price <= $3
      ${typeCondition}
      ${colorCondition}
      ${materialCondition}
    ORDER BY score DESC, tag_confidence DESC
    LIMIT $4
  `;

  const { rows } = await pool.query(buildSql, params);

  if (rows.length < 4) {
    const fallbackParams = [targetStyle, minPrice, maxPrice, limit];
    const { rows: fallback } = await pool.query(`
      SELECT id, name, price::float, image_url, shop, affiliate_link, tags,
        CASE WHEN tags->>'style' = $1 THEN 20 ELSE 5 END AS score
      FROM products
      WHERE tag_processed = TRUE
        AND price >= $2 AND price <= $3
      ORDER BY score DESC, tag_confidence DESC, random()
      LIMIT $4
    `, fallbackParams);
    return fallback.map(r => ({
      id: r.id, name: r.name, price: r.price,
      image: r.image_url, shop: r.shop, link: r.affiliate_link,
      tags: r.tags || {}, score: Number(r.score),
    }));
  }

  return rows.slice(0, limit).map(r => ({
    id: r.id, name: r.name, price: r.price,
    image: r.image_url, shop: r.shop, link: r.affiliate_link,
    tags: r.tags || {}, score: Number(r.score),
  }));
}

// ─── TRIN 4: Shop This Style (grupperet per type) ─────────────────────────────

export async function getShopThisStyle(
  aiImageUrl: string,
  roomType: string,
  style: string,
  budget: string | number | null,
  limit: number = 8,
): Promise<MatchedProduct[]> {
  const all = await findProductsForDesign(aiImageUrl, roomType, style, budget, limit * 2);

  const grouped: Record<string, MatchedProduct[]> = {};
  for (const p of all) {
    const type = (p.tags?.type as string) || "møbel";
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(p);
  }

  const selected: MatchedProduct[] = [];
  for (const items of Object.values(grouped)) {
    selected.push(...items.slice(0, 2));
    if (selected.length >= limit) break;
  }
  return selected.slice(0, limit);
}
