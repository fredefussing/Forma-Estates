let extractor: any = null;

async function getExtractor() {
  if (!extractor) {
    const { pipeline } = await import("@xenova/transformers");
    extractor = await pipeline("image-feature-extraction", "Xenova/clip-vit-base-patch32");
  }
  return extractor;
}

export async function getClipEmbedding(imageUrl: string): Promise<number[]> {
  const extract = await getExtractor();
  const output = await extract(imageUrl, { pooling: "mean", normalize: true });
  const embedding: number[] = Array.from(output.data as Float32Array);

  if (embedding.length !== 512) {
    throw new Error(`Uventet embedding-dimension: ${embedding.length} (forventet 512)`);
  }

  return embedding;
}
