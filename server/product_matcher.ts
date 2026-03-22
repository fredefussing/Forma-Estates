const storeUrls: Record<string, string> = {
  "Drømmeland": "https://droemmeland.dk/search?q=",
  "Nordic Dream": "https://nordicdream.dk/search?q=",
  "Lightpoint": "https://lightpoint.dk/search?q=",
  "IKEA": "https://www.ikea.com/dk/da/search/?q=",
  "Bolia": "https://bolia.com/da-dk/search/?q=",
  "HAY": "https://hay.dk/search?q=",
  "JYSK": "https://jysk.dk/search?q=",
  "ILVA": "https://ilva.dk/search?q=",
  "Sengeeksperten": "https://sengeeksperten.dk/search?q=",
  "Sengefabrikken": "https://sengefabrikken.dk/search?q=",
  "Menu": "https://menu.as/search?q=",
  "Bahne": "https://bahne.dk/search?q=",
};

export function getStoreSearchUrl(storeName: string, searchTerms: string): string {
  const base = storeUrls[storeName] ?? `https://www.google.dk/search?q=${encodeURIComponent(storeName + " ")}`;
  return `${base}${encodeURIComponent(searchTerms)}`;
}
