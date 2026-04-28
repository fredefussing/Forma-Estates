let imageExtractor: any = null;
let clipTextState: { tokenizer: any; model: any } | null = null;

async function getImageExtractor() {
  if (!imageExtractor) {
    const { pipeline } = await import("@xenova/transformers");
    imageExtractor = await pipeline("image-feature-extraction", "Xenova/clip-vit-base-patch32");
  }
  return imageExtractor;
}

async function getClipTextState() {
  if (!clipTextState) {
    const { CLIPTextModelWithProjection, AutoTokenizer } = await import("@xenova/transformers");
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch32"),
      CLIPTextModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32"),
    ]);
    clipTextState = { tokenizer, model };
  }
  return clipTextState;
}

export async function getClipEmbedding(imageUrl: string): Promise<number[]> {
  const extract = await getImageExtractor();
  const output = await extract(imageUrl, { pooling: "mean", normalize: true });
  const embedding: number[] = Array.from(output.data as Float32Array);

  if (embedding.length !== 512) {
    throw new Error(`Uventet embedding-dimension: ${embedding.length} (forventet 512)`);
  }

  return embedding;
}

export async function getClipTextEmbedding(text: string): Promise<number[]> {
  const { tokenizer, model } = await getClipTextState();

  const text_inputs = await tokenizer([text], { padding: true, truncation: true });
  const { text_embeds } = await model(text_inputs);

  const raw: number[] = Array.from(text_embeds.data as Float32Array);

  const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0));
  const embedding = norm > 0 ? raw.map((v) => v / norm) : raw;

  if (embedding.length !== 512) {
    throw new Error(`Uventet text embedding-dimension: ${embedding.length} (forventet 512)`);
  }

  console.log(`CLIP text embedding genereret for: "${text.substring(0, 60)}..."`);
  return embedding;
}
