import { fal } from "@fal-ai/client";
import fs from "fs";
import path from "path";
import { Jimp, JimpMime } from "jimp";

const FAL_KEY = process.env.FAL_KEY;
if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

export function isFalConfigured(): boolean {
  return !!FAL_KEY;
}

// Upload a local file to fal.ai storage and return the public URL.
// fal cannot fetch from localhost / private hosts, so anything we feed it
// as image_url must first be uploaded here.
export async function uploadToFal(localFilePath: string, mimeType?: string): Promise<string> {
  // Saner filnavnet til ren ASCII (non-ASCII havner ellers som `?` i URL'en
  // og knækker downstream fetch) og down-scale til max 1920px på længste
  // led — Luma og flere andre fal-modeller afviser med 422 over det.
  const ext = ".jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;

  let outBuffer: Buffer;
  try {
    const image = await Jimp.read(localFilePath);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    const MAX = 1920;
    if (Math.max(w, h) > MAX) {
      if (w >= h) {
        image.resize({ w: MAX });
      } else {
        image.resize({ h: MAX });
      }
    }
    outBuffer = Buffer.from(await image.getBuffer(JimpMime.jpeg));
  } catch (e) {
    console.warn("[uploadToFal] resize failed, sending raw:", e);
    outBuffer = fs.readFileSync(localFilePath);
  }

  const file = new File([outBuffer], filename, { type: "image/jpeg" });
  return await fal.storage.upload(file);
}

// Kling v3 (start_image_url + end_image_url) afviser med 422, hvis før- og
// efter-billedet ikke har præcis samme dimensioner. Mæglerens manuelle
// uploads har næsten altid forskellig størrelse, så vi normaliserer begge
// til identiske mål (center-cover-crop ift. før-billedets aspekt, maks 1920px,
// lige tal) før upload.
export async function uploadVideoPairToFal(
  beforePath: string,
  afterPath: string,
): Promise<{ beforeUrl: string; afterUrl: string }> {
  const before = await Jimp.read(beforePath);
  let w = before.bitmap.width;
  let h = before.bitmap.height;
  const MAX = 1920;
  if (Math.max(w, h) > MAX) {
    if (w >= h) {
      h = Math.round((h * MAX) / w);
      w = MAX;
    } else {
      w = Math.round((w * MAX) / h);
      h = MAX;
    }
  }
  // Lige dimensioner — flere video-encodere kræver det.
  w -= w % 2;
  h -= h % 2;

  before.cover({ w, h });
  const after = await Jimp.read(afterPath);
  after.cover({ w, h });

  const [beforeBuf, afterBuf] = await Promise.all([
    before.getBuffer(JimpMime.jpeg),
    after.getBuffer(JimpMime.jpeg),
  ]);

  const upload = async (buf: Buffer, name: string) => {
    const file = new File([Buffer.from(buf)], name, { type: "image/jpeg" });
    return await fal.storage.upload(file);
  };
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const [beforeUrl, afterUrl] = await Promise.all([
    upload(Buffer.from(beforeBuf), `before-${stamp}.jpg`),
    upload(Buffer.from(afterBuf), `after-${stamp}.jpg`),
  ]);
  return { beforeUrl, afterUrl };
}

