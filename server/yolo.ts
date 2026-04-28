let detector: any = null;
const cache = new Map<string, DetectedObject[]>();

const LABEL_DA: Record<string, string> = {
  "sofa": "Sofa",
  "couch": "Sofa",
  "chair": "Stol",
  "bed": "Seng",
  "dining table": "Spisebord",
  "table": "Bord",
  "potted plant": "Plante",
  "clock": "Ur",
  "vase": "Vase",
  "tv": "TV",
  "laptop": "Laptop",
  "book": "Bog",
  "bench": "Bænk",
  "lamp": "Lampe",
  "mirror": "Spejl",
  "sink": "Håndvask",
  "refrigerator": "Køleskab",
  "oven": "Ovn",
  "microwave": "Mikroovn",
  "toaster": "Brødrister",
  "bottle": "Flaske",
  "cup": "Kop",
  "bowl": "Skål",
  "backpack": "Rygsæk",
  "umbrella": "Paraply",
  "handbag": "Håndtaske",
  "suitcase": "Kuffert",
  "skateboard": "Skateboard",
  "sports ball": "Bold",
  "teddy bear": "Bamse",
  "cell phone": "Telefon",
  "remote": "Fjernbetjening",
  "keyboard": "Tastatur",
  "mouse": "Mus",
  "scissors": "Saks",
};

const FURNITURE_LABELS = new Set([
  "sofa", "couch", "chair", "bed", "dining table", "table", "potted plant",
  "clock", "vase", "tv", "laptop", "book", "bench", "lamp", "mirror",
  "sink", "refrigerator", "oven", "microwave", "toaster", "bottle", "cup",
  "bowl", "teddy bear", "remote", "keyboard", "mouse", "cell phone", "scissors",
]);

export interface DetectedObject {
  label: string;
  labelDa: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

async function getDetector() {
  if (!detector) {
    const { pipeline } = await import("@xenova/transformers");
    detector = await pipeline("object-detection", "Xenova/yolos-tiny");
  }
  return detector;
}

export async function detectObjects(imageUrl: string): Promise<DetectedObject[]> {
  if (cache.has(imageUrl)) return cache.get(imageUrl)!;

  const detect = await getDetector();
  const results: any[] = await detect(imageUrl, { threshold: 0.35 });

  const objects: DetectedObject[] = results
    .filter((r: any) => r.score >= 0.35)
    .map((r: any) => ({
      label: r.label,
      labelDa: LABEL_DA[r.label.toLowerCase()] ?? r.label,
      x: Math.round(r.box.xmin),
      y: Math.round(r.box.ymin),
      width: Math.round(r.box.xmax - r.box.xmin),
      height: Math.round(r.box.ymax - r.box.ymin),
      confidence: Math.round(r.score * 100) / 100,
    }));

  cache.set(imageUrl, objects);
  return objects;
}
