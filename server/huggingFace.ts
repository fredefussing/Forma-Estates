export async function getClipEmbedding(imageUrl: string): Promise<number[]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) throw new Error("HUGGINGFACE_API_KEY ikke sat");

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Kunne ikke hente billede: ${imageRes.status}`);
  const imageBuffer = await imageRes.arrayBuffer();
  const contentType = imageRes.headers.get("content-type") || "image/jpeg";

  const hfRes = await fetch(
    "https://api-inference.huggingface.co/pipeline/feature-extraction/openai/clip-vit-base-patch32",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": contentType,
      },
      body: imageBuffer,
    }
  );

  if (!hfRes.ok) {
    const err = await hfRes.text();
    throw new Error(`HuggingFace API fejl: ${hfRes.status} - ${err}`);
  }

  const data = await hfRes.json();

  const flat = Array.isArray(data[0]) ? data[0] : data;
  if (!Array.isArray(flat) || flat.length !== 512) {
    throw new Error(`Uventet embedding-format: længde=${Array.isArray(flat) ? flat.length : "?"}`);
  }

  return flat as number[];
}
