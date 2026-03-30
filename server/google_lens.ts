export interface GoogleLensMatch {
  source: string;
  price: number;
  currency: string;
  link: string;
  thumbnail: string;
  inStock: boolean;
}

export interface ProductCategory {
  id: string;
  name: string;
  keywords: string;
  budgetShare: number;
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: "sofa",        name: "Sofa / Lænestol",          keywords: "sofa couch lænestol",                   budgetShare: 0.28 },
  { id: "bord",        name: "Sofabord / Sidobord",       keywords: "coffee table sofabord sidobord",        budgetShare: 0.14 },
  { id: "lampe",       name: "Lampe",                     keywords: "floor lamp gulvlampe bordlampe light",  budgetShare: 0.10 },
  { id: "opbevaring",  name: "Reol / Opbevaring",         keywords: "shelf bookcase reol skænk sideboard",   budgetShare: 0.16 },
  { id: "tæppe",       name: "Tæppe",                     keywords: "area rug carpet gulvtæppe",             budgetShare: 0.12 },
  { id: "accessories", name: "Accessories / Pynteting",   keywords: "cushion pillow vase decoration pude",   budgetShare: 0.20 },
];

const DANISH_DOMAINS = [
  ".dk/", "ikea.com/dk/", "jysk.dk", "ilva.dk", "bolia.com/da-dk/",
  "hay.dk", "bahne.dk", "menu.as", "droemmeland.dk", "nordicdream.dk",
  "lightpoint.dk", "sengeeksperten.dk", "sengefabrikken.dk",
];

const DANISH_STORES = [
  "ikea", "jysk", "ilva", "bolia", "hay", "bahne", "menu",
  "boconcept", "normann copenhagen", "nordic dream", "drømmeland",
  "droemmeland", "lightpoint", "sengeeksperten", "sengefabrikken",
];

function isDanishResult(item: any): boolean {
  const link = (item.link ?? "").toLowerCase();
  const source = (item.source ?? "").toLowerCase();
  const currency = item.price?.currency ?? "";

  const hasDanishDomain = DANISH_DOMAINS.some((d) => link.includes(d));
  const hasDanishStore = DANISH_STORES.some((s) => source.includes(s));

  // Accept DKK explicitly, or known Danish store/domain regardless of currency
  const isAcceptableCurrency = currency === "DKK" || currency === "" || hasDanishStore || hasDanishDomain;

  return (hasDanishDomain || hasDanishStore) && isAcceptableCurrency;
}

async function searchOneCategory(
  imageUrl: string,
  category: ProductCategory,
  targetBudget: number,
  apiKey: string
): Promise<GoogleLensMatch | null> {
  try {
    const params = new URLSearchParams({
      engine: "google_lens",
      url: imageUrl,
      api_key: apiKey,
      country: "dk",
      hl: "da",
      q: category.keywords,
    });

    const response = await fetch(`https://serpapi.com/search?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.error(`[Google Lens] Category "${category.id}" API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const visualMatches: any[] = data.visual_matches ?? data.shopping_results ?? [];

    const danishMatches = visualMatches.filter((item: any) => {
      const hasPrice = item.price && (item.price.value || item.price.extracted_value);
      return hasPrice && isDanishResult(item);
    });

    if (danishMatches.length === 0) {
      console.log(`[Google Lens] No Danish results for "${category.id}"`);
      return null;
    }

    // Pick closest to target budget
    const best = danishMatches.sort((a: any, b: any) => {
      const aPrice = parseFloat(a.price?.extracted_value ?? a.price?.value ?? "0");
      const bPrice = parseFloat(b.price?.extracted_value ?? b.price?.value ?? "0");
      return Math.abs(aPrice - targetBudget) - Math.abs(bPrice - targetBudget);
    })[0];

    return {
      source: best.source ?? "Ukendt butik",
      price: parseFloat(best.price?.extracted_value ?? best.price?.value ?? "0"),
      currency: best.price?.currency || "DKK",
      link: best.link ?? "",
      thumbnail: best.thumbnail ?? "",
      inStock: best.in_stock !== false,
    };
  } catch (err: any) {
    console.error(`[Google Lens] Error for category "${category.id}": ${err.message}`);
    return null;
  }
}

export async function searchProductsByCategory(
  imageUrl: string,
  totalBudget: number
): Promise<Map<string, GoogleLensMatch | null>> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.warn("[Google Lens] SERPAPI_KEY not configured");
    return new Map();
  }

  const productBudget = Math.round(totalBudget * 0.85);
  const results = new Map<string, GoogleLensMatch | null>();

  // Run all category searches in parallel
  const searches = PRODUCT_CATEGORIES.map(async (cat) => {
    const target = Math.round(productBudget * cat.budgetShare);
    const match = await searchOneCategory(imageUrl, cat, target, apiKey);
    results.set(cat.id, match);
    console.log(`[Google Lens] "${cat.id}": ${match ? `${match.source} ${match.price} ${match.currency}` : "no match"}`);
  });

  await Promise.all(searches);
  return results;
}
