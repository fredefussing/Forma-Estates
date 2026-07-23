// ── Structural preservation prefix — prepended to ALL redesign prompts sent to Collov ──
// Single source of truth: imported by server/routes.ts AND scripts/test-structure-preservation.ts
// so the test always validates the exact prompt the server sends.
export const STRUCTURAL_PRESERVATION_PREFIX = `CRITICAL STRUCTURAL PRESERVATION — READ BEFORE ALL ELSE:
This is a before/after interior redesign, NOT a new photo. The output image must be the EXACT SAME PHOTOGRAPH as the input, with only the furniture, decor, and colours changed digitally — like a virtual staging overlay on top of the original photo.
You must preserve with PIXEL-LEVEL fidelity:
- The exact camera position, angle, height, tilt, and field of view — do not regenerate the shot, do not reframe, do not zoom in or out, do not shift left or right
- The exact room geometry: floor area, ceiling height, wall angles, room proportions
- The walls exactly as they appear in the original photo — same colour, same paint finish, same texture, same material, same condition, same trim and skirting boards. The walls are NEVER repainted, recoloured, retextured, or replaced, even if the chosen style would normally suggest a different wall colour
- Every architectural element in its exact original position: windows (size, position, wall), doors (position, which wall), archways, columns, beams, niches, fireplaces, built-in structural features
- Floor material texture and colour family unless the style prompt explicitly overrides it
- Natural light direction, shadows, and ambient light temperature exactly as in the original photo
IDENTIFYING WALLS VS FURNITURE:
- Before changing anything, correctly distinguish between actual walls (the room's fixed vertical surfaces, ceiling-to-floor, behind everything else) and furniture or objects that happen to sit close to or against a wall (such as wardrobes, bookshelves, sofas, headboards, cabinets, or large items pushed flush against a wall)
- Large furniture pieces positioned near or against a wall must NOT be mistaken for part of the wall — these are movable objects and ARE part of the redesign, even if they span a large area or touch the wall surface
- Only the true underlying wall surface (visible behind, above, or around furniture) is locked and preserved — the furniture itself in front of that wall is freely replaced as part of the new design
ABSOLUTE RULES:
- Do NOT generate a new camera angle, perspective, or viewpoint under any circumstances
- Do NOT alter room layout, floor plan, proportions, ceiling height, or any structural detail
- Do NOT change the wall colour, wall paint, wall texture, or wall material under any circumstances, regardless of what the style prompt below describes
- Do NOT move, resize, remove, or reposition windows or doors
- Do NOT crop, zoom, pan, tilt, or reframe the image in any way
- If in doubt, treat the original photo as a locked background plate and only swap out movable objects within it
OUTPUT QUALITY: Photorealistic, 4K architectural visualisation, natural daylight, clean render.
ONLY the furniture, soft furnishings, decorative objects, and movable lighting are replaced. The camera, structure, light, and walls stay IDENTICAL to the input photo, no exceptions.\n\n`;
