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

function calculateIoU(a: DetectedObject, b: DetectedObject): number {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.width, by2 = b.y + b.height;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  if (ix2 <= ix1 || iy2 <= iy1) return 0;

  const intersection = (ix2 - ix1) * (iy2 - iy1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

function groupByIoU(objects: DetectedObject[], iouThreshold: number = 0.3): DetectedObject[] {
  const sorted = [...objects].sort((a, b) => b.confidence - a.confidence);
  const kept: DetectedObject[] = [];

  for (const obj of sorted) {
    let suppressed = false;
    for (const k of kept) {
      if (calculateIoU(obj, k) > iouThreshold) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) kept.push(obj);
  }

  return kept;
}

export async function detectObjects(imageUrl: string): Promise<DetectedObject[]> {
  if (cache.has(imageUrl)) return cache.get(imageUrl)!;

  const detect = await getDetector();
  const results: any[] = await detect(imageUrl, { threshold: 0.45 });

  const candidates: DetectedObject[] = results
    .filter((r: any) => PRIORITY_LABELS[r.label.toLowerCase()] !== undefined)
    .map((r: any) => ({
      label: r.label,
      labelDa: LABEL_DA[r.label.toLowerCase()] ?? r.label,
      x: Math.round(r.box.xmin),
      y: Math.round(r.box.ymin),
      width: Math.round(r.box.xmax - r.box.xmin),
      height: Math.round(r.box.ymax - r.box.ymin),
      confidence: Math.round(r.score * 100) / 100,
    }));

  const highConfidence = candidates.filter((c) => c.confidence >= 0.55);
  let deduplicated = groupByIoU(highConfidence, 0.3);

  if (deduplicated.length < 4) {
    const extras = candidates
      .filter((c) => c.confidence >= 0.45 && c.confidence < 0.55)
      .slice(0, 8 - deduplicated.length);
    const combined = [...deduplicated, ...extras];
    deduplicated = groupByIoU(combined, 0.3);
  }

  const sorted = deduplicated.sort((a, b) => {
    const pa = PRIORITY_LABELS[a.label.toLowerCase()] ?? 0;
    const pb = PRIORITY_LABELS[b.label.toLowerCase()] ?? 0;
    if (pb !== pa) return pb - pa;
    return b.confidence - a.confidence;
  });

  const final = sorted.slice(0, 8);
  cache.set(imageUrl, final);
  return final;
}