// ===== 1. 3D PLANTEGNING (2D floor plan image → 3D dollhouse render) =====
// Stricter prompt der eksplicit forbyder interior/eye-level views.
// Korte direkte forbud > lange beskrivende ønsker for arkitektonisk troskab.
const FLOORPLAN_3D_PROMPT = `Use the attached floor plan as a STRICT spatial and architectural reference and transform it into a premium ultra-realistic 3D architectural floor plan visualization.

Preserve the exact geometry, wall placement, proportions, circulation, room layout, windows, doors, and all architectural boundaries precisely as shown in the original 2D floor plan. Do not redesign, reinterpret, simplify, or modify the structure in any way.

The final image should feel like a high-end Scandinavian real estate presentation created for luxury property marketing.

STYLE & VISUAL QUALITY

Create a warm, elegant, modern Nordic interior atmosphere with premium real estate aesthetics.

Focus heavily on:

realistic natural lighting
soft warm ambient interior lighting
premium materials and textures
cozy but minimal Scandinavian styling
strong visual depth
refined architectural realism

Use highly realistic:

oak wood flooring
soft fabric furniture
matte painted walls
natural stone surfaces
brushed metal details
realistic glass reflections
subtle textile textures

Avoid a sterile CGI look.

The visualization should feel:

luxurious
warm
inviting
atmospheric
professionally staged

CAMERA & COMPOSITION

Use an elevated near-top-down camera angle with a subtle tilt between 15–20 degrees from vertical.

The perspective must remain close to orthographic to preserve layout readability and architectural accuracy.

Maintain the EXACT same orientation and viewing direction as the original floor plan:

same rotation
same room alignment
same top/bottom direction

Do not use cinematic perspectives or dramatic wide-angle distortion.

WALLS & ARCHITECTURAL DEFINITION

Walls must have:

realistic thickness
clearly visible vertical height
crisp architectural edges
subtle shadow definition
strong separation between rooms

Room divisions must remain instantly readable at a glance.

Do not make walls thin, flat, faded, or semi-transparent.

LIGHTING

Use balanced global illumination with:

soft daylight entering from windows
clearly visible warm LED lamp lighting in EVERY room (recessed ceiling spotlights / downlights, ceiling lamps, pendant lights, floor lamps, table lamps, and wall sconces as appropriate)
warm glowing light pools cast on floors, walls, and furniture from each lamp and spotlight
cozy indirect lighting
gentle realistic shadows

Every room — including bedrooms, bathrooms, hallways, kitchen, and living areas — must contain at least one clearly visible, lit lamp emitting a warm LED glow, plus recessed ceiling spotlights casting visible warm circular pools on the floor. The lamps and spotlights should look turned on, with a soft realistic bloom that adds atmosphere without overexposing the scene.

The lighting should create warmth and realism while preserving maximum readability of the layout.

Avoid:

harsh contrast
dramatic shadows
overexposed highlights
dark corners

FURNISHING

Only furnish interior rooms.

Use tasteful, minimal Scandinavian furniture styling:

elegant sofas
textured rugs
dining tables
modern kitchens
realistic beds
subtle decor accents

PLANTS & GREENERY

Add a generous amount of LARGE, visible indoor plants throughout the interior to bring life and a natural Nordic feel:

tall, large floor-standing plants in corners of living rooms and hallways — reaching at least halfway up the wall (e.g. fiddle leaf fig, monstera deliciosa, large olive tree, kentia palm)
medium potted plants near windows
small potted herbs or succulents on kitchen counters and dining tables
hanging or shelf plants where appropriate
greenery in bathrooms (small ferns or eucalyptus)

Plants should look healthy, realistic, and tastefully placed in ceramic, terracotta, or woven baskets — never plastic or artificial-looking. Distribute greenery across multiple rooms so the interior feels fresh, organic, and inviting, but without overcrowding.

Do not overcrowd rooms.

Outdoor areas such as terraces and balconies must remain open-air and visually distinct from interior spaces.

Outdoor spaces may only contain minimal exterior furniture.

TEXT & LABELS

Add ONLY subtle and elegant room labels.

Requirements for labels:

small size
thin modern typography
light gray or muted dark tone
minimal visual presence
integrated naturally into the image

Include room names only:

no dimensions
no technical annotations
no heavy black text
no measurement lines

The labels should support orientation without reducing the premium aesthetic.

RENDER QUALITY

Ultra-detailed architectural visualization.
8K quality.
Ultra-sharp edges.
Maximum clarity.
Photorealistic materials.
Clean room separation.
No blur.
No depth of field.
No fog.
No painterly effects.

The final result should look like a luxury real estate marketing visualization rather than a technical architectural diagram.`;

