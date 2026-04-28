import { pool } from "./db";

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
};

export async function findSimilarProducts(
  queryVector: number[],
  topK: number = 5,
  yoloLabel?: string,
) {
  const vectorParam = JSON.stringify(queryVector);
  const categoryKeywords = yoloLabel
    ? (YOLO_TO_CATEGORY[yoloLabel.toLowerCase()] ?? [])
    : [];

  if (categoryKeywords.length > 0) {
    const conditions = categoryKeywords
      .map((_, i) => `category ILIKE $${i + 3}`)
      .join(" OR ");

    const filtered = await pool.query(
      `
      SELECT
        id, name, price, image_url, affiliate_link, shop,
        1 - (vector_clip <=> $1::vector(512)) AS similarity
      FROM products
      WHERE vector_clip IS NOT NULL AND (${conditions})
      ORDER BY vector_clip <=> $1::vector(512)
      LIMIT $2
      `,
      [vectorParam, topK, ...categoryKeywords.map((k) => `%${k}%`)],
    );

    if (filtered.rows.length >= 3) {
      return filtered.rows;
    }
  }

  const result = await pool.query(
    `
    SELECT
      id, name, price, image_url, affiliate_link, shop,
      1 - (vector_clip <=> $1::vector(512)) AS similarity
    FROM products
    WHERE vector_clip IS NOT NULL
    ORDER BY vector_clip <=> $1::vector(512)
    LIMIT $2
    `,
    [vectorParam, topK],
  );

  return result.rows;
}

export async function findSimilarProductsWithTags(
  queryVector: number[],
  topK: number = 5,
  yoloLabel?: string,
  colorTerms: string[] = [],
  styleTerms: string[] = [],
) {
  const vectorParam = JSON.stringify(queryVector);
  const categoryKeywords = yoloLabel
    ? (YOLO_TO_CATEGORY[yoloLabel.toLowerCase()] ?? [])
    : [];

  const allTextTerms = [...colorTerms, ...styleTerms];

  if (categoryKeywords.length > 0 && allTextTerms.length > 0) {
    let paramIdx = 3;
    const catConditions = categoryKeywords.map(() => `category ILIKE $${paramIdx++}`).join(" OR ");
    const nameConditions = allTextTerms.map(() => `name ILIKE $${paramIdx++}`).join(" OR ");

    const narrowResult = await pool.query(
      `
      SELECT id, name, price, image_url, affiliate_link, shop,
             1 - (vector_clip <=> $1::vector(512)) AS similarity
      FROM products
      WHERE vector_clip IS NOT NULL
        AND (${catConditions})
        AND (${nameConditions})
      ORDER BY vector_clip <=> $1::vector(512)
      LIMIT $2
      `,
      [
        vectorParam,
        topK,
        ...categoryKeywords.map((k) => `%${k}%`),
        ...allTextTerms.map((t) => `%${t}%`),
      ],
    );

    if (narrowResult.rows.length >= 3) {
      return narrowResult.rows;
    }

    const catResult = await pool.query(
      `
      SELECT id, name, price, image_url, affiliate_link, shop,
             1 - (vector_clip <=> $1::vector(512)) AS similarity
      FROM products
      WHERE vector_clip IS NOT NULL
        AND (${catConditions})
      ORDER BY vector_clip <=> $1::vector(512)
      LIMIT $2
      `,
      [vectorParam, topK, ...categoryKeywords.map((k) => `%${k}%`)],
    );

    if (catResult.rows.length >= 3) {
      return catResult.rows;
    }
  }

  return findSimilarProducts(queryVector, topK, yoloLabel);
}
