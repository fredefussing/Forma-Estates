const backupStores: Record<string, { name: string; url: string }[]> = {
  furniture: [
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
    { name: "HAY", url: "https://hay.dk/search?q=" },
  ],
  bed: [
    { name: "Nordic Dream", url: "https://nordicdream.dk/search?q=" },
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
  ],
  lamp: [
    { name: "Lightpoint", url: "https://lightpoint.dk/search?q=" },
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
  ],
  rug: [
    { name: "JYSK", url: "https://jysk.dk/search?q=" },
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
  ],
  accessory: [
    { name: "IKEA", url: "https://www.ikea.com/dk/da/search/?q=" },
    { name: "HAY", url: "https://hay.dk/search?q=" },
  ],
};

function getCategory(productName: string): string {
  const name = productName.toLowerCase();
  if (name.includes("seng") || name.includes("madras") || name.includes("bed")) return "bed";
  if (
    name.includes("lampe") ||
    name.includes("lys") ||
    name.includes("pendel") ||
    name.includes("gulvlampe") ||
    name.includes("bordlampe")
  )
    return "lamp";
  if (name.includes("tæppe") || name.includes("gulvtæppe") || name.includes("rug")) return "rug";
  if (
    name.includes("pude") ||
    name.includes("plaid") ||
    name.includes("vase") ||
    name.includes("dekoration") ||
    name.includes("plante") ||
    name.includes("spejl")
  )
    return "accessory";
  return "furniture";
}

export function getBackupLinks(
  productName: string,
  searchTerms: string
): { name: string; searchUrl: string }[] {
  const category = getCategory(productName);
  const stores = backupStores[category] || backupStores.furniture;
  const encoded = encodeURIComponent(searchTerms);
  return stores.map((s) => ({ name: s.name, searchUrl: `${s.url}${encoded}` }));
}
