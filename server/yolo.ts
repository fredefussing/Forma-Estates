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
  "lamp": "Lampe",
  "mirror": "Spejl",
  "bench": "Bænk",
  "refrigerator": "Køleskab",
  "oven": "Ovn",
  "sink": "Håndvask",
  "laptop": "Laptop",
  "book": "Bog",
  "teddy bear": "Bamse",
  "backpack": "Rygsæk",
};

const PRIORITY_LABELS: Record<string, number> = {
  "sofa": 10,
  "couch": 10,
  "bed": 9,
  "dining table": 9,
  "chair": 8,
  "lamp": 8,
  "mirror": 7,
  "potted plant": 7,
  "table": 6,
  "tv": 6,
  "bench": 5,
  "refrigerator": 5,
  "oven": 4,
  "sink": 4,
  "clock": 3,
  "vase": 3,
  "book": 2,
  "laptop": 2,
  "teddy bear": 1,
  "backpack": 1,
};

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

function centerDistance(a: DetectedObject, b: DetectedObject): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function groupNearbyObjects(objects: DetectedObject[], distThreshold: number): DetectedObject[] {
  const used = new Set<number>();
  const grouped: DetectedObject[] = [];

  for (let i = 0; i < objects.length; i++) {
    if (used.has(i)) continue;
    let best = objects[i];
    used.add(i);

    for (let j = i + 1; j < objects.length; j++) {
      if (used.has(j)) continue;
      if (centerDistance(objects[i], objects[j]) < distThreshold) {
        used.add(j);
        if (objects[j].confidence > best.confidence) {
          best = objects[j];
        }
      }
    }

    grouped.push(best);
  }

  return grouped;
}

export async function detectObjects(imageUrl: string): Promise<DetectedObject[]> {
  if (cache.has(imageUrl)) return cache.get(imageUrl)!;

  const detect = await getDetector();
  const results: any[] = await detect(imageUrl, { threshold: 0.45 });

  const filtered: DetectedObject[] = results
    .filter((r: any) => r.score >= 0.55 && PRIORITY_LABELS[r.label.toLowerCase()] !== undefined)
    .map((r: any) => ({
      label: r.label,
      labelDa: LABEL_DA[r.label.toLowerCase()] ?? r.label,
      x: Math.round(r.box.xmin),
      y: Math.round(r.box.ymin),
      width: Math.round(r.box.xmax - r.box.xmin),
      height: Math.round(r.box.ymax - r.box.ymin),
      confidence: Math.round(r.score * 100) / 100,
    }));

  const grouped = groupNearbyObjects(filtered, 60);

  const sorted = grouped.sort((a, b) => {
    const pa = PRIORITY_LABELS[a.label.toLowerCase()] ?? 0;
    const pb = PRIORITY_LABELS[b.label.toLowerCase()] ?? 0;
    if (pb !== pa) return pb - pa;
    return b.confidence - a.confidence;
  });

  const final = sorted.slice(0, 8);

  cache.set(imageUrl, final);
  return final;
}
