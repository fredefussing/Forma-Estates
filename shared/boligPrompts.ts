import revision from "./forma-prompts.json";

export type BoligTier = "tier1" | "tier2" | "tier3";

// Customer-facing labels and persisted keys are deliberately unchanged.
export const BOLIG_ROOM_LABELS: Record<string, string> = {
  "living room": "Stue", bedroom: "Soveværelse", kitchen: "Køkken",
  bathroom: "Badeværelse", "dining room": "Spisestue", "home office": "Hjemmekontor",
  "kids room": "Børneværelse", studio: "Studio", "game room": "Spillerum",
  gym: "Træningsrum", "laundry room": "Vaskerum", "meeting room": "Mødelokale",
  spa: "Spa", outdoor: "Udendørs", "open plan living": "Åben stue/spisestue",
  entryway: "Entré", hallway: "Entré", utility: "Bryggers", toilet: "Toilet", kontor: "Hjemmekontor",
};
export const BOLIG_STYLE_LABELS: Record<string, string> = {
  scandinavian: "Skandinavisk", modern: "Moderne", luxury: "Luksus",
  industrial: "Industriel", coastal: "Kyst", transitional: "Overgangs",
  rustic: "Landlig", midcentury: "Midcentury", classical: "Klassisk",
  minimalist: "Minimalistisk", bohemian: "Boheme", japandi: "Japandi",
};

export function normalizeBoligRoom(room: string): string {
  const normalized = room.replace(/_/g, " ").toLowerCase().trim();
  // Older saved images use hallway for the same customer-facing Entré option.
  if (normalized === "hallway") return "entryway";
  return (revision.room_aliases as Record<string, string>)[normalized] ?? normalized;
}

export function getBoligPrompt(room: string, style: string, tier: BoligTier): string {
  const key = `${style.toLowerCase().trim()}/${normalizeBoligRoom(room)}/${tier}`;
  const prompt = (revision.presets as Record<string, string>)[key];
  if (!prompt) {
    throw new Error(`PROMPT_NOT_FOUND: Ingen specifik prompt for "${key}". Genereringen er stoppet; stil eller tier erstattes ikke.`);
  }
  return prompt;
}

export function getAllBoligPrompts() {
  return Object.entries(revision.presets).map(([key, prompt]) => {
    const [style, room, tier] = key.split("/");
    return { room, style, tier: tier as BoligTier, prompt };
  });
}
