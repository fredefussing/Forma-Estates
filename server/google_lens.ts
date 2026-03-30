export interface GoogleLensProduct {
  method: "google_lens";
  name: string;
  source: string;
  price: number;
  currency: string;
  link: string;
  thumbnail: string;
  inStock: boolean;
}

export async function searchWithGoogleLens(imageUrl: string): Promise<GoogleLensProduct[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.warn("SERPAPI_KEY not configured, skipping Google Lens");
    return [];
  }

  try {
    const params = new URLSearchParams({
      engine: "google_lens",
      url: imageUrl,
      api_key: apiKey,
      country: "dk",
      hl: "da",
    });

    const response = await fetch(`https://serpapi.com/search?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.error(`Google Lens API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    const knownStores = ["ikea", "jysk", "ilva", "bolia", "hay", "bahne", "menu", "nordic dream", "droemmeland", "drømmeland", "lightpoint", "sengeeksperten", "sengefabrikken"];

    const shoppingResults = (data.visual_matches ?? []).filter((item: any) => {
      const hasPrice = item.price && (item.price.value || item.price.extracted_value);
      const sourceLower = (item.source ?? "").toLowerCase();
      const isKnownStore = knownStores.some((s) => sourceLower.includes(s));
      return hasPrice && (isKnownStore || item.link);
    });

    return shoppingResults
      .sort((a: any, b: any) => {
        const aPrice = parseFloat(a.price?.extracted_value ?? a.price?.value ?? "0");
        const bPrice = parseFloat(b.price?.extracted_value ?? b.price?.value ?? "0");
        return aPrice - bPrice;
      })
      .slice(0, 3)
      .map((item: any) => ({
        method: "google_lens" as const,
        name: item.title ?? item.name ?? "Produkt",
        source: item.source ?? "Ukendt butik",
        price: parseFloat(item.price?.extracted_value ?? item.price?.value ?? "0"),
        currency: item.price?.currency ?? "DKK",
        link: item.link ?? "",
        thumbnail: item.thumbnail ?? "",
        inStock: item.in_stock !== false,
      }));
  } catch (error: any) {
    console.error("Google Lens error:", error.message);
    return [];
  }
}
