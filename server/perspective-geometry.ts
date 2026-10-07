import sharp from "sharp";

let runtime: Promise<any> | undefined;
let queue = Promise.resolve();

export type PerspectiveGeometry = {
  verified: boolean; matches: number; inliers: number; maxCornerDrift: number | null;
  rotationDegrees: number | null; horizontalCoverage: number; verticalCoverage: number;
  featureMode?: "texture" | "structural_edges" | "tracked_corners";
  transformModel?: "projective" | "affine";
};

export async function measurePerspectiveGeometry(original: Buffer, candidate: Buffer): Promise<PerspectiveGeometry> {
  const texture = await measureFeatures(original, candidate);
  if (texture.verified) return texture;
  // Renovation legitimately replaces textures. Match structural edge descriptors
  // as a second hypothesis, with exactly the same evidence and drift thresholds.
  const edges = await measureFeatures(original, candidate, true);
  if (edges.verified) return edges;
  const tracked = await measureFeatures(original, candidate, false, true);
  if (tracked.verified) return tracked;
  return [texture, edges, tracked].sort((a, b) =>
    Math.min(b.horizontalCoverage, b.verticalCoverage) -
    Math.min(a.horizontalCoverage, a.verticalCoverage))[0];
}

/** Match invariant image features, then measure their robust projective transform.
 * No registration/warping is applied to customer pixels. Insufficient evidence
 * fails closed. WASM needs no Python, native OpenCV or external image service.
 */
async function measureFeatures(original: Buffer, candidate: Buffer, structuralEdges = false, trackCorners = false): Promise<PerspectiveGeometry> {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  const resources: any[] = [];
  const empty: PerspectiveGeometry = {
    verified: false, matches: 0, inliers: 0, maxCornerDrift: null,
    rotationDegrees: null, horizontalCoverage: 0, verticalCoverage: 0,
    featureMode: trackCorners ? "tracked_corners" : structuralEdges ? "structural_edges" : "texture",
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
    if (structuralEdges) {
      for (const image of [a, b]) {
        cv.GaussianBlur(image, image, new cv.Size(5, 5), 0.8);
        cv.Canny(image, image, 12, 40, 3, true);
      }
    }
    const from: number[] = [], to: number[] = [];
    if (trackCorners) {
      // Weak room-shell junctions disappear from binary ORB descriptors when
      // surrounding finishes change. Track them locally in BOTH directions;
      // reject ambiguous/non-reversible tracks before the same global RANSAC.
      // Detect per region so thousands of high-contrast old tile/tree corners
      // cannot crowd out faint wall/ceiling junctions elsewhere in the photo.
      const detector = own(new cv.GFTTDetector(80, 0.01, 8, 5, false, 0.04));
      const keypoints = own(new cv.KeyPointVector()), mask = own(new cv.Mat());
      const coordinates: number[] = [];
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        const left = Math.floor(col * width / 4), top = Math.floor(row * height / 4);
        const right = Math.floor((col + 1) * width / 4), bottom = Math.floor((row + 1) * height / 4);
        const region = a.roi(new cv.Rect(left, top, right - left, bottom - top));
        try {
          detector.detect(region, keypoints, mask);
          for (let i = 0; i < keypoints.size(); i++) {
            const p = keypoints.get(i).pt;
            coordinates.push(p.x + left, p.y + top);
          }
        } finally { region.delete(); }
      }
      if (coordinates.length < 24) return empty;
      const points = own(cv.matFromArray(coordinates.length / 2, 1, cv.CV_32FC2, coordinates));
      const forward = own(new cv.Mat()), backward = own(new cv.Mat());
      const forwardStatus = own(new cv.Mat()), backwardStatus = own(new cv.Mat());
      const forwardError = own(new cv.Mat()), backwardError = own(new cv.Mat());
      const window = new cv.Size(31, 31);
      const criteria = new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 30, 0.01);
      cv.calcOpticalFlowPyrLK(a, b, points, forward, forwardStatus, forwardError, window, 3, criteria);
      cv.calcOpticalFlowPyrLK(b, a, forward, backward, backwardStatus, backwardError, window, 3, criteria);
      for (let i = 0; i < coordinates.length / 2; i++) {
        if (!forwardStatus.data[i] || !backwardStatus.data[i]) continue;
        const x = coordinates[2 * i], y = coordinates[2 * i + 1];
        const xx = forward.data32F[2 * i], yy = forward.data32F[2 * i + 1];
        if (![xx, yy].every(Number.isFinite) || xx < 0 || yy < 0 || xx >= width || yy >= height ||
          forwardError.data32F[i] > 20 ||
          Math.hypot(backward.data32F[2 * i] - x, backward.data32F[2 * i + 1] - y) > 1) continue;
        from.push(x, y); to.push(xx, yy);
      }
    } else {
    const ka = own(new cv.KeyPointVector()), kb = own(new cv.KeyPointVector());
    const da = own(new cv.Mat()), db = own(new cv.Mat()), mask = own(new cv.Mat());
    const orb = own(structuralEdges
      ? new cv.ORB(5000, 1.2, 8, 10, 0, 2, cv.ORB_HARRIS_SCORE, 31, 3)
      : new cv.ORB(1800));
    orb.detectAndCompute(a, mask, ka, da);
    orb.detectAndCompute(b, mask, kb, db);
    if (da.rows < 12 || db.rows < 12) return empty;
    const matcher = own(new cv.BFMatcher(cv.NORM_HAMMING, false));
    const pairs = own(new cv.DMatchVectorVector());
    matcher.knnMatch(da, db, pairs, 2);
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
    }
    const count = from.length / 2;
    if (count < 12) return { ...empty, matches: count };
    const src = own(cv.matFromArray(count, 1, cv.CV_32FC2, from));
    const dst = own(cv.matFromArray(count, 1, cv.CV_32FC2, to));
    const evaluate = (m: number[], inlierMask: any, transformModel: "projective" | "affine"): PerspectiveGeometry => {
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < count; i++) if (inlierMask.data[i]) { xs.push(from[i * 2]); ys.push(from[i * 2 + 1]); }
    if (xs.length < 12) return { ...empty, matches: count, inliers: xs.length };
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
      featureMode: trackCorners ? "tracked_corners" : structuralEdges ? "structural_edges" : "texture",
      transformModel,
    };
    };
    const inlierMask = own(new cv.Mat());
    const h = own(cv.findHomography(src, dst, cv.RANSAC, 2.5, inlierMask));
    const projective = h.empty() ? { ...empty, matches: count }
      : evaluate(Array.from(h.data64F) as number[], inlierMask, "projective");
    if (projective.verified || !trackCorners) return projective;
    // A projective fit extrapolates poorly when most invariant features lie
    // on the window plane. Test the lower-complexity affine hypothesis on the
    // same reversible tracks, same RANSAC residual and same acceptance bounds.
    const affineMask = own(new cv.Mat());
    const affine = own(cv.estimateAffine2D(src, dst, affineMask, cv.RANSAC, 2.5, 2000, 0.99, 10));
    if (affine.empty()) return projective;
    const values = Array.from(affine.data64F) as number[];
    const result = evaluate([...values, 0, 0, 1], affineMask, "affine");
    return result.verified ? result : projective;
  } finally {
    for (const object of resources.reverse()) object.delete?.();
    release();
  }
}
