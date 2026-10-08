/** User-approved refinement of Scandinavian Exclusive; other styles/levels stay unchanged. */
export const SCANDINAVIAN_EXCLUSIVE_DIRECTION = `UPDATED SCANDINAVIAN EXCLUSIVE MATERIAL AND DESIGN DIRECTION:

For Scandinavian tier3 only, this warm Scandinavian minimalism with subtle Japandi influence replaces conflicting Scandinavian palette, material and furniture-form examples above. It does not replace room-function requirements, camera preservation, daylight preservation or the authorized edit scope.

Use warm off-white, cream, oatmeal, pale sand and soft beige balanced with light natural oak or ash and naturally visible grain. Pair refined timber with matte, honed travertine- or limestone-like surfaces where appropriate. Keep darker timber and muted-black or bronze details small and secondary. Use tonal variation and tactile textures to create depth while preserving Nordic lightness; never impose a dark exposure, orange cast or a heavy hotel look.

Combine restrained lines with soft curves, rounded edges, comfortable proportions, precisely fitted joinery, discreet handles and well-integrated storage. In living rooms, use softly rounded upholstered seating in cream or oatmeal, with tailored boucle, wool or linen-like textures; visible timber frames or legs are optional. A rounded light-stone or light-wood coffee table, a textured woven rug and softly draping curtains create a calm, comfortable seating zone. Keep furniture visually balanced and leave natural floor breathing space.

Adapt to the selected room: timber fronts and stone worktops within existing kitchen service zones; moisture-suitable finishes and stone-like surfaces within existing bathroom zones; tactile linen, wool and boucle only where useful in living spaces. In furnishing-only scope, fixed-finish examples serve solely as material and colour references for permitted movable pieces. Do not add living-room furniture to a kitchen, bathroom or utility room. Keep circulation and cabinet access clear.

Use a few carefully selected matte ceramics, plants and functional objects. Let natural materials and texture provide most of the visual interest. Retain the original daylight direction, strength and time of day. Supplemental warm task light must remain subtle and physically plausible; in furnishing-only scope, use freestanding lamps and preserve all existing fixed lighting. Never invent recesses or new window light.

Aim for a clean, believable professional interior photograph: natural material variation, precise seams and joins, contact shadows, coherent reflections, resolved window detail and the unchanged original view. No plastic textures, synthetic blur, excessive gloss, exaggerated sharpening, warped fixtures, text, logos or interface elements. This specification does not promise native 4K detail; resolution is controlled by the delivery pipeline.`;

export function selectedExclusiveDirection(preset: string): string {
  return preset.includes("STYLE: Skandinavisk (scandinavian).") && preset.includes("TIER: tier3.")
    ? `${SCANDINAVIAN_EXCLUSIVE_DIRECTION}\n\n${roomApplication(preset)}`
    : "";
}

const ROOM_APPLICATIONS: Record<string, string> = {
  "living room": "Use the living-room seating, table, rug and curtain direction above; add a TV only when present or requested.",
  bedroom: "Apply cream/oatmeal textiles to the bed and bedding, rounded light-oak bedside pieces and practical storage; do not add a sofa or coffee-table zone.",
  kitchen: "Use light oak/ash and pale honed stone for authorized fronts and worktops in existing service zones. In furnishing-only mode preserve them and style only allowed movable items.",
  bathroom: "Use moisture-suitable light-oak-look joinery, cream/pale-sand mineral surfaces and small secondary metal accents in authorized renovation; no upholstered seating or loose living-room rugs.",
  "dining room": "Use a rounded light-oak or pale-stone dining table and comfortable cream/oatmeal dining chairs sized to circulation, not a lounge sofa.",
  "home office": "Use a practical light-oak desk, supportive task chair and restrained freestanding storage; keep work surfaces usable.",
  "kids room": "Use safe rounded age-appropriate furniture, washable pale textiles and accessible toy storage; avoid heavy stone furniture.",
  studio: "Coordinate compact sleeping, working and seating functions only where space supports them; use light oak and cream textiles without crowding.",
  "game room": "Retain gaming function and equipment; use light-oak storage, comfortable seating and restrained pale textiles without blocking ventilation.",
  gym: "Retain exercise equipment and clear workout space; translate the palette into practical storage and appropriate accessories, not lounge rugs or stone tables.",
  "laundry room": "Preserve laundry functions and access; use practical baskets and moisture-suitable light-toned storage only within the authorized scope.",
  "meeting room": "Use a correctly sized light-oak meeting table, supportive cream-toned chairs and useful storage; preserve screen sightlines.",
  spa: "Use moisture-suitable pale mineral surfaces where authorized, light-oak-look storage and functional towels; retain existing wellness functions.",
  outdoor: "Use weather-suitable light timber, outdoor-rated pale upholstery and appropriate stone accents; retain the actual outdoor function and weather.",
  "open plan living": "Coordinate living and dining zones using rounded cream seating, light-oak dining furniture and pale stone accents while keeping circulation open.",
  entryway: "Use compact light-oak shoe storage, hooks or benches only within the allowed scope; leave entry and door swings clear.",
};

