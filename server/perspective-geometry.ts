import sharp from "sharp";

let runtime: Promise<any> | undefined;
let queue = Promise.resolve();

export type PerspectiveGeometry = {
  verified: boolean; matches: number; inliers: number; maxCornerDrift: number | null;
  rotationDegrees: number | null; horizontalCoverage: number; verticalCoverage: number;
};

/** Match invariant image features, then measure their robust projective transform.
 * No registration/warping is applied to customer pixels. Insufficient evidence
 * fails closed. WASM needs no Python, native OpenCV or external image service.
 */
export async function measurePerspectiveGeometry(original: Buffer, candidate: Buffer): Promise<PerspectiveGeometry> {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  const resources: any[] = [];
  const empty: PerspectiveGeometry = {
    verified: false, matches: 0, inliers: 0, maxCornerDrift: null,
    rotationDegrees: null, horizontalCoverage: 0, verticalCoverage: 0,
  };
  try {
    runtime ??= import("@techstark/opencv-js").then(module => Promise.resolve(module.default));
    const cv = await runtime;
    const metadata = await sharp(original).metadata();
    const rotated = (metadata.orientation ?? 0) >= 5;
    const sourceWidth = rotated ? metadata.height! : metadata.width!;
    const sourceHeight = rotated ? metadata.width! : metadata.height!;
    const scale = Math.min(1, 1024 / Math.max(sourceWidth, sourceHeight));
    const width = Math.round(sourceWidth * scale), height = Math.round(sourceHeight * scale);
    const pixels = await Promise.all([original, candidate].map(buffer =>
      sharp(buffer).rotate().resize(width, height, { fit: "fill" }).greyscale().removeAlpha().raw().toBuffer()));
    const own = <T>(object: T): T => { resources.push(object); return object; };
    const a = own(new cv.Mat(height, width, cv.CV_8UC1));
    const b = own(new cv.Mat(height, width, cv.CV_8UC1));
    a.data.set(pixels[0]); b.data.set(pixels[1]);
    const ka = own(new cv.KeyPointVector()), kb = own(new cv.KeyPointVector());
    const da = own(new cv.Mat()), db = own(new cv.Mat()), mask = own(new cv.Mat());
    const orb = own(new cv.ORB(1800));
    orb.detectAndCompute(a, mask, ka, da);
    orb.detectAndCompute(b, mask, kb, db);
    if (da.rows < 12 || db.rows < 12) return empty;
    const matcher = own(new cv.BFMatcher(cv.NORM_HAMMING, false));
    const pairs = own(new cv.DMatchVectorVector());
    matcher.knnMatch(da, db, pairs, 2);
    const from: number[] = [], to: number[] = [];
    const used = new Set<number>();
    for (let i = 0; i < pairs.size(); i++) {
      const pair = pairs.get(i);
      try {
        if (pair.size() < 2) continue;
        const best = pair.get(0), second = pair.get(1);
        if (best.distance > 60 || best.distance >= second.distance * 0.72 || used.has(best.trainIdx)) continue;
        used.add(best.trainIdx);
        const p = ka.get(best.queryIdx).pt, q = kb.get(best.trainIdx).pt;
        from.push(p.x, p.y); to.push(q.x, q.y);
      } finally { pair.delete(); }
    }
    const count = from.length / 2;
    if (count < 12) return { ...empty, matches: count };
    const src = own(cv.matFromArray(count, 1, cv.CV_32FC2, from));
    const dst = own(cv.matFromArray(count, 1, cv.CV_32FC2, to));
    const inlierMask = own(new cv.Mat());
    const h = own(cv.findHomography(src, dst, cv.RANSAC, 2.5, inlierMask));
    if (h.empty()) return { ...empty, matches: count };
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < count; i++) if (inlierMask.data[i]) { xs.push(from[i * 2]); ys.push(from[i * 2 + 1]); }
    if (xs.length < 12) return { ...empty, matches: count, inliers: xs.length };
    const m = h.data64F;
    const displacements = [[0, 0], [width, 0], [0, height], [width, height], [width / 2, height / 2]]
      .map(([x, y]) => {
        const d = m[6] * x + m[7] * y + m[8];
        const xx = (m[0] * x + m[1] * y + m[2]) / d, yy = (m[3] * x + m[4] * y + m[5]) / d;
        return Math.hypot((xx - x) / width, (yy - y) / height);
      });
    const drift = Math.max(...displacements);
    const rotation = Math.abs(Math.atan2(m[3], m[0]) * 180 / Math.PI);
    const horizontalCoverage = (Math.max(...xs) - Math.min(...xs)) / width;
    const verticalCoverage = (Math.max(...ys) - Math.min(...ys)) / height;
    return {
      verified: Number.isFinite(drift) && Number.isFinite(rotation) && drift <= 0.025 && rotation <= 1 &&
        xs.length / count >= 0.3 && horizontalCoverage >= 0.35 && verticalCoverage >= 0.35,
      matches: count, inliers: xs.length, maxCornerDrift: drift, rotationDegrees: rotation,
      horizontalCoverage, verticalCoverage,
    };
  } finally {
    for (const object of resources.reverse()) object.delete?.();
    release();
  }
}