// Pre-processer plantegning før den sendes til fal: trim hvide kanter
// (auto-crop), let kontrast-boost. Renser UI-artefakter (knapper, hvide
// margener, overskrifter) der ellers forvirrer modellen og får den til at
// generere interior renders i stedet for dollhouse-views.
async function preprocessFloorplan(sourceUrl: string): Promise<string> {
  const image = await Jimp.read(sourceUrl);
  // Auto-crop hvide/lyse kanter rundt om selve plantegningen
  try {
    image.autocrop({ tolerance: 0.05, cropOnlyFrames: true });
  } catch (e) {
    console.warn("[preprocessFloorplan] autocrop failed, continuing without:", e);
  }
  // Let kontrast-boost for at fremhæve vægge
  image.contrast(0.15);
  const buffer = await image.getBuffer(JimpMime.jpeg);
  const file = new File([buffer], `floorplan_${Date.now()}.jpg`, { type: "image/jpeg" });
  return await fal.storage.upload(file);
}


export async function generate3DFloorplan(
  floorPlanImageUrl: string,
): Promise<{ imageUrl: string }> {
  // Pre-processer plantegningen først (crop + kontrast). Falder tilbage til
  // den oprindelige URL hvis preprocessing fejler — så vi aldrig blokerer
  // selve generereringen pga. en jimp-fejl.
  let inputUrl = floorPlanImageUrl;
  try {
    inputUrl = await preprocessFloorplan(floorPlanImageUrl);
  } catch (e) {
    console.warn("[generate3DFloorplan] preprocess failed, using raw URL:", e);
  }

  const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt: FLOORPLAN_3D_PROMPT,
      image_urls: [inputUrl],
      resolution: "2K",
    },
  });

  const imageUrl = (result.data as any).images?.[0]?.url;
  if (!imageUrl) throw new Error("No image generated");
  return { imageUrl };
}

// ===== AI BOLIGFREMVISNING: 360° equirectangular panorama from after-image =====
// Strategy B: when the user uploads 2 angles per room we generate 2 after-
// images (front-view + back-view) and pass BOTH as references to nano-banana-
// 2/edit. The model then has hard evidence for both halves of the room and
// only has to outpaint the ~120° corners between them — vastly more
// realistic than hallucinating the entire back half from one image. Falls
// back gracefully to single-URL behaviour when only one angle exists.
export async function generate360Panorama(
  afterImageUrls: string | string[],
  roomName: string,
  styleLabel: string,
  archFacts?: string,
): Promise<{ imageUrl: string }> {
  const urls = Array.isArray(afterImageUrls) ? afterImageUrls : [afterImageUrls];
  const hasTwo = urls.length >= 2;
  const refDesc = hasTwo
    ? "Use BOTH provided photos as ground-truth references — the first is the front-view of the room, the second is the opposite end. Stitch them into one seamless 360 view where the front and back of the room match the references exactly and only the side corners need to be inferred."
    : "Use the provided photo as the front-view reference; outpaint the rest of the room in the same style.";
  const facts = archFacts ? ` Architectural facts to respect: ${archFacts}.` : "";
  const prompt = `Generate a 360 degree equirectangular panorama of the same ${roomName} in ${styleLabel} style. ${refDesc}${facts} Seamless wraparound that connects perfectly at the left and right edges, complete room visible in all directions, all walls, ceiling and floor included, photorealistic, 8K, architectural visualization quality. True 360 equirectangular projection with 2:1 aspect ratio.`;
  const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt,
      image_urls: urls,
      resolution: "2K",
    },
  });
  const imageUrl = (result.data as any).images?.[0]?.url;
  if (!imageUrl) throw new Error("No panorama generated");
  return { imageUrl };
}

// ===== 2. TRANSFORMERINGSVIDEO (FØR → EFTER) =====
// "Forvandling": statisk kamera, ingen push-in. Rummet bygger
// sig selv om på fladen: vægfarver flyder hen over fladerne, gulvet
// fornyer sig plank for plank, gamle møbler opløses og nye møbler
// folder/vokser frem til den endelige indretning. God til præsentationer
// hvor mægleren vil bevise "før→efter" konkret.
const TRANSFORM_VIDEO_MORPH_PROMPT = `A cinematic room renovation. The scene transforms smoothly from the original interior to the beautifully renovated interior. All architectural structure remains completely fixed and untouched — walls, windows, doors, flooring layout, ceiling, and room geometry never move or warp. Only the interior styling, furniture, materials, and decor change. Each element transforms in a natural, believable sequence one after another — cabinetry and storage units first, then surfaces and countertops, then lighting fixtures, then seating and tables, then textiles and decor last. Nothing appears magically or spawns from nowhere — each change is a smooth, organic morph. Warm golden daylight floods through the windows, soft natural shadows, cozy inviting atmosphere. Ultra-smooth slow motion throughout, no abrupt jumps, no warping, no stretching, no deformation of any element. Photorealistic architectural visualization quality, 1080p, cinematic.`;

