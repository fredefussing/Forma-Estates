import { pool } from "./db";
import type { FurnitureDescription } from "./describeWithVision";
import { DANISH_SYNONYMS } from "./describeWithVision";

const YOLO_TO_CATEGORY: Record<string, string[]> = {
  "sofa":         ["Sofaer", "Sofa"],
  "couch":        ["Sofaer", "Sofa"],
  "chair":        ["Stole", "Lænestole", "Spisebordsstole", "Gulvstole"],
  "bed":          ["Senge", "sengeramme"],
  "dining table": ["Spiseborde"],
  "table":        ["Sofaborde", "Spiseborde"],
  "potted plant": ["Plante"],
  "lamp":         ["Lamper"],
  "tv":           ["TV-møbler"],
  "book":         ["Bogskabe", "Reoler"],
  "mirror":       ["Spejl"],
  "bench":        ["Stole"],
  "refrigerator": ["Køleskab"],
  "oven":         ["Ovn"],
  "sink":         ["badeværelse"],
  "rug":          ["Tæpper"],
  "carpet":       ["Tæpper"],
  "cabinet":      ["Skabe", "Reoler", "Skænke"],
  "shelf":        ["Reoler", "Bogskabe"],
};

const VISION_TYPE_TO_CATEGORY: Record<string, string[]> = {
  "lounge_chair": ["Lænestole", "Stole"],
  "dining_chair": ["Spisebordsstole", "Stole"],
  "chair":        ["Stole", "Lænestole", "Gulvstole", "Spisebordsstole"],
  "sofa":         ["Sofaer"],
  "coffee_table": ["Sofaborde"],
  "side_table":   ["Sofaborde", "Natborde"],
  "dining_table": ["Spiseborde"],
  "bed":          ["Senge"],
  "nightstand":   ["Natborde"],
  "lamp":         ["Lamper"],
  "rug":          ["Tæpper"],
  "cabinet":      ["Skabe", "Skænke"],
  "shelf":        ["Reoler", "Bogskabe"],
  "mirror":       ["Spejle"],
  "bench":        ["Stole"],
  "table":        ["Sofaborde", "Spiseborde"],
};

const OUTDOOR_TERMS = [
  "udendørs", "have", "terrasse", "solstol", "liggestol",
  "parasol", "havemøbler", "balkon", "polyrattan",
];

function buildSQLFilter(
  description: FurnitureDescription | null,
  yoloLabel: string,
  colorTerms: string[],
): { whereClause: string; params: any[] } {
  const conditions: string[] = ["p.vector_clip IS NOT NULL"];
  const params: any[] = [];
  let idx = 1;

  const effectiveType = description?.type ?? yoloLabel;
  const categoryKeywords =
    VISION_TYPE_TO_CATEGORY[effectiveType.toLowerCase()] ??
    YOLO_TO_CATEGORY[effectiveType.toLowerCase()] ??
    [];

  if (categoryKeywords.length > 0) {
    const catConds = categoryKeywords.map(() => `p.category ILIKE $${idx++}`).join(" OR ");
    conditions.push(`(${catConds})`);
    categoryKeywords.forEach((k) => params.push(`%${k}%`));
  }

  const isIndoor = description ? description.indoor !== false : true;
  if (isIndoor) {
    const outdoorConds = OUTDOOR_TERMS.map(
      () => `p.name NOT ILIKE $${idx++}`
    ).join(" AND ");
    conditions.push(`(${outdoorConds})`);
    OUTDOOR_TERMS.forEach((t) => params.push(`%${t}%`));
  }

  const attributeTerms: string[] = [];

  if (description) {
    const colorKey = description.color?.toLowerCase().replace(/\s+/g, "_");
    const colorDa = DANISH_SYNONYMS[colorKey] ?? DANISH_SYNONYMS[description.color?.toLowerCase()];
    if (colorDa) attributeTerms.push(...colorDa);

    const matDa = DANISH_SYNONYMS[description.material?.toLowerCase()];
    if (matDa) attributeTerms.push(...matDa);
  } else if (colorTerms.length > 0) {
    attributeTerms.push(...colorTerms);
  }

  const uniqueTerms = [...new Set(attributeTerms)];

  if (uniqueTerms.length > 0) {
    const attrConds = uniqueTerms.map(() => `p.name ILIKE $${idx++}`).join(" OR ");
    conditions.push(`(${attrConds})`);
    uniqueTerms.forEach((t) => params.push(`%${t}%`));
  }

  return {
    whereClause: conditions.join(" AND "),
    params,
  };
}

function calculateAttributeScore(
  productName: string,
  productCategory: string,
  searchTerms: string[],
): number {
  if (searchTerms.length === 0) return 0;
  const name = productName.toLowerCase();
  const cat = productCategory.toLowerCase();
  let matches = 0;
  for (const term of searchTerms) {
    if (name.includes(term) || cat.includes(term)) matches++;
  }
  return matches / searchTerms.length;
}

function buildSearchTerms(
  description: FurnitureDescription | null,
  colorTerms: string[],
): string[] {
  if (!description) return colorTerms;

  const terms: string[] = [];

  const colorKey = description.color?.toLowerCase().replace(/\s+/g, "_");
  const colorDa = DANISH_SYNONYMS[colorKey] ?? DANISH_SYNONYMS[description.color?.toLowerCase()];
  if (colorDa) terms.push(...colorDa);

  const matDa = DANISH_SYNONYMS[description.material?.toLowerCase()];
  if (matDa) terms.push(...matDa);

  const styleDa = DANISH_SYNONYMS[description.style?.toLowerCase()];
  if (styleDa) terms.push(...styleDa);

  if (description.legs) {
    const legs = description.legs.toLowerCase();
    if (legs.includes("oak") || legs.includes("wood")) terms.push("eg", "natur", "træben");
    if (legs.includes("metal") || legs.includes("black")) terms.push("metal", "sort");
  }

  return [...new Set(terms)];
}

