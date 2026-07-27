import { fal } from "@fal-ai/client";
import fs from "fs";
import path from "path";
import { Jimp, JimpMime } from "jimp";
import { r2UploadFile } from "./r2";

// FAL.AI lockdown-kontakt — sæt til true for øjeblikkeligt at blokere alle
// udgående fal.ai-kald (bruges ved kontosikkerhedshændelser).
const FAL_LOCKED_DOWN = false;

const FAL_KEY = process.env.FAL_KEY;
if (FAL_KEY && !FAL_LOCKED_DOWN) {
  fal.config({ credentials: FAL_KEY });
}

export function isFalConfigured(): boolean {
  if (FAL_LOCKED_DOWN) return false;
  return !!FAL_KEY;
}

// ⛔ Hard block — alle udgående fal.ai-kald fejler øjeblikkeligt uanset om
// FAL_KEY er sat. Fjern denne funktion og FAL_LOCKED_DOWN når kontoen er sikret.
function assertNotLockedDown() {
  if (FAL_LOCKED_DOWN) throw new Error("fal.ai er midlertidigt deaktiveret (kontosikkerhed)");
}

// Upload a local file to fal.ai storage and return the public URL.
// fal cannot fetch from localhost / private hosts, so anything we feed it
// as image_url must first be uploaded here.
export async function uploadToFal(localFilePath: string, mimeType?: string): Promise<string> {
  assertNotLockedDown();
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
const FLOORPLAN_3D_PROMPT = `STRICT STRUCTURAL RULES — READ THESE FIRST. THESE OVERRIDE EVERYTHING ELSE.

DO NOT add any room that does not exist in the input floor plan.
DO NOT remove any room that exists in the input floor plan.
DO NOT merge rooms together.
DO NOT split any room into multiple rooms.
DO NOT move any wall, door, or window from its position in the input.
DO NOT add new walls that are not in the input.
DO NOT enlarge or shrink any room.
DO NOT change the outer footprint or boundary of the building.
DO NOT outpaint, extend, or add floor area beyond what exists in the input.
DO NOT enclose any open-air terrace, balcony, or outdoor area — they must remain open with no roof added.
DO NOT reframe, crop, zoom, pan, or rescale the composition — the floor plan must occupy the same position and scale within the image canvas as in the input.
DO NOT add an interior room or walls inside any outdoor terrace area.
DO NOT change the number of rooms. Count the rooms in the input — output must have the exact same count.

The structure is LOCKED. The only thing you may change is the visual rendering style (3D, materials, lighting, furniture, plants).

---

Transform the attached 2D floor plan into a premium ultra-realistic 3D architectural floor plan visualization while obeying every rule above without exception.

Preserve the exact geometry, wall placement, proportions, circulation, room layout, windows, doors, and all architectural boundaries precisely as shown in the original 2D floor plan.

TERRACES STAY OPEN: Any outdoor terrace, balcony, or open area (often drawn with a thin or angled/diagonal outline rather than thick walls) MUST remain an open-air outdoor surface. Do NOT enclose it with walls, do NOT turn it into an interior room, and do NOT add a roof or new walls around it. Keep its exact angled/diagonal boundary shape from the original drawing.

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

Use an elevated isometric dollhouse camera angle at 38–45 degrees from vertical — similar to a classic axonometric architectural illustration. This angle should clearly show both the floor layout AND the walls at full height, making the space feel three-dimensional and explorable.

The perspective should feel like a premium real estate dollhouse model: you can see into every room, walls stand tall, furniture is clearly visible, and the depth of the space is fully readable.

Maintain the EXACT same orientation and viewing direction as the original floor plan:

same rotation
same room alignment
same top/bottom direction

Do not use cinematic perspectives, dramatic wide-angle distortion, or eye-level interior shots.

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

// Pre-processer plantegning til disk (ingen fal.storage upload) — returnerer
// lokal filsti + dimensioner. Bruges af generate3DFloorplanFromUrl så vi
// undgår fal.storage-URL'er, som nano-banana-2/edit ikke kan tilgå (403).
export async function preprocessFloorplanToDisk(
  sourceLocalPath: string,
  outputDir: string,
): Promise<{ filename: string; width: number; height: number }> {
  const image = await Jimp.read(sourceLocalPath);
  try {
    image.autocrop({ tolerance: 0.05, cropOnlyFrames: true });
  } catch (e) {
    console.warn("[preprocessFloorplan] autocrop failed, continuing without:", e);
  }
  image.contrast(0.15);
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  const filename = `floorplan_pre_${Date.now()}.jpg`;
  const outPath = path.join(outputDir, filename);
  await image.write(outPath as `${string}.jpg`);
  return { filename, width, height };
}

// Kald nano-banana-2/edit direkte med en offentlig URL (ingen intern
// fal.storage-upload). Bruges af /api/bolig/floorplan-3d efter lokal
// preprocessing der gemmer filen til uploads/-mappen.
export async function generate3DFloorplanFromUrl(
  publicUrl: string,
  width: number,
  height: number,
): Promise<{ imageUrl: string }> {
  assertNotLockedDown();
  const aspectRatio = nearestSupportedAspectRatio(width, height);
  console.log(`[generate3DFloorplan] ${width}x${height} -> aspect_ratio ${aspectRatio}, url: ${publicUrl.slice(0, 60)}`);
  const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt: FLOORPLAN_3D_PROMPT,
      image_urls: [publicUrl],
      resolution: "2K",
      aspect_ratio: aspectRatio,
    },
  });
  const imageUrl = (result.data as any).images?.[0]?.url;
  if (!imageUrl) throw new Error("No image generated");
  return { imageUrl };
}

// Map et vilkårligt billed-størrelsesforhold til den nærmeste aspect_ratio som
// nano-banana-2/edit understøtter. Vi låser output til input-formatet, så
// modellen ikke selv vælger et større lærred og "outpainter" ekstra rum.
type FloorplanAspectRatio =
  | "9:16" | "2:3" | "3:4" | "4:5" | "1:1"
  | "5:4" | "4:3" | "3:2" | "16:9" | "21:9";

function nearestSupportedAspectRatio(
  width: number,
  height: number,
): FloorplanAspectRatio {
  const supported: Array<[FloorplanAspectRatio, number]> = [
    ["9:16", 9 / 16],
    ["2:3", 2 / 3],
    ["3:4", 3 / 4],
    ["4:5", 4 / 5],
    ["1:1", 1],
    ["5:4", 5 / 4],
    ["4:3", 4 / 3],
    ["3:2", 3 / 2],
    ["16:9", 16 / 9],
    ["21:9", 21 / 9],
  ];
  const target = width / height;
  let best = supported[0];
  let bestDiff = Infinity;
  for (const entry of supported) {
    const diff = Math.abs(entry[1] - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry;
    }
  }
  return best[0];
}


export async function generate3DFloorplan(
  floorPlanImageUrl: string,
): Promise<{ imageUrl: string }> {
  // Pre-processer plantegningen først (crop + kontrast). Falder tilbage til
  // den oprindelige URL hvis preprocessing fejler — så vi aldrig blokerer
  // selve generereringen pga. en jimp-fejl.
  let inputUrl = floorPlanImageUrl;
  // "auto" lader modellen selv vælge lærred — det giver et andet format end
  // input og får den til at outpainte ekstra rum. Vi låser det til input-
  // formatet når preprocessing lykkes.
  let aspectRatio: FloorplanAspectRatio | "auto" = "auto";
  try {
    const pre = await preprocessFloorplan(floorPlanImageUrl);
    inputUrl = pre.url;
    aspectRatio = nearestSupportedAspectRatio(pre.width, pre.height);
    console.log(
      `[generate3DFloorplan] input ${pre.width}x${pre.height} -> aspect_ratio ${aspectRatio}`,
    );
  } catch (e) {
    console.warn("[generate3DFloorplan] preprocess failed, using raw URL:", e);
  }

  const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt: FLOORPLAN_3D_PROMPT,
      image_urls: [inputUrl],
      resolution: "2K",
      aspect_ratio: aspectRatio,
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
  assertNotLockedDown();
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

// "Cinematisk gennemgang": Prompt 2 — Professionel Walkthrough Video (Seedance 2.0).
// Kameraet bevæger sig jævnt igennem boligen, rum for rum, som en high-end
// ejendomsmæglervideo. Første frame = før-tilstand, sidste frame = efter-tilstand.
const CINEMATIC_WALKTHROUGH_PROMPT = `Create a premium cinematic real estate walkthrough video in vertical 9:16 format. The video guides the viewer through a beautiful home as if following a professional cinematographer filming a luxury property listing. The sequence flows naturally from room to room with seamless transitions that feel like continuous camera movement.

STRUCTURE & FLOW:
The video opens with a slow, elegant dolly-in through the main entrance or into the primary living space, establishing the home's character. It then transitions room-by-room using smooth match-cut movements where the camera motion direction carries into the next clip. Each room receives 3-5 seconds of screen time. The pacing is calm and confident, never rushed.

CAMERA LANGUAGE:
- Primary: Slow dolly in / dolly out movements at steady walking pace (1.2m height)
- Secondary: Gentle orbit right revealing 180-degree room views
- Transitions: Match-direction cuts (if camera moves right in clip A, clip B continues moving right)
- Occasional: Slow tilt up from floor details to full room reveal
- Subtle handheld realism: micro-movements suggesting a skilled operator with a gimbal stabilizer, not robotic or AI-perfect

LIGHTING & REALISM:
- Natural daylight from windows as primary light source
- Soft volumetric god rays in bright rooms
- Realistic bounce light on ceilings and walls
- Warm 4000K-5000K color temperature
- True-to-life materials: visible wood grain, stone texture, fabric detail, glass reflections, metallic sheen on fixtures
- Photorealistic shadows with soft penumbra
- Lens characteristics: subtle chromatic aberration at edges, micro lens flare when facing windows, natural vignetting
- Atmospheric depth: light haze in sunbeams, subtle particle motes

TRANSITIONS:
- Seamless hard cuts timed to the music's gentle downbeats
- No jarring jumps; each cut feels like the camera naturally walked into the next room
- Cross-fade only when shifting between interior and exterior spaces (balcony/garden)

MUSIC & AUDIO:
- Cinematic ambient track: soft piano motifs, subtle strings, gentle electronic pads
- Slow, relaxing tempo at 85-95 BPM
- Clean, unobtrusive, emotionally uplifting
- Music builds slightly during kitchen/living room reveals, softens for bedroom/bathroom moments
- Include ultra-subtle ambient audio: faint natural reverb suggesting real room acoustics

FINAL SEQUENCE:
The video concludes with a slow pull-back shot revealing the most impressive room (living room or master bedroom), holding for a moment so the viewer can absorb the space, then a gentle fade to soft white.

OVERALL QUALITY: Indistinguishable from footage shot by a professional real estate videographer using a Sony A7S III or RED camera with cinema lenses. Every frame should feel expensive, warm, and inviting.

OUTPUT: Vertical 9:16, 45-90 seconds total, 24fps cinematic, seamless room-to-room flow.`;

export type VideoMode = "cinematic" | "morph";

// Seedance 2.0 (ByteDance) — image-to-video. Understøtter image_url +
// end_image_url (start→slut frame), aspect_ratio og generate_audio.
const VIDEO_ENDPOINT = "bytedance/seedance-2.0/image-to-video";

// To forskellige opførsler — begge bruger image_url + end_image_url (Seedance 2.0
// start→slut frame interpolation). Kun prompten er forskellig:
//  • cinematic ("Cinematisk gennemgang"): Prompt 2 — professionel walkthrough,
//    kameraet bevæger sig fremad igennem rummet, rum for rum.
//  • morph ("Forvandling"): statisk kamera, rummet transformerer sig fra
//    gammelt til renoveret på fladen.
function buildVideoInput(beforeImageUrl: string, afterImageUrl: string, mode: VideoMode) {
  const base = {
    image_url: beforeImageUrl,
    end_image_url: afterImageUrl,
    duration: "5" as const,
    generate_audio: false,
  };
  if (mode === "cinematic") {
    // Walkthrough-produktet er designet som lodret 9:16.
    return { ...base, aspect_ratio: "9:16" as const, prompt: CINEMATIC_WALKTHROUGH_PROMPT };
  }
  // Forvandling (morph): "auto" følger input-billedets format, så landskabs-
  // billeder ikke beskæres/zoomes ind i et tvunget 9:16-udsnit.
  return { ...base, aspect_ratio: "auto" as const, prompt: TRANSFORM_VIDEO_MORPH_PROMPT };
}

export async function generateAnimationVideo(
  beforeImageUrl: string,
  afterImageUrl: string,
  mode: VideoMode = "cinematic",
): Promise<{ videoUrl: string }> {
  assertNotLockedDown();
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
  assertNotLockedDown();
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

// ===== 3. BOLIG SHOWCASE-KLIP (Kling v1.6 Pro image-to-video) =====
// Hvert ejendomsfoto → ét AI-klip med ÉN ægte kamerabevægelse (orbit, dolly,
// pan, tilt). Klippene klippes bagefter til musikkens beat i showcase.ts.
// Kling v1.6 Pro leverer den bedste balance af qualitet og hastighed til
// property showcase — genuine gimbal moves, depth, parallax.
const SHOWCASE_ENDPOINT = "fal-ai/kling-video/v1.6/pro/image-to-video";
const SHOWCASE_COST_PER_CLIP_USD = 0.28; // Kling v1.6 Pro, ~5-sec clip

// Visual quality suffix — gælder for alle showcase-klip.
// Fokuserer på nordisk ejendomsæstetik: lyst, varmt, cinematisk.
const SHOWCASE_VISUAL_SUFFIX =
  " Indistinguishable from professional real estate footage shot on a Sony A7S III with a cinema gimbal. Natural Scandinavian daylight through large windows — bright, clean, airy. Warm white walls, oak wood flooring, soft textile furniture. Subtle lens breathing at 24mm focal length. Photorealistic materials: visible wood grain on floors and furniture, soft fabric weave on sofas and cushions, crisp glass reflections. Natural shadows with soft penumbra. Nordic interior — cozy-luxury, aspirational yet livable. Vertical 9:16, 24fps cinematic motion, no jump cuts.";

// ── 5 kamerabevægelser som matcher Rendy.io's vocabulary ─────────────────────
// Navnene og beskrivelserne er bevidst holdt til de samme 5 typer som Rendy
// bruger: Push In, Slide Left, Slide Right, Parallax Left, Parallax Right.
// Kling v1.6 Pro gengiver alle 5 pålideligt fra et enkelt stillbillede.
export type CameraMove =
  | "push_in"
  | "slide_left"
  | "slide_right"
  | "parallax_left"
  | "parallax_right";

const SHOWCASE_MOVE_PROMPTS: Record<CameraMove, string> = {
  // Push In — kameraet glider langsomt fremad ind i rummet, afslører dybde.
  // Ideel til første klip og rum med stærk perspektivflugt (stue, entre, gang).
  push_in:
    "Push In: camera glides smoothly and steadily forward into the room at eye height, revealing spatial depth and interior details from the doorway. Natural, confident pace — like a cinematographer walking into the space. Single continuous movement, no hesitation.",

  // Slide Left — kameraet bevæger sig horisontalt til venstre.
  // Bedst til brede rum (stuer, køkkener) med horisontale elementer.
  slide_left:
    "Slide Left: camera moves smoothly from right to left across the room at a consistent height. The movement is lateral and fluid — a clean horizontal translation that reveals the full width of the space. No zoom change, pure slide motion.",

  // Slide Right — kameraet bevæger sig horisontalt til højre.
  // Bedst til brede rum — kontrast til Slide Left i redigeringen.
  slide_right:
    "Slide Right: camera moves smoothly from left to right across the room at a consistent height. The movement is lateral and fluid — a clean horizontal translation that reveals the full width of the space. No zoom change, pure slide motion.",

  // Parallax Left — kameraet bevæger sig til venstre med dybde-separation.
  // Forgrundselementer bevæger sig hurtigere end baggrunden — skaber 3D-dybde.
  parallax_left:
    "Parallax Left: camera moves left with strong foreground-background depth separation. Foreground objects (furniture, pillars, doorframes) move noticeably faster than the background wall — creating a compelling 3D parallax effect that reveals the room's depth. Smooth gimbal motion.",

  // Parallax Right — kameraet bevæger sig til højre med dybde-separation.
  // Modsat Parallax Left — optimal variation i reelens midte.
  parallax_right:
    "Parallax Right: camera moves right with strong foreground-background depth separation. Foreground objects (furniture, pillars, doorframes) move noticeably faster than the background wall — creating a compelling 3D parallax effect that reveals the room's depth. Smooth gimbal motion.",
};

// Select the best camera move for a single image based on its aspect ratio
// and position in the sequence. This mimics Rendy.io's per-image AI analysis:
// perspective, depth, and room orientation all influence the choice.
//
// Rules (derived from Rendy editorial patterns):
//  • First clip   → Push In (always; establishes the property)
//  • Wide rooms   (ar > 1.35): Slide Left / Slide Right — horizontal travel
//  • Portrait     (ar < 0.80): Push In / Parallax — depth moves for tall rooms
//  • Square-ish   (0.80-1.35): Parallax Left / Parallax Right — maximum depth
//  • Last clip    → Slide Right (clean forward-momentum ending)
export function selectCameraMove(
  aspectRatio: number,
  clipIndex: number,
  totalClips: number,
): CameraMove {
  if (clipIndex === 0) return "push_in";
  if (clipIndex === totalClips - 1) return "slide_right";

  // Wide landscape rooms → slide moves to sweep the full width
  if (aspectRatio > 1.35) {
    return clipIndex % 2 === 0 ? "slide_left" : "slide_right";
  }
  // Tall/portrait rooms → depth-emphasising moves
  if (aspectRatio < 0.80) {
    return clipIndex % 2 === 0 ? "push_in" : "parallax_right";
  }
  // Square-ish rooms → parallax for maximum depth illusion
  return clipIndex % 2 === 0 ? "parallax_left" : "parallax_right";
}

export function showcaseMovePrompt(move: CameraMove): string {
  return SHOWCASE_MOVE_PROMPTS[move] + SHOWCASE_VISUAL_SUFFIX;
}

// ── Walkthrough per-clip prompts (Prompt 2 visual style) ──────────────────
// Samme 4 kamerabevægelser som showcase, men med Prompt 2's professionelle
// ejendomsmægler-æstetik (luxury real estate, 24fps cinema, ikke social media).
const WALKTHROUGH_VISUAL_SUFFIX =
  " Photorealistic quality indistinguishable from professional real estate videography (Sony A7S III / RED camera, cinema lenses). Natural daylight as primary source with soft volumetric god rays. Realistic bounce light on ceilings and walls. Warm 4000K-5000K color temperature. True-to-life materials: visible wood grain, stone texture, fabric detail, glass reflections, metallic sheen. Photorealistic shadows with soft penumbra. Subtle chromatic aberration at frame edges, micro lens flare when facing windows, natural vignetting. Shallow depth of field. Vertical 9:16 format, 24fps cinematic.";

const WALKTHROUGH_MOVE_PROMPTS = [
  "Slow smooth cinematic dolly-in: camera glides steadily forward into the room at walking pace (1.2m height), revealing depth and interior details.",
  "Gentle orbit right: camera smoothly arcs around the right side of the space at waist height, keeping the room centered, revealing spatial volume and furniture placement.",
  "Slow cinematic dolly-out: camera pulls back smoothly to reveal more of the space, ending with a wide establishing shot.",
  "Slow pan left-to-right: smooth horizontal sweep across the full width of the room, capturing materials, furniture, and natural light from windows.",
];

export function walkthroughMovePrompt(i: number): string {
  return WALKTHROUGH_MOVE_PROMPTS[i % WALKTHROUGH_MOVE_PROMPTS.length] + WALKTHROUGH_VISUAL_SUFFIX;
}

// ── Guidet rundvisning (AI Boligfremvisning) ───────────────────────────────
// Landscape 16:9 klip til den interaktive rundvisningsviser + samlet film.
// Prompten er rum-bevidst: kameraet "går ind" i rummet som en ejendomsmægler
// der fører køberen rundt — rolig, glidende, professionel bevægelse.
const GUIDED_TOUR_VISUAL_SUFFIX =
  " Photorealistic quality indistinguishable from professional real estate videography (Sony A7S III, cinema lenses). Natural daylight, soft realistic shadows, true-to-life materials and reflections. Warm inviting color grade. The room's architecture, furniture and layout must remain EXACTLY as in the source image — no added objects, no altered geometry. Landscape 16:9 format, 24fps cinematic, smooth gimbal motion.";

const GUIDED_TOUR_MOVES = [
  "Slow smooth cinematic walk-in: camera glides steadily forward into the room at eye height and walking pace, as if a real estate agent is guiding a buyer into the space, revealing depth and details.",
  "Gentle glide right: camera smoothly drifts forward and slightly right at eye height, naturally scanning the room the way a visitor's gaze would move on entering.",
  "Slow smooth cinematic walk-in with a subtle left drift: camera moves forward at walking pace while gently revealing the left side of the room.",
];

export async function generateGuidedTourClip(
  imageUrl: string,
  roomName: string,
  moveIndex: number,
): Promise<{ videoUrl: string }> {
  assertNotLockedDown();
  const move = GUIDED_TOUR_MOVES[moveIndex % GUIDED_TOUR_MOVES.length];
  const prompt = `Entering the ${roomName}. ${move}${GUIDED_TOUR_VISUAL_SUFFIX}`;
  const result = await Promise.race([
    fal.subscribe(SHOWCASE_ENDPOINT, {
      input: {
        prompt,
        image_url: imageUrl,
        aspect_ratio: "16:9" as const,
        duration: "5" as const,
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Guided tour clip timeout (10 min)")), 600_000),
    ),
  ]);
  const videoUrl = (result.data as any).video?.url;
  if (!videoUrl) throw new Error("No guided tour clip generated");
  console.log(`[GuidedTour] clip "${roomName}" done (Kling v1.6 Pro)`);
  return { videoUrl };
}

// Generér ét walkthrough-klip fra ét billede (Kling v1.6 Pro).
export async function generateWalkthroughClip(
  imageUrl: string,
  moveIndex: number,
): Promise<{ videoUrl: string }> {
  assertNotLockedDown();
  const result = await Promise.race([
    fal.subscribe(SHOWCASE_ENDPOINT, {
      input: {
        prompt: walkthroughMovePrompt(moveIndex),
        image_url: imageUrl,
        aspect_ratio: "9:16" as const,
        duration: "5" as const,
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Walkthrough clip timeout (10 min)")), 600_000),
    ),
  ]);
  const videoUrl = (result.data as any).video?.url;
  if (!videoUrl) throw new Error("No walkthrough clip generated");
  console.log(`[Walkthrough] clip ${moveIndex} done (Kling v1.6 Pro)`);
  return { videoUrl };
}

// Generér ét showcase-klip fra ét billede (Kling v1.6 Pro).
// `move` er pre-valgt af selectCameraMove() baseret på billedets aspect ratio.
// fal.subscribe poller selv til klippet er færdigt (~1-3 min).
export async function generateShowcaseClip(
  imageUrl: string,
  move: CameraMove,
): Promise<{ videoUrl: string }> {
  assertNotLockedDown();
  const result = await Promise.race([
    fal.subscribe(SHOWCASE_ENDPOINT, {
      input: {
        prompt: showcaseMovePrompt(move),
        image_url: imageUrl,
        aspect_ratio: "9:16" as const,
        duration: "5" as const,
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Clip generation timeout (10 min)")), 600_000),
    ),
  ]);
  const videoUrl = (result.data as any).video?.url;
  if (!videoUrl) throw new Error("No showcase clip generated");
  console.log(`[Showcase] clip (${move}) done — cost ~$${SHOWCASE_COST_PER_CLIP_USD.toFixed(2)} (Kling v1.6 Pro)`);
  return { videoUrl };
}

// Drone intro/outro clip — Seedance 2.0 two-frame interpolation (start → end).
// Bruges kun når startText/endText er angivet (droneMode). Seedance 2.0
// bevarer here fordi den understøtter end_image_url start→slut interpolation
// bedre end Kling v1.6 (som bruger tail_image_url og er mere uforudsigelig).
const DRONE_ENDPOINT = "bytedance/seedance-2.0/image-to-video";
const DRONE_TRANSITION_PROMPT =
  "Single continuous uninterrupted cinematic camera move. Camera starts at the first scene and smoothly glides forward, revealing the second scene seamlessly. No cuts, no transitions, no dissolves — one continuous shot from start to finish. Premium real estate cinematography, smooth gimbal movement, warm natural light, photorealistic 4K quality.";

// Generate ONE transition clip using Seedance 2.0 start-frame + end-frame.
export async function generateDroneClip(
  startImageUrl: string,
  endImageUrl: string,
): Promise<{ videoUrl: string }> {
  assertNotLockedDown();
  const result = await Promise.race([
    fal.subscribe(DRONE_ENDPOINT, {
      input: {
        prompt: DRONE_TRANSITION_PROMPT,
        image_url: startImageUrl,
        end_image_url: endImageUrl,
        aspect_ratio: "9:16" as const,
        duration: "5" as const,
        generate_audio: false,
      } as any,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Drone clip timeout (10 min)")), 600_000),
    ),
  ]);
  const videoUrl = (result.data as any).video?.url;
  if (!videoUrl) throw new Error("No drone clip generated");
  console.log(`[Showcase] drone clip done (Seedance 2.0)`);
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
  r2UploadFile(full).catch(() => {});
  return `/uploads/${filename}`;
}
