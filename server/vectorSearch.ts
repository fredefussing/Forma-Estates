import { pool } from "./db";
import type { FurnitureDescription } from "./describeWithVision";
import { DANISH_SYNONYMS } from "./describeWithVision";

const YOLO_TO_CATEGORY: Record<string, string[]> = {
  "sofa":         ["Sofaer"],
  "couch":        ["Sofaer"],
  "chair":        ["Stole", "Lænestole", "Spisebordsstole", "Gulvstole", "Barstole"],
  "bed":          ["Senge"],
  "dining table": ["Spiseborde"],
  "table":        ["Sofaborde", "Spiseborde", "Sideborde"],
  "potted plant": ["Plantekrukker"],
  "lamp":         ["Lamper"],
  "tv":           ["TV-møbler"],
  "book":         ["Bogskabe"],
  "mirror":       ["Spejle"],
  "bench":        ["Stole"],
  "rug":          ["Tæpper"],
  "carpet":       ["Tæpper"],
  "cabinet":      ["Skabe", "Skænke"],
  "shelf":        ["Reoler", "Bogskabe"],
};

const VISION_TYPE_TO_CATEGORY: Record<string, string[]> = {
  "lounge_chair": ["Lænestole", "Stole"],
  "dining_chair": ["Spisebordsstole", "Stole"],
  "chair":        ["Stole", "Lænestole", "Gulvstole", "Spisebordsstole"],
  "sofa":         ["Sofaer"],
  "coffee_table": ["Sofaborde"],
  "side_table":   ["Sofaborde", "Sideborde", "Natborde"],
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
  "parasol", "balkon", "polyrattan",
];

function getCategoryKeywords(
  description: FurnitureDescription | null,
  yoloLabel: string,
): string[] {
  const effectiveType = description?.type ?? yoloLabel;
  return (
    VISION_TYPE_TO_CATEGORY[effectiveType.toLowerCase()] ??
    YOLO_TO_CATEGORY[effectiveType.toLowerCase()] ??
    []
  );
}

async function getRelaxedCandidates(
  vectorParam: string,
  description: FurnitureDescription | null,
  yoloLabel: string,
  limit: number,
): Promise<any[]> {
  const categoryKeywords = getCategoryKeywords(description, yoloLabel);
  const isIndoor = description ? description.indoor !== false : true;

  const params: any[] = [vectorParam, limit];
  let idx = 3;

  const conditions: string[] = ["p.vector_clip IS NOT NULL"];

  if (categoryKeywords.length > 0) {
    const catConds = categoryKeywords.map(() => `p.category ILIKE $${idx++}`).join(" OR ");
    conditions.push(`(${catConds})`);
    categoryKeywords.forEach((k) => params.push(`%${k}%`));
  }

  if (isIndoor) {
    const outdoorConds = OUTDOOR_TERMS.map(() => `p.name NOT ILIKE $${idx++}`).join(" AND ");
    conditions.push(`(${outdoorConds})`);
    OUTDOOR_TERMS.forEach((t) => params.push(`%${t}%`));
  }

  const whereClause = conditions.join(" AND ");

  const sql = `
    SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
           1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
    FROM products p
    WHERE ${whereClause}
    ORDER BY p.vector_clip <=> $1::vector(512)
    LIMIT $2
  `;

  const result = await pool.query(sql, params);

  if (result.rows.length >= 10) {
    console.log(`Relaxed kandidater: ${result.rows.length} (kategori+outdoor filter)`);
    return result.rows;
  }

  console.log(`Kun ${result.rows.length} kandidater med kategorifilter — prøver uden kategori`);
  const broadParams = [vectorParam, limit];
  let broadIdx = 3;
  const broadConditions = ["p.vector_clip IS NOT NULL"];

  if (isIndoor) {
    const outdoorConds = OUTDOOR_TERMS.map(() => `p.name NOT ILIKE $${broadIdx++}`).join(" AND ");
    broadConditions.push(`(${outdoorConds})`);
    OUTDOOR_TERMS.forEach((t) => broadParams.push(`%${t}%`));
  }

  const broadSQL = `
    SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
           1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
    FROM products p
    WHERE ${broadConditions.join(" AND ")}
    ORDER BY p.vector_clip <=> $1::vector(512)
    LIMIT $2
  `;

  const broadResult = await pool.query(broadSQL, broadParams);
  console.log(`Bred fallback: ${broadResult.rows.length} kandidater`);
  return broadResult.rows;
}