// "Cinematisk gennemgang": kameraet glider/svæver ind i det NYE rum. Vi giver
// kun efter-billedet som startframe (ingen end_image), så modellen er fri til
// en ren kamerabevægelse i stedet for at være bundet til en før→efter-morph.
const CINEMATIC_FLYTHROUGH_PROMPT = `A cinematic first-person real-estate walkthrough: the camera enters the room as if a person is stepping inside and looking around, like a smooth handheld steadicam tour. It moves gently forward into the space and slowly pans and tilts to reveal different parts of the room — sweeping across the furniture, walls, windows, and key features — as if a buyer is taking in the room from the inside.

The motion combines a soft forward push with natural, gentle panning left and right and a subtle look up and down, giving a sense of exploring and surveying the space. Gentle parallax makes foreground elements drift slightly faster than the background to enhance depth.

The room and everything in it stays exactly as shown — furniture, materials, colors, lighting, and layout do NOT change, morph, appear, or disappear. Nothing transforms. Only the camera moves.

The movement is slow, smooth, and continuous with no harsh shake, no abrupt cuts, and no warping of the architecture. Walls, windows, doors, and furniture keep correct, stable perspective throughout the tour.

Photorealistic, cinematic interior real-estate walkthrough, soft natural lighting, high detail, architectural visualization quality.`;

export type VideoMode = "cinematic" | "morph";

const VIDEO_ENDPOINT = "fal-ai/kling-video/v3/pro/image-to-video";

// To forskellige opførsler:
//  • morph ("Forvandling"): start=før, end=efter, fast kamera → rummet
//    forvandler sig på stedet.
//  • cinematic ("Cinematisk gennemgang"): start=efter, intet end-billede →
//    kameraet glider ind i det nye rum uden at noget forvandler sig.
function buildVideoInput(beforeImageUrl: string, afterImageUrl: string, mode: VideoMode) {
  if (mode === "cinematic") {
    return {
      prompt: CINEMATIC_FLYTHROUGH_PROMPT,
      start_image_url: afterImageUrl,
      duration: "5" as const,
    };
  }
  return {
    prompt: TRANSFORM_VIDEO_MORPH_PROMPT,
    start_image_url: beforeImageUrl,
    end_image_url: afterImageUrl,
    duration: "8" as const,
  };
}

export async function generateAnimationVideo(
  beforeImageUrl: string,
  afterImageUrl: string,
  mode: VideoMode = "cinematic",
): Promise<{ videoUrl: string }> {
  const result = await fal.subscribe(VIDEO_ENDPOINT, {
    input: buildVideoInput(beforeImageUrl, afterImageUrl, mode),
  });

  const videoUrl = (result.data as any).video?.url;
  if (!videoUrl) throw new Error("No video generated");
  return { videoUrl };
}

// Async (queued) variant: videoer tager 2-4 min hvilket overskrider Replits
// proxy-timeout (~2 min) på et enkelt HTTP-request. Submit returnerer
// straks med et request_id, og klienten poller derefter
// getAnimationVideoStatus.
export async function submitAnimationVideo(
  beforeImageUrl: string,
  afterImageUrl: string,
  mode: VideoMode = "cinematic",
): Promise<{ requestId: string }> {
  const { request_id } = await fal.queue.submit(VIDEO_ENDPOINT, {
    input: buildVideoInput(beforeImageUrl, afterImageUrl, mode),
  });
  return { requestId: request_id };
}

