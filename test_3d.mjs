import fs from 'fs';
import { fal } from '@fal-ai/client';
import { Jimp, JimpMime } from 'jimp';

fal.config({ credentials: process.env.FAL_KEY });

const FLOORPLAN_3D_PROMPT = `Generate a top-down 3D architectural dollhouse floor plan based STRICTLY on the attached floor plan image.

The output MUST remain a 3D floor plan visualization — NOT an eye-level interior render, NOT a cinematic room scene, and NOT an architectural perspective photograph.

Preserve the exact room layout, wall positions, room shapes, doors, windows, terraces, balconies, and circulation paths exactly as shown in the input image.

DO NOT:
- add rooms
- remove rooms
- change room sizes
- alter wall geometry
- rotate the floor plan
- reinterpret the structure

Camera:
- fixed near-top-down orthographic view
- same orientation and rotation as input
- minimal perspective distortion
- slight elevation only to reveal wall height
- maintain maximum room readability

Walls:
- visible thickness
- realistic vertical wall height
- crisp architectural edges
- clear room separation

Terraces and balconies must remain exterior open-air spaces and must never become enclosed interior rooms. Outdoor areas may contain minimal outdoor patio furniture only.

Only furnish interior rooms using clean modern Scandinavian furniture appropriate to room type.

Lighting:
- neutral soft daylight
- evenly distributed illumination
- no dramatic shadows

Rendering:
- ultra-sharp architectural visualization
- crisp edges
- high room readability
- no blur
- no depth of field
- professional real-estate dollhouse style

The final result must look like a professional 3D real-estate floor plan visualization with strict architectural accuracy.`;

const srcPath = 'attached_assets/content_(27)_1779952454341.jpg';
console.log('Step 1: Load + preprocess image with jimp');
const image = await Jimp.read(srcPath);
console.log(`  Original size: ${image.width}x${image.height}`);
try {
  image.autocrop({ tolerance: 0.05, cropOnlyFrames: true });
  console.log(`  After autocrop: ${image.width}x${image.height}`);
} catch (e) {
  console.warn('  autocrop failed:', e.message);
}
image.contrast(0.15);
const buffer = await image.getBuffer(JimpMime.jpeg);
console.log(`  Preprocessed buffer: ${buffer.length} bytes`);
fs.writeFileSync('/tmp/test_3d_input_preprocessed.jpg', buffer);

console.log('\nStep 2: Upload to fal.storage');
const file = new File([buffer], `floorplan_${Date.now()}.jpg`, { type: 'image/jpeg' });
const uploadedUrl = await fal.storage.upload(file);
console.log(`  URL: ${uploadedUrl}`);

console.log('\nStep 3: Call fal-ai/nano-banana-2/edit (resolution 2K, seed 42)');
const start = Date.now();
const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
  input: {
    prompt: FLOORPLAN_3D_PROMPT,
    image_urls: [uploadedUrl],
    resolution: '2K',
    seed: 42,
  },
});
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`  Generated in ${elapsed}s`);
const outputUrl = result.data.images?.[0]?.url;
console.log(`  Output URL: ${outputUrl}`);

console.log('\nStep 4: Download result for inspection');
const resp = await fetch(outputUrl);
const outBuf = Buffer.from(await resp.arrayBuffer());
fs.writeFileSync('/tmp/test_3d_result.png', outBuf);
console.log(`  Saved to /tmp/test_3d_result.png (${outBuf.length} bytes)`);
