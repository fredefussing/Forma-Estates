/** User-approved refinement of Scandinavian Exclusive; other styles/levels stay unchanged. */
export const SCANDINAVIAN_EXCLUSIVE_DIRECTION = `UPDATED SCANDINAVIAN EXCLUSIVE MATERIAL AND DESIGN DIRECTION:
For Scandinavian tier3 only, this warm, organic, modern-exclusive direction replaces earlier Scandinavian palette and material examples, including pale-oak-only suggestions or avoidance of walnut. It does not replace room-function requirements, camera preservation, daylight preservation or the authorized edit scope.
Use warm beige, sand, cream and taupe balanced with deeper brown walnut-toned timber and naturally visible grain. Pair refined timber with matte, honed travertine- or limestone-like surfaces where appropriate, and small dark-bronze or muted-black details. Balance darker timber with light surfaces; never impose a dark exposure, orange cast or a heavy hotel look.
Combine restrained architectural lines with soft curves, rounded edges, comfortable proportions, precisely fitted joinery, discreet handles and well-integrated storage. Existing shelving or alcoves may be refined where the scope permits; do not carve new structural niches or change the room footprint.
Adapt to the selected room: timber fronts and stone worktops within existing kitchen service zones; moisture-suitable finishes and stone-like surfaces within existing bathroom zones; tactile linen, wool and boucle only where useful in living spaces. Do not add living-room furniture to a kitchen, bathroom or utility room. Keep circulation and cabinet access clear.
Use a few carefully selected ceramics, plants and functional objects. Retain the original daylight direction, strength and time of day. Supplemental warm task light must remain subtle and physically plausible at existing mounting points or permitted cabinetry; never invent recesses or new window light.
Aim for a clean, believable professional interior photograph: natural material variation, precise seams and joins, contact shadows, coherent reflections, resolved window detail and the unchanged original view. No plastic textures, synthetic blur, excessive gloss, exaggerated sharpening, warped fixtures, text, logos or interface elements. This specification does not promise native 4K detail; resolution is controlled by the delivery pipeline.`;

export function selectedExclusiveDirection(preset: string): string {
  return preset.includes("STYLE: Skandinavisk (scandinavian).") && preset.includes("TIER: tier3.")
    ? SCANDINAVIAN_EXCLUSIVE_DIRECTION
    : "";
}

/** Room-specific renovation exception; never grant these permissions to staging. */
export const SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION = `SCANDINAVIAN EXCLUSIVE BATHROOM — COMPLETE AUTHORIZED RENOVATION:
Redesign the ENTIRE visible bathroom in the approved warm organic Scandinavian Exclusive style, not only its basin or vanity. This requirement overrides a partial-update interpretation of the earlier bathroom examples; it does not override camera, architecture, daylight or explicit user retain wishes.
Replace the visible floor finish, ALL wall tiles and wall finishes, and ceiling finish where present on their original planes. Remove the old patterned tile design, including tiles around the bath and inside the shower, rather than retaining them as a backdrop. Use a coordinated moisture-suitable warm beige, sand, cream or taupe limestone-/travertine-like composition with realistic joints, restrained mineral variation and safe non-slip wet-area finishes. Keep surfaces light and daylight natural.
Replace the existing bathtub, its surround or apron, shower enclosure or screen, shower tray where present, shower fittings, toilet, vanity, basin and taps with contemporary equivalents in their ORIGINAL functional zones and with the ORIGINAL fixture counts. The bath and shower POSITION and FUNCTION stay; their old design and materials do not. Use clear shower glazing, refined sanitaryware, moisture-suitable walnut-toned vanity accents, a honed warm-stone surface and restrained dark-bronze or muted-black fittings. No untreated timber in splash zones.
Renew the mirror, storage, all visible existing ceiling/wall/task/mirror light fixtures, movable lamps where present, towels and accessories coherently. Fixed lights use existing mounting points; no new ceiling coves, spotlight grids or structural niches. Do not retain original finishes, sanitary fixtures or lamps merely because they already fit the palette. Preserve only protected architecture, original camera/daylight and explicitly retained items within the permitted scope.
WHOLE-BATHROOM CHECKLIST: floor finish; all wall finishes and tiles; ceiling finish where present; existing bathtub and surround; existing shower glazing, tray and fittings; existing toilet; vanity, basin and taps; mirror and storage; all existing light fixtures; appropriate textiles and accessories. Renew every authorized visible category together. A new vanity plus candles, plants or towels with the original tiles, floor, bathtub and shower still intact is NOT a completed renovation.
Keep the original camera position, viewpoint, framing, room dimensions, openings, window divisions, outdoor view, wall/ceiling/floor geometry, circulation, ventilation and service zones. Do not add a bath, shower, second basin or other missing function. No graphite-led Modern style, heavy dark hotel scheme, living-room furniture, loose living-room rugs, synthetic blur or orange exposure.`;

export function selectedScandinavianBathroomRenovation(preset: string, scope: string): string {
  return scope === "renovation_visualization" && selectedExclusiveDirection(preset) &&
    preset.startsWith("ROOM FUNCTION: bathroom.")
    ? SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION : "";
}