function roomApplication(preset: string): string {
  const room = /^ROOM FUNCTION: ([^.]+)\./.exec(preset)?.[1] ?? "";
  const application = ROOM_APPLICATIONS[room];
  if (!application) throw new Error(`Missing Scandinavian Exclusive room application: ${room}`);
  return `SCANDINAVIAN EXCLUSIVE ROOM APPLICATION (${room}): ${application} All examples remain subordinate to the authorized edit scope.`;
}

/** Room-specific renovation exception; never grant these permissions to staging. */
export const SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION = `SCANDINAVIAN EXCLUSIVE BATHROOM — COMPLETE AUTHORIZED RENOVATION:
Redesign the ENTIRE visible bathroom in the approved warm Scandinavian minimalism with subtle Japandi influence, not only its basin or vanity. This requirement overrides a partial-update interpretation of the earlier bathroom examples; it does not override camera, architecture, daylight or explicit user retain wishes.
Replace the visible floor finish, ALL wall tiles and wall finishes, and ceiling finish where present on their original planes. Remove the old patterned tile design, including tiles around the bath and inside the shower, rather than retaining them as a backdrop. Use a coordinated moisture-suitable warm beige, sand, cream or taupe limestone-/travertine-like composition with realistic joints, restrained mineral variation and safe non-slip wet-area finishes. Keep surfaces light and daylight natural.
Replace the existing bathtub, its surround or apron, shower enclosure or screen, shower tray where present, shower fittings, toilet, vanity, basin and taps with contemporary equivalents in their ORIGINAL functional zones and with the ORIGINAL fixture counts. The bath and shower POSITION and FUNCTION stay; their old design and materials do not. Use clear shower glazing, refined sanitaryware, moisture-suitable light-oak or ash-look vanity finishes, a honed pale-stone surface and small secondary bronze or muted-black fittings. No untreated timber in splash zones.
Renew the mirror, storage, all visible existing ceiling/wall/task/mirror light fixtures, movable lamps where present, towels and accessories coherently. Fixed lights use existing mounting points; no new ceiling coves, spotlight grids or structural niches. Do not retain original finishes, sanitary fixtures or lamps merely because they already fit the palette. Preserve only protected architecture, original camera/daylight and explicitly retained items within the permitted scope.
WHOLE-BATHROOM CHECKLIST: floor finish; all wall finishes and tiles; ceiling finish where present; existing bathtub and surround; existing shower glazing, tray and fittings; existing toilet; vanity, basin and taps; mirror and storage; all existing light fixtures; appropriate textiles and accessories. Renew every authorized visible category together. A new vanity plus candles, plants or towels with the original tiles, floor, bathtub and shower still intact is NOT a completed renovation.
Keep the original camera position, viewpoint, framing, room dimensions, openings, window divisions, outdoor view, wall/ceiling/floor geometry, circulation, ventilation and service zones. Do not add a bath, shower, second basin or other missing function. No graphite-led Modern style, heavy dark hotel scheme, living-room furniture, loose living-room rugs, synthetic blur or orange exposure.`;

export function selectedScandinavianBathroomRenovation(preset: string, scope: string): string {
  return scope === "renovation_visualization" && selectedExclusiveDirection(preset) &&
    preset.startsWith("ROOM FUNCTION: bathroom.")
    ? SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION : "";
}
