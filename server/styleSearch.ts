import { pool } from "./db";

export interface StyleProduct {
  id: number;
  name: string;
  image_url: string;
  affiliate_link: string;
  price: number | null;
  shop: string;
  tags: Record<string, any>;
  tag_confidence: number;
  match_score: number;
}

const ROOM_FURNITURE_TYPES: Record<string, string[]> = {
  living_room: ["sofa", "lounge_chair", "coffee_table", "side_table", "lamp", "rug", "shelf", "cabinet"],
  bedroom: ["bed", "nightstand", "lamp", "rug", "cabinet", "lounge_chair"],
  kitchen: ["dining_table", "dining_chair", "lamp", "cabinet", "shelf", "sideboard"],
  bathroom: ["cabinet", "lamp", "mirror", "shelf"],
  dining_room: ["dining_table", "dining_chair", "lamp", "sideboard", "cabinet"],
  office: ["lamp", "shelf", "cabinet", "lounge_chair", "side_table"],
  hallway: ["cabinet", "mirror", "lamp", "rug", "shelf"],
  outdoor: ["sofa", "lounge_chair", "dining_table", "dining_chair", "lamp"],
};

const BUDGET_RANGES: Record<string, { min?: number; max?: number }> = {
  budget: { max: 5000 },
  standard: { min: 1000, max: 15000 },
  luxury: { min: 8000 },
};

export async function getProductsByStyle(
  style: string,
  roomType: string,
  budget: "budget" | "standard" | "luxury" = "standard",
  limit: number = 8,
): Promise<{ products: StyleProduct[]; total_found: number; style: string }> {
  const types = ROOM_FURNITURE_TYPES[roomType] || ["sofa", "lamp", "table", "cabinet"];
  const range = BUDGET_RANGES[budget] || {};

  const priceConditions: string[] = [];
  const params: any[] = [style, types, limit];
  let idx = 4;

  if (range.min != null) {
    priceConditions.push(`price >= $${idx++}`);
    params.push(range.min);
  }
  if (range.max != null) {
    priceConditions.push(`price <= $${idx++}`);
    params.push(range.max);
  }

  const priceWhere = priceConditions.length ? `AND ${priceConditions.join(" AND ")}` : "";

  const sql = `
    SELECT id, name, image_url, affiliate_link, price, shop, tags, tag_confidence,
      (
        CASE WHEN tags->>'style' = $1 THEN 3 ELSE 0 END +
        CASE WHEN tags->>'type' = ANY($2::text[]) THEN 2 ELSE 0 END +
        tag_confidence * 2
      ) as match_score
    FROM products
    WHERE tag_processed = TRUE
      AND tags->>'style' = $1
      AND tags->>'type' = ANY($2::text[])
      AND tag_confidence > 0.55
      ${priceWhere}
    ORDER BY match_score DESC, tag_confidence DESC
    LIMIT $3
  `;

  const result = await pool.query(sql, params);

  if (result.rows.length >= 4) {
    return {
      products: result.rows,
      total_found: result.rows.length,
      style,
    };
  }

  const fallbackParams: any[] = [types, limit];
  let fi = 3;
  const fallbackPrice: string[] = [];
  if (range.min != null) { fallbackPrice.push(`price >= $${fi++}`); fallbackParams.push(range.min); }
  if (range.max != null) { fallbackPrice.push(`price <= $${fi++}`); fallbackParams.push(range.max); }
  const fallbackPriceWhere = fallbackPrice.length ? `AND ${fallbackPrice.join(" AND ")}` : "";

  const fallback = await pool.query(
    `SELECT id, name, image_url, affiliate_link, price, shop, tags, tag_confidence,
       (CASE WHEN tags->>'type' = ANY($1::text[]) THEN 2 ELSE 0 END + tag_confidence) as match_score
     FROM products
     WHERE tag_processed = TRUE AND tags->>'type' = ANY($1::text[]) AND tag_confidence > 0.5
       ${fallbackPriceWhere}
     ORDER BY match_score DESC LIMIT $2`,
    fallbackParams,
  );

  return {
    products: fallback.rows,
    total_found: fallback.rows.length,
    style: `${style} (bredere søgning)`,
  };
}

export async function getCompleteLook(
  style: string,
  roomType: string,
  budget: "budget" | "standard" | "luxury" = "standard",
): Promise<StyleProduct[]> {
  const types = (ROOM_FURNITURE_TYPES[roomType] || []).slice(0, 6);
  const range = BUDGET_RANGES[budget] || {};
  const look: StyleProduct[] = [];

  for (const type of types) {
    const params: any[] = [style, type];
    let idx = 3;
    const priceConds: string[] = [];
    if (range.min != null) { priceConds.push(`price >= $${idx++}`); params.push(range.min); }
    if (range.max != null) { priceConds.push(`price <= $${idx++}`); params.push(range.max); }
    const priceWhere = priceConds.length ? `AND ${priceConds.join(" AND ")}` : "";

    const r = await pool.query(
      `SELECT id, name, image_url, affiliate_link, price, shop, tags, tag_confidence, 3 as match_score
       FROM products
       WHERE tag_processed = TRUE AND tags->>'style' = $1 AND tags->>'type' = $2
         AND tag_confidence > 0.65 ${priceWhere}
       ORDER BY tag_confidence DESC LIMIT 1`,
      params,
    );
    if (r.rows[0]) look.push(r.rows[0]);
  }

  return look;
}

export async function getTagStats(): Promise<{
  total: number;
  tagged: number;
  untagged: number;
  byStyle: Array<{ style: string; count: number; avg_confidence: number }>;
  byType: Array<{ type: string; count: number }>;
}> {
  const [counts, byStyle, byType] = await Promise.all([
    pool.query(`SELECT COUNT(*) as total,
      COUNT(*) FILTER (WHERE tag_processed = TRUE) as tagged,
      COUNT(*) FILTER (WHERE tag_processed = FALSE OR tag_processed IS NULL) as untagged
      FROM products`),
    pool.query(`SELECT tags->>'style' as style, COUNT(*)::int as count,
      ROUND(AVG(tag_confidence)::numeric, 2)::float as avg_confidence
      FROM products WHERE tag_processed = TRUE GROUP BY tags->>'style' ORDER BY count DESC`),
    pool.query(`SELECT tags->>'type' as type, COUNT(*)::int as count
      FROM products WHERE tag_processed = TRUE GROUP BY tags->>'type' ORDER BY count DESC LIMIT 15`),
  ]);

  return {
    total: parseInt(counts.rows[0].total),
    tagged: parseInt(counts.rows[0].tagged),
    untagged: parseInt(counts.rows[0].untagged),
    byStyle: byStyle.rows,
    byType: byType.rows,
  };
}
