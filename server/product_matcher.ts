const allStores: Record<string, { name: string; url: string }[]> = {
  furniture: [
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
    { name: "ILVA", url: "https://ilva.dk/search?q=" },
    { name: "Bolia", url: "https://bolia.com/da-dk/search/?q=" },
    { name: "HAY", url: "https://hay.dk/search?q=" },
    { name: "JYSK", url: "https://jysk.dk/search?q=" },
    { name: "Bahne", url: "https://bahne.dk/search?q=" },
    { name: "Menu", url: "https://menu.as/search?q=" },
  ],
  bed: [
    { name: "Nordic Dream", url: "https://nordicdream.dk/search?q=" },
    { name: "Drømmeland", url: "https://droemmeland.dk/search?q=" },
    { name: "Sengeeksperten", url: "https://sengeeksperten.dk/search?q=" },
    { name: "Sengefabrikken", url: "https://sengefabrikken.dk/search?q=" },
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
    { name: "JYSK", url: "https://jysk.dk/search?q=" },
  ],
  lamp: [
    { name: "Lightpoint", url: "https://lightpoint.dk/search?q=" },
    { name: "HAY", url: "https://hay.dk/search?q=" },
    { name: "Menu", url: "https://menu.as/search?q=" },
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
    { name: "Bahne", url: "https://bahne.dk/search?q=" },
  ],
  rug: [
    { name: "JYSK", url: "https://jysk.dk/search?q=" },
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
    { name: "ILVA", url: "https://ilva.dk/search?q=" },
  ],
  accessory: [
    { name: "JYSK", url: "https://jysk.dk/search?q=" },
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
    { name: "HAY", url: "https://hay.dk/search?q=" },
    { name: "Menu", url: "https://menu.as/search?q=" },
    { name: "Bahne", url: "https://bahne.dk/search?q=" },
  ],
};

function getCategory(productName: string): string {
  const name = productName.toLowerCase();
  if (name.includes("seng") || name.includes("madras") || name.includes("bed")) return "bed";
  if (name.includes("lampe") || name.includes("lys") || name.includes("pendel") || name.includes("gulvlampe") || name.includes("bordlampe")) return "lamp";
  if (name.includes("tæppe") || name.includes("gulvtæppe") || name.includes("rug")) return "rug";
  if (
    name.includes("pude") ||
    name.includes("plaid") ||
    name.includes("vase") ||
    name.includes("dekoration") ||
    name.includes("plante") ||
    name.includes("billedeframe") ||
    name.includes("spejl")
  )
    return "accessory";
  return "furniture";
}

export function buildAllSearchLinks(
  productName: string,
  description: string,
  style: string
): { name: string; url: string; searchUrl: string }[] {
  const term = encodeURIComponent(`${productName} ${description} ${style}`);
  const category = getCategory(productName);
  const stores = allStores[category] || allStores.furniture;
  return stores.map((s) => ({ ...s, searchUrl: `${s.url}${term}` }));
}
