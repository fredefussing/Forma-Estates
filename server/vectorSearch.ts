import { pool } from "./db";

export async function findSimilarProducts(queryVector: number[], topK: number = 5) {
  const result = await pool.query(
    `
    SELECT 
      id,
      name,
      price,
      image_url,
      affiliate_link,
      shop,
      1 - (vector_clip <=> $1::vector(512)) AS similarity
    FROM products
    WHERE vector_clip IS NOT NULL
    ORDER BY vector_clip <=> $1::vector(512)
    LIMIT $2
    `,
    [JSON.stringify(queryVector), topK]
  );

  return result.rows;
}