async function getSQLFirstCandidates(
  vectorParam: string,
  description: FurnitureDescription | null,
  yoloLabel: string,
  colorTerms: string[],
  limit: number,
): Promise<any[]> {
  const { whereClause, params } = buildSQLFilter(description, yoloLabel, colorTerms);

  const vectorIdx = params.length + 1;
  const limitIdx = params.length + 2;

  const sqlFiltered = `
    SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
           1 - (p.vector_clip <=> $${vectorIdx}::vector(512)) AS clip_similarity
    FROM products p
    WHERE ${whereClause}
    ORDER BY p.vector_clip <=> $${vectorIdx}::vector(512)
    LIMIT $${limitIdx}
  `;

  const filteredResult = await pool.query(sqlFiltered, [
    ...params,
    vectorParam,
    limit,
  ]);

  if (filteredResult.rows.length >= 5) {
    console.log(`SQL-first: ${filteredResult.rows.length} kandidater (filtreret)`);
    return filteredResult.rows;
  }

  console.log(`SQL-first gav kun ${filteredResult.rows.length} resultater — falder tilbage til bredere søgning`);

  const effectiveType = description?.type ?? yoloLabel;
  const categoryKeywords =
    VISION_TYPE_TO_CATEGORY[effectiveType.toLowerCase()] ??
    YOLO_TO_CATEGORY[effectiveType.toLowerCase()] ??
    [];

  if (categoryKeywords.length > 0) {
    const catConds = categoryKeywords.map((_, i) => `p.category ILIKE $${i + 3}`).join(" OR ");
    const fallbackSQL = `
      SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
             1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
      FROM products p
      WHERE p.vector_clip IS NOT NULL AND (${catConds})
      ORDER BY p.vector_clip <=> $1::vector(512)
      LIMIT $2
    `;
    const fallbackResult = await pool.query(fallbackSQL, [
      vectorParam,
      limit,
      ...categoryKeywords.map((k) => `%${k}%`),
    ]);
    if (fallbackResult.rows.length >= 5) {
      console.log(`Kategori-fallback: ${fallbackResult.rows.length} resultater`);
      return fallbackResult.rows;
    }
  }

  const broadSQL = `
    SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
           1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
    FROM products p
    WHERE p.vector_clip IS NOT NULL
    ORDER BY p.vector_clip <=> $1::vector(512)
    LIMIT $2
  `;
  const broadResult = await pool.query(broadSQL, [vectorParam, limit]);
  console.log(`Bred fallback: ${broadResult.rows.length} resultater`);
  return broadResult.rows;
}

export async function findSimilarProductsHybrid(
  queryVector: number[],
  topK: number = 5,
  yoloLabel?: string,
  description?: FurnitureDescription | null,
  colorTerms: string[] = [],
) {
  const vectorParam = JSON.stringify(queryVector);
  const label = yoloLabel ?? "";
  const desc = description ?? null;

  const candidates = await getSQLFirstCandidates(vectorParam, desc, label, colorTerms, 80);

  const searchTerms = buildSearchTerms(desc, colorTerms);

  const scored = candidates.map((row) => {
    const clipScore = parseFloat(row.clip_similarity);
    const attrScore = calculateAttributeScore(row.name, row.category ?? "", searchTerms);
    const finalScore = searchTerms.length > 0
      ? 0.6 * clipScore + 0.4 * attrScore
      : clipScore;
    return { ...row, finalScore, clipScore, attrScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const seenBaseNames = new Set<string>();
  const deduped: typeof scored = [];

  for (const p of scored) {
    const baseName = p.name
      .replace(/\s*-\s*\w+\s*\/\s*.*/g, "")
      .replace(/\d+\s*x\s*\d+\s*(cm)?/gi, "")
      .replace(/\d+\s*cm/gi, "")
      .trim()
      .toLowerCase();

    if (!seenBaseNames.has(baseName)) {
      seenBaseNames.add(baseName);
      deduped.push(p);
    }
    if (deduped.length >= topK + 3) break;
  }

  const top10 = deduped.slice(0, 10);
  const budgetCandidate = [...top10].sort(
    (a, b) => parseFloat(a.price) - parseFloat(b.price)
  )[0];

  const finalResults: typeof scored = [];
  for (const p of deduped) {
    if (finalResults.length >= topK + 2) break;
    if (!finalResults.find((r) => r.id === p.id)) finalResults.push(p);
  }

  if (budgetCandidate && !finalResults.find((r) => r.id === budgetCandidate.id)) {
    finalResults.push(budgetCandidate);
  }

  return finalResults.slice(0, topK + 2).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image_url: p.image_url,
    affiliate_link: p.affiliate_link,
    shop: p.shop,
    similarity: p.finalScore,
  }));
}

export async function findSimilarProducts(
  queryVector: number[],
  topK: number = 5,
  yoloLabel?: string,
) {
  return findSimilarProductsHybrid(queryVector, topK, yoloLabel, null, []);
}
