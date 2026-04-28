import { pool } from "./db";
import type { FurnitureDescription } from "./describeWithVision";

const YOLO_TO_CATEGORY: Record<string, string[]> = {
  "sofa":         ["Sofa"],
  "couch":        ["Sofa"],
  "chair":        ["stole", "Lænestole"],
  "bed":          ["Seng"],
  "dining table": ["Spisebord", "bord"],
  "table":        ["bord", "Sofaborde"],
  "potted plant": ["Plante"],
  "lamp":         ["Lamper"],
  "tv":           ["TV"],
  "book":         ["Bogskabe"],
  "mirror":       ["Spejl"],
  "bench":        ["stole"],
  "refrigerator": ["Køleskab"],
  "oven":         ["Ovn"],
  "sink":         ["badeværelse"],
  "rug":          ["Tæpper"],
  "carpet":       ["Tæpper"],
  "cabinet":      ["Skabe", "Reoler"],
  "shelf":        ["Reoler"],
};

const VISION_TYPE_TO_CATEGORY: Record<string, string[]> = {
  "sofa":    ["Sofa"],
  "chair":   ["stole", "Lænestole"],
  "bed":     ["Seng"],
  "table":   ["bord", "Sofaborde", "Spisebord"],
  "lamp":    ["Lamper"],
  "rug":     ["Tæpper"],
  "cabinet": ["Skabe"],
  "shelf":   ["Reoler"],
  "mirror":  ["Spejl"],
  "bench":   ["stole"],
};

const COLOR_TO_DA: Record<string, string[]> = {
  "beige":       ["beige", "sand", "natur"],
  "cream":       ["cream", "råhvid", "off-white"],
  "white":       ["hvid", "white", "lys"],
  "light beige": ["beige", "cream", "sand", "natur"],
  "dark brown":  ["mørkebrun", "brun", "valnød", "walnut"],
  "light brown": ["lysebrun", "brun", "eg", "natur", "oak"],
  "black":       ["sort", "black"],
  "gray":        ["grå", "grey"],
  "grey":        ["grå", "grey"],
  "blue":        ["blå", "navy"],
  "green":       ["grøn", "olive", "sage"],
  "yellow":      ["gul", "okker"],
  "orange":      ["orange", "terra"],
  "pink":        ["lyserød", "rosa"],
  "walnut":      ["valnød", "walnut", "mørkebrun"],
  "oak":         ["eg", "natur", "oak"],
  "natural":     ["natur", "eg", "naturlig"],
};

const MATERIAL_TO_DA: Record<string, string[]> = {
  "fabric":   ["stof", "tekstil"],
  "leather":  ["læder", "kunstlæder"],
  "velvet":   ["velour", "velvet", "fløjl"],
  "boucle":   ["boucle", "bouclé"],
  "rattan":   ["rattan", "flet", "kurv", "bambus"],
  "wood":     ["træ", "eg", "massivt"],
  "metal":    ["metal", "stål", "jern"],
  "glass":    ["glas"],
};

const STYLE_TO_DA: Record<string, string[]> = {
  "scandinavian": ["skandinavisk", "nordisk", "natur", "eg"],
  "minimalist":   ["minimalistisk", "simpel"],
  "modern":       ["moderne", "minimalistisk"],
  "industrial":   ["industriel", "metal"],
  "bohemian":     ["rattan", "flet", "boho"],
  "luxury":       ["eksklusiv", "luksus", "velour"],
  "rustic":       ["rustikal", "natur"],
  "classic":      ["klassisk", "traditionel"],
};

function descriptionToSearchTerms(desc: FurnitureDescription): string[] {
  const terms: string[] = [];

  const colorWords = desc.color.toLowerCase().split(/\s+/);
  for (const word of colorWords) {
    const da = COLOR_TO_DA[word] ?? COLOR_TO_DA[desc.color.toLowerCase()];
    if (da) terms.push(...da);
  }
  if (COLOR_TO_DA[desc.color.toLowerCase()]) {
    terms.push(...COLOR_TO_DA[desc.color.toLowerCase()]);
  }

  const matTerms = MATERIAL_TO_DA[desc.material.toLowerCase()];
  if (matTerms) terms.push(...matTerms);

  const styleTerms = STYLE_TO_DA[desc.style.toLowerCase()];
  if (styleTerms) terms.push(...styleTerms);

  if (desc.legs) {
    const legWords = desc.legs.toLowerCase();
    if (legWords.includes("oak") || legWords.includes("wood") || legWords.includes("light")) {
      terms.push("eg", "natur", "træben");
    }
    if (legWords.includes("metal") || legWords.includes("black")) {
      terms.push("metal", "sort");
    }
  }

  return [...new Set(terms)];
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

async function getCandidates(
  vectorParam: string,
  categoryKeywords: string[],
  candidateCount: number,
): Promise<any[]> {
  if (categoryKeywords.length > 0) {
    const conditions = categoryKeywords
      .map((_, i) => `category ILIKE $${i + 3}`)
      .join(" OR ");

    const result = await pool.query(
      `
      SELECT id, name, price, image_url, affiliate_link, shop, category,
             1 - (vector_clip <=> $1::vector(512)) AS clip_similarity
      FROM products
      WHERE vector_clip IS NOT NULL AND (${conditions})
      ORDER BY vector_clip <=> $1::vector(512)
      LIMIT $2
      `,
      [vectorParam, candidateCount, ...categoryKeywords.map((k) => `%${k}%`)],
    );

    if (result.rows.length >= 10) return result.rows;
  }

  const fallback = await pool.query(
    `
    SELECT id, name, price, image_url, affiliate_link, shop, category,
           1 - (vector_clip <=> $1::vector(512)) AS clip_similarity
    FROM products
    WHERE vector_clip IS NOT NULL
    ORDER BY vector_clip <=> $1::vector(512)
    LIMIT $2
    `,
    [vectorParam, candidateCount],
  );
  return fallback.rows;
}

export async function findSimilarProductsHybrid(
  queryVector: number[],
  topK: number = 5,
  yoloLabel?: string,
  description?: FurnitureDescription | null,
  colorTerms: string[] = [],
) {
  const vectorParam = JSON.stringify(queryVector);

  const effectiveType = description?.type ?? yoloLabel ?? "";
  const categoryKeywords =
    VISION_TYPE_TO_CATEGORY[effectiveType.toLowerCase()] ??
    YOLO_TO_CATEGORY[effectiveType.toLowerCase()] ??
    [];

  const searchTerms = description
    ? descriptionToSearchTerms(description)
    : colorTerms;

  const candidates = await getCandidates(vectorParam, categoryKeywords, 50);

  const scored = candidates.map((row) => {
    const clipScore = parseFloat(row.clip_similarity);
    const attrScore = calculateAttributeScore(row.name, row.category ?? "", searchTerms);
    const finalScore = searchTerms.length > 0
      ? 0.6 * clipScore + 0.4 * attrScore
      : clipScore;
    return { ...row, finalScore, clipScore, attrScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const top10 = scored.slice(0, 10);
  const budget = [...top10].sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];

  const dedupedResults: typeof scored = [];
  for (const p of scored) {
    if (dedupedResults.length >= topK + 2) break;
    if (!dedupedResults.find((r) => r.id === p.id)) {
      dedupedResults.push(p);
    }
  }

  if (budget && !dedupedResults.find((r) => r.id === budget.id)) {
    dedupedResults.push(budget);
  }

  return dedupedResults.slice(0, topK + 2).map((p) => ({
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
