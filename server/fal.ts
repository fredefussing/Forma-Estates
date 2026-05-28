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
const TRANSFORM_VIDEO_PROMPT = `Cinematic renovation of the room. The camera slowly pushes forward into the space throughout the entire transformation, with subtle parallax where foreground elements move slightly faster than background elements to enhance depth. The space magically transforms — walls change color, flooring spreads seamlessly across the floor, furniture materializes in place, and warm lighting gradually illuminates the room. The motion is smooth, elegant, and continuous with no abrupt cuts. Photorealistic, 8K.

Transform the scene from an empty or existing interior into a fully furnished, fully designed modern space through a smooth architectural growth animation.

All furniture, architectural elements, and decor begin at minimal or reduced scale within the room and gradually scale up into their final full-size positions. Objects emerge naturally from the floor, walls, and structural surfaces with smooth, physically realistic motion.

The entire room structure refines progressively: flooring extends and completes itself, wall materials finish and refine, built-in elements grow into place, and architectural details resolve from simple forms into fully detailed surfaces.

All furniture appears in correct spatial positions according to a realistic interior layout, including seating areas, tables, storage units, lighting fixtures, and decorative elements appropriate to the room type. Each element expands smoothly with natural easing and settles gently into its final position.

Windows, doors, and fixed architectural boundaries remain constant throughout the animation and act as stable anchors for the transformation.

Lighting transitions gradually from neutral base lighting to a fully realized atmospheric lighting setup, with warm ambient illumination and soft natural daylight blending seamlessly. Interior lights fade in naturally as furniture and materials finalize.

Materials evolve from basic surfaces into fully detailed, high-quality finishes such as wood, stone, fabric, glass, and metal, with realistic reflections and physically based rendering.

A slow cinematic camera movement pushes gently through the space, maintaining a wide-angle architectural perspective with subtle parallax to enhance depth. Foreground and background elements shift naturally to reinforce realism.

The motion is smooth, elegant, and continuous with no abrupt transitions. The entire transformation feels like a real-time architectural build-up of the space.

Final result: a fully realized, photorealistic interior environment with cinematic lighting, high detail, and cohesive design.

Resolution: ultra-realistic, 8K detail, global illumination, soft shadows, high dynamic range, architectural visualization quality`;

// Kling v1.6 pro: understøtter tail_image_url for før→efter-transitions.
// Den oprindelige 422 fra dette endpoint var pga. billed-størrelse (>1920px)
// — nu hvor uploadToFal resizer automatisk, virker tail_image_url fint.
const VIDEO_ENDPOINT = "fal-ai/kling-video/v1.6/pro/image-to-video";

function buildVideoInput(beforeImageUrl: string, afterImageUrl: string) {
  return {
    prompt: TRANSFORM_VIDEO_PROMPT,
    image_url: beforeImageUrl,
    tail_image_url: afterImageUrl,
    duration: "5",
    aspect_ratio: "16:9",
  };
}

export async function generateAnimationVideo(
  beforeImageUrl: string,
  afterImageUrl: string,
): Promise<{ videoUrl: string }> {
  const result = await fal.subscribe(VIDEO_ENDPOINT, {
    input: buildVideoInput(beforeImageUrl, afterImageUrl),
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
): Promise<{ requestId: string }> {
  const { request_id } = await fal.queue.submit(VIDEO_ENDPOINT, {
    input: buildVideoInput(beforeImageUrl, afterImageUrl),
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