export async function getAnimationVideoStatus(
  requestId: string,
): Promise<{ status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED"; videoUrl?: string; error?: string }> {
  try {
    const s: any = await fal.queue.status(VIDEO_ENDPOINT, { requestId });
    if (s.status === "COMPLETED") {
      const r: any = await fal.queue.result(VIDEO_ENDPOINT, { requestId });
      const videoUrl = r.data?.video?.url;
      if (!videoUrl) return { status: "FAILED", error: "No video in result" };
      return { status: "COMPLETED", videoUrl };
    }
    if (s.status === "IN_PROGRESS" || s.status === "IN_QUEUE") {
      return { status: s.status };
    }
    return { status: "FAILED", error: s.status || "Unknown status" };
  } catch (e: any) {
    return { status: "FAILED", error: e.message || "Status poll failed" };
  }
}

// ===== 3. BOLIG SHOWCASE-KLIP (Kling 2.1 image-to-video) =====
// Hver ejendomsfoto bliver til ét rent AI-klip med ÉN ægte, jævn kamera-
// bevægelse (dolly ind/ud, truck venstre/højre) — det "gimbal/steadicam"-look
// referencevideoerne har, som FFmpeg-fake-parallax aldrig kan ramme. Selve
// rummet må ALDRIG forandre sig; kun kameraet bevæger sig. Klippene klippes
// bagefter til musikkens beat i showcase.ts.
const SHOWCASE_ENDPOINT = "fal-ai/kling-video/v2.1/pro/image-to-video";

// Cykles pr. klip (i % 4): dolly-in → truck-right → dolly-out → truck-left.
const SHOWCASE_MOVE_PROMPTS = [
  "slow smooth cinematic dolly-in: the camera glides gently and steadily forward, deeper into the room",
  "slow smooth cinematic truck right: the camera slides steadily to the right, like on a gimbal dolly rail",
  "slow smooth cinematic dolly-out: the camera glides gently and steadily backward, slowly revealing more of the room",
  "slow smooth cinematic truck left: the camera slides steadily to the left, like on a gimbal dolly rail",
];
const SHOWCASE_PROMPT_SUFFIX =
  " The room and everything in it — furniture, walls, windows, floor, materials, colors and lighting — stays EXACTLY as shown and never changes, morphs, appears or disappears. Only the camera moves. No warping, no distortion, no deformation; the architecture keeps a stable, correct perspective throughout. Photorealistic real-estate interior, soft natural lighting, ultra-smooth steady continuous motion, cinematic.";
const SHOWCASE_NEGATIVE_PROMPT =
  "warping, distortion, morphing, deformation, changing furniture, moving walls, melting, flicker, blur, low quality, text, watermark";

export function showcaseMovePrompt(i: number): string {
  return SHOWCASE_MOVE_PROMPTS[i % SHOWCASE_MOVE_PROMPTS.length] + SHOWCASE_PROMPT_SUFFIX;
}

// Generér ét showcase-klip fra ét billede. fal.subscribe poller selv til klippet
// er færdigt (~1-3 min); kald flere parallelt via Promise.all for fart.
export async function generateShowcaseClip(
  imageUrl: string,
  moveIndex: number,
): Promise<{ videoUrl: string }> {
  const result = await fal.subscribe(SHOWCASE_ENDPOINT, {
    input: {
      prompt: showcaseMovePrompt(moveIndex),
      image_url: imageUrl,
      duration: "5" as const,
      negative_prompt: SHOWCASE_NEGATIVE_PROMPT,
    },
  });
  const videoUrl = (result.data as any).video?.url;
  if (!videoUrl) throw new Error("No showcase clip generated");
  return { videoUrl };
}

// Download a remote URL to an explicit local path (used for fal-hosted clips that
// we then feed into FFmpeg). Throws on a non-2xx response.
export async function downloadToFile(remoteUrl: string, destPath: string): Promise<void> {
  const resp = await fetch(remoteUrl);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

// Download a remote URL (e.g. fal-hosted mp4) to local /uploads and return /uploads/<file>.
export async function downloadToUploads(
  remoteUrl: string,
  uploadDir: string,
  ext: string,
): Promise<string> {
  const resp = await fetch(remoteUrl);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const full = path.join(uploadDir, filename);
  fs.writeFileSync(full, buf);
  return `/uploads/${filename}`;
}