function scoreCategoryMatch(
  productCategory: string,
  description: FurnitureDescription | null,
  yoloLabel: string,
): number {
  const keywords = getCategoryKeywords(description, yoloLabel);
  if (keywords.length === 0) return 0;
  const cat = productCategory.toLowerCase();
  return keywords.some((k) => cat.includes(k.toLowerCase())) ? 1 : 0;
}

function scoreColorMatch(
  productName: string,
  description: FurnitureDescription | null,
  colorTerms: string[],
): number {
  const name = productName.toLowerCase();
  const terms: string[] = [];

  if (description?.color) {
    const colorKey = description.color.toLowerCase().replace(/\s+/g, "_");
    const da = DANISH_SYNONYMS[colorKey] ?? DANISH_SYNONYMS[description.color.toLowerCase()];
    if (da) terms.push(...da);
  }

  terms.push(...colorTerms);

  if (terms.length === 0) return 0;
  const uniqueTerms = [...new Set(terms)];
  const matches = uniqueTerms.filter((t) => name.includes(t.toLowerCase())).length;
  return Math.min(matches / Math.max(1, uniqueTerms.length) * 3, 1);
}

function scoreMaterialMatch(
  productName: string,
  description: FurnitureDescription | null,
): number {
  if (!description?.material) return 0;
  const matDa = DANISH_SYNONYMS[description.material.toLowerCase()];
  if (!matDa) return 0;
  const name = productName.toLowerCase();
  const matches = matDa.filter((t) => name.includes(t.toLowerCase())).length;
  return Math.min(matches / Math.max(1, matDa.length) * 3, 1);
}

function deduplicateByName(scored: any[]): any[] {
  const seen = new Set<string>();
  const result: any[] = [];

  for (const p of scored) {
    const baseName = p.name
      .replace(/\s*-\s*[^-]+(\/.*)?$/, "")
      .replace(/\d+\s*x\s*\d+(\s*cm)?/gi, "")
      .replace(/\d+\s*cm/gi, "")
      .trim()
      .toLowerCase();

    if (!seen.has(baseName)) {
      seen.add(baseName);
      result.push(p);
    }
  }

  return result;
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

  const candidates = await getRelaxedCandidates(vectorParam, desc, label, 200);

  const scored = candidates.map((row) => {
    const clipScore = parseFloat(row.clip_similarity);
    const categoryScore = scoreCategoryMatch(row.category ?? "", desc, label);
    const colorScore = scoreColorMatch(row.name, desc, colorTerms);
    const materialScore = scoreMaterialMatch(row.name, desc);

    const finalScore =
      0.40 * clipScore +
      0.25 * categoryScore +
      0.20 * colorScore +
      0.15 * materialScore;

    return { ...row, finalScore, clipScore, categoryScore, colorScore, materialScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const deduped = deduplicateByName(scored);

  const top = deduped.slice(0, topK + 2);

  console.log(
    `Top 3 scores: ${top
      .slice(0, 3)
      .map(
        (p) =>
          `"${p.name.substring(0, 30)}" clip=${p.clipScore.toFixed(2)} cat=${p.categoryScore} color=${p.colorScore.toFixed(2)} mat=${p.materialScore.toFixed(2)} → ${p.finalScore.toFixed(2)}`,
      )
      .join(" | ")}`,
  );

  return top.map((p) => ({
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
