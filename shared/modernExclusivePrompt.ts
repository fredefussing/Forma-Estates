import revision from "./forma-prompts.json";
import type { ImageEditScope } from "./canonicalImagePrompt";

/** Approved source text. Room-specific application is substituted, not layered over old styles. */
export const MODERN_EXCLUSIVE_TEMPLATE = `TASK: WARM CONTEMPORARY MODERN — TIER 3

Edit the supplied original property photograph into a convincing professional photograph of the same space after a cohesive premium renovation. Preserve the original or explicitly selected room function. If no room function is specified, use the function evident in the original image. Apply the design language below through elements appropriate to that room.

The intended result is warm, inviting contemporary design with substantial matte graphite elements, selective rich walnut accents, luminous warm stone and carefully integrated lighting. Make the transformation clearly visible through redesigned surfaces, fittings and furnishings, while keeping the original architecture and photographic viewpoint intact.

FIXED CAMERA, ARCHITECTURE AND DAYLIGHT

Keep the original camera position, height, tilt, lens perspective, field of view, framing, orientation and aspect ratio. Preserve room dimensions, ceiling height, wall and ceiling planes, openings, window frames and glazing divisions, doors, beams, columns, radiators, architectural mouldings and fireplace geometry. Preserve the outdoor view and weather.

Do not enlarge the space, reveal hidden floor area, alter window proportions or introduce a room, doorway, skylight, arch or structural niche. Keep the original direction, character and intensity of daylight. For a windowless or artificially lit source, retain that lighting situation without inventing windows or daylight.

Changed surfaces and furnishings must produce physically plausible local reflections, contact shadows and light bounce. Preserve the source exposure and time of day while allowing those local changes. Do not darken the whole photograph to suggest luxury or introduce an orange colour cast.

EDIT SCOPE: SURFACE AND FITTING RENOVATION

Renew visible wall finishes, floor finishes, cabinetry, countertops, backsplashes, room-appropriate fixtures, movable furniture and decor within the existing layout and service zones. Preserve the structural shell.

Preserving the room does not mean preserving dated cabinet-door profiles, handles, tiled backsplashes, appliance finishes, sanitary fittings or decorative light fixtures. Redesign these authorized elements coherently. Do not merely recolour the old furnishing scheme or apply wood veneer to every existing front.

WHOLE-ROOM RENOVATION, NOT A SINGLE-ELEMENT UPDATE.
Treat every visible, room-appropriate element within this authorized scope as part of one complete redesign, unless the user explicitly asks to retain it. Renew the floor finish on the same plane, wall paint or wall tiles on the same planes, ceiling finish on the same plane wherever present, fitted furniture, existing functional fixtures, movable furniture, textiles, accessories and all visible existing light fixtures as appropriate to the selected room. Do not leave the old floor, wall tiles, fixtures or furniture scheme unchanged while replacing only a vanity, cabinet or decorative accent. Coordinate these renewed elements in the graphite, selective walnut and warm light stone hierarchy; do not make every surface dark or cover every surface in walnut.
SAME ROOM AND SAME VIEWPOINT, ENTIRELY REDESIGNED AUTHORIZED CONTENTS. The default is replacement or a new finish for EVERY visible authorized item, not only items judged old, worn or mismatched. An existing item already compatible with the palette is not a reason to copy it unchanged. Give walls, floors, ceiling finishes where present, fitted storage, equipment, furniture, lamps, textiles and accessories a coherent new specification appropriate to this room. Only architectural geometry, protected structural features, original daylight and explicitly retained items remain unchanged. This is not a decor refresh, an accessories pass or the original room with one new cabinet.
Preserve architectural geometry and functional zones, not the dated appearance of replaceable finishes and equipment. Existing windows, doors, beams, structural mouldings, radiators and fireplace geometry remain protected. Do not hide them behind new finishes or furniture. A new floor material keeps the original floor plane; new wall finishes keep the original wall planes; a replacement bath, shower, sink or appliance keeps its original functional zone and fits the existing space. Replacing an existing item is permitted; adding an extra item or a new service zone is not.
Before finishing, check the entire visible room, not just its focal element: every relevant authorized surface and existing functional element should participate in the new coherent look. Only leave an authorized element visually unchanged when explicitly requested or physically necessary, not by default.

Keep kitchen cabinet footprints, appliance positions, sink and cooking zones, and existing island or peninsula geometry. Keep bathroom functions in their existing zones. Do not add an island, appliance, bathtub, second basin or separate shower to express the premium tier.

Replace all visible existing light fixtures with room-appropriate Modern Exclusive designs: ceiling lights, pendants, wall lamps, task lights, mirror lighting and movable lamps wherever present. Keep fixed mounting points and electrical zones; renew fixture design rather than copying the old lamp. A suitably scaled pendant or coordinated multi-light fixture may use an existing ceiling connection. Concealed lighting and small open display compartments may be integrated into renewed cabinetry within its existing envelope. These are furniture details, not new recesses cut into walls. Do not invent ceiling coves, lowered ceilings or grids of spotlights.

Maintain believable circulation, door swings, usable work surfaces and access to storage, appliances, windows and radiators. Fit the design to the available space.

STYLE AND MATERIAL HIERARCHY

Use a deliberate hierarchy of three complementary materials:

MATTE GRAPHITE AS THE MAIN ARCHITECTURAL CONTRAST.
Use deep, warm graphite or charcoal on the principal fitted furniture volumes where appropriate: kitchen cabinetry, selected storage, vanity units or substantial furniture elements. Specify smooth flat fronts, discreet integrated pulls or narrow shadow-line handles, aligned panels and consistent gaps. Keep the finish matte with subtle, realistic reflected light; it must not look like featureless black plastic.

WALNUT AS A SELECTIVE WARM ACCENT.
Use medium-to-deep brown walnut with natural tonal variation and clearly resolved, appropriately scaled grain. Concentrate it on selected fronts, a peninsula face, an open cabinet compartment, shelving, a table, a headboard or another room-appropriate focal element. Keep grain direction coherent within each component and joints physically believable. Walnut supports and warms the graphite; it must not take over every cabinet, wall and furniture surface.

WARM LIGHT STONE AND SOFT MINERAL NEUTRALS.
Balance the darker elements with warm ivory, champagne, pale beige or soft limestone tones. Use honed or softly satin stone with visible, restrained organic movement, fine mineral variation and believable edges. Stone should have depth and character without dramatic high-contrast veins or repetitive patterns. Keep walls and ceilings predominantly light where their finishes may be renewed, so the room remains open and welcoming.

In kitchens and other cabinetry-led spaces, graphite should clearly lead the fitted composition, with walnut used selectively and light stone balancing the working surfaces. In living rooms and bedrooms, translate the same hierarchy through contrasting furniture and selected fitted elements, balanced by generous light upholstery and textiles. Do not force large dark surfaces into a room that has no suitable element for them.

Avoid an all-walnut scheme, a pale-oak Scandinavian scheme or an entirely beige interior. The defining character is the controlled relationship between graphite, walnut and warm light materials.

FORMS, METALS AND SOFT MATERIALS

Use clean geometric volumes, visually calm surfaces and a few softened or radiused edges. Let precise joinery and thoughtful material transitions provide the premium character.

Use restrained dark bronze, aged brass or brushed warm metal for selected fittings and lighting. These are accents, not a pervasive metallic theme. Coordinated brushed steel is acceptable where function requires it.

Where seating and textiles belong, use inviting cream, oatmeal, taupe or warm brown fabrics with visible weave and believable cushioning. Cognac leather may be used as a small warm accent, such as suitable dining or counter seating; it is not compulsory and must not spread across every room.

Decorative lighting may include compact pendants with finely pierced or textured bronze shades, or another carefully crafted warm-metal design. Keep these as controlled focal details that complement the otherwise clean architecture. Scale and position them for the existing room and mounting points.

LIGHTING AND ATMOSPHERE

Keep natural daylight as the principal source wherever it is present. Supplement it only through plausible renewed fixtures or authorized cabinetry-integrated lighting.

Use concealed, low-glare warm task lighting, approximately 2700–3000 K, beneath suitable cabinets or inside a small display compartment. Let it gently reveal stone texture and timber depth. The light source should be concealed, with a soft falloff rather than a harsh luminous stripe.

Decorative lamps may glow softly without overpowering daylight. Maintain neutral whites, readable graphite surfaces and natural wood colour. Avoid theatrical pools of light, glowing furniture outlines, excessive ceiling lighting and a uniform amber wash.

ROOM-APPROPRIATE APPLICATION

For a kitchen: use predominantly flat matte graphite cabinetry with selective walnut accents. Renew countertops and backsplash as a coordinated warm stone composition with quiet mineral movement and realistically placed joints. Replace dated small decorative backsplash tiles where visible. Renew the visible floor finish and wall finishes coherently as well. Keep the existing sink and cooking positions, using a refined replacement sink and coordinated tap. Replace the existing refrigerator and oven, and other visible existing kitchen appliances, with contemporary equivalents coordinated to the new design; do not merely tint their old doors or preserve dated models. Keep each appliance in its existing position and footprint, with credible door swings, ventilation and usable controls. Use contemporary dark oven glazing and discreet controls, and integrate a replacement refrigerator behind coordinated cabinetry fronts only where physically plausible. Where integration would change the footprint or block ventilation or access, show a contemporary replacement appliance visibly with a coordinated finish instead; do not retain the old appliance as a fallback. Keep open display sections small and within renewed cabinetry. Add suitable stools only at an existing usable seating overhang.

For a bathroom: translate the palette into a refined graphite or walnut-accented vanity, warm light stone or suitable stone-look surfaces, clear shower glazing and coordinated restrained metal fittings. Keep sanitaryware believable and appropriately scaled. Preserve the existing wet zones and functions.

For a living room, dining room or bedroom: combine comfortable light upholstery or bedding with selected graphite furniture, walnut and a restrained warm-stone element. Use practical furniture arrangements and room-appropriate lighting. Keep dark accents balanced by light walls and tactile textiles.

For offices, hallways and utility spaces: express the same palette through functional storage, desks, benches, counters and appropriate lighting. Do not import sofas, decorative rugs or fragile materials into locations where they impair function. Use moisture-, heat-, cleaning- and wear-appropriate finishes throughout.

TIER 3: VISIBLE DESIGN RESOLUTION

Express the premium tier through precise front alignment, consistent reveals, credible worktop thickness, clean corners, controlled stone joints, coherent timber grain and carefully fitted furniture proportions. Coordinate adjoining finishes, fittings and lighting as one design.

Use a small number of relevant, well-chosen objects: a ceramic vessel, a restrained plant, a bowl, books or useful everyday accessories where appropriate. Preserve clear surfaces and purposeful negative space. Do not add clutter, unnecessary furniture, extra installations or oversized features to make the room appear expensive.

PHOTOGRAPHIC FINISH

Render distinct and convincing material behaviour: softly reflective honed stone, absorbent matte fronts, natural timber grain, clear glass, restrained metal highlights and tactile fabric. Include realistic construction edges, joins and contact shadows. Fine detail must come from the materials themselves, not an added noise or grain layer.

Keep the image clean and naturally sharp across the room. Preserve window-frame geometry and glazing divisions. Resolve the existing exterior view within the source exposure without inventing a different or artificially sharpened landscape.

Avoid artificial film grain, dusty haze, synthetic blur, waxy surfaces, plastic sheen, repeated texture stamps, distorted fixtures, floating objects, impossible reflections, exaggerated HDR and sharpening halos. Do not add text, borders, logos, watermarks or interface elements.

REFERENCE AND PRIORITY

This written style definition must work without a separate reference image. If a style reference is supplied, use it for colour relationships, material finishes, furniture forms and detailing only. The original property photograph remains the authority for geometry, openings, viewpoint, outdoor view and daylight.

Camera, architecture, original light situation, permitted renovation scope and physical fit take priority. Within those limits, deliver a visibly complete and coherent warm modern transformation. Translate the material hierarchy to the room’s actual function rather than mechanically repeating a kitchen furnishing list.

Return one finished photorealistic image at the requested supported output size. The premium tier changes design specification and detailing; image resolution is controlled separately.`;

const kitchenStart = MODERN_EXCLUSIVE_TEMPLATE.indexOf("For a kitchen:");
const kitchenEnd = MODERN_EXCLUSIVE_TEMPLATE.indexOf("\n\nFor a bathroom:");

export const MODERN_EXCLUSIVE_ROOM_APPLICATIONS: Readonly<Record<string, string>> = Object.freeze({
  kitchen: MODERN_EXCLUSIVE_TEMPLATE.slice(kitchenStart, kitchenEnd),
  bathroom: "For a bathroom: redesign the entire visible bathroom, not only the basin or vanity. Replace the visible floor finish and wall tiles or wall finishes with a coordinated moisture-suitable warm light stone or stone-look composition, realistic joints and safe non-slip wet-area surfaces. Replace the existing vanity and basin with refined matte graphite cabinetry, selective moisture-suitable walnut accents and a coordinated warm-stone surface. Replace the existing bathtub, shower enclosure or screen, shower fittings, toilet and taps wherever present with contemporary equivalents in the same original functional zones. A replacement bath may have a refined contemporary profile that fits its existing zone; do not preserve a dated bath or shower merely because its location must stay the same. Use clear shower glazing and restrained coordinated bronze or warm-metal fittings. Renew appropriate storage, mirror and decorative fixtures coherently, keeping glazing, sanitaryware and access realistically scaled and ventilation plausible. Preserve the count and functions of the existing toilet, basin, bath and shower; do not add a tub, second basin or separate shower when absent. No kitchen appliances or dry-room upholstered furniture.",
  "living room": "For a living room: combine comfortable substantial cream, oatmeal or taupe seating with selected matte graphite storage or furniture frames, a selective walnut table or shelving detail and a restrained warm-stone coffee-table or side-table element. Keep the main seating arrangement useful and circulation clear, with tailored upholstery, coherent joinery and a few relevant books, ceramics or plants. Balance dark accents with generous light upholstery and light walls. Do not add kitchen cabinetry, appliances, sanitaryware or extra seating beyond the visible space.",
  "dining room": "For a dining room: make a realistically scaled walnut-accented or warm-stone dining table and comfortable light upholstered chairs the functional focus. Use matte graphite on a suitable sideboard, table base or selected storage, with restrained bronze lighting at an existing connection. Keep chair pull-out space and routes to doors clear; use only a few coordinated table objects. No cooking zone, kitchen appliances, living-room sofa or oversized table.",
  bedroom: "For a bedroom: use inviting cream, oatmeal or taupe bedding, a well-proportioned upholstered bed, selected matte graphite wardrobe fronts or bedside furniture and selective walnut on a headboard or bedside detail. A small warm-stone bedside surface may balance the materials. Keep bed access, wardrobe openings and useful storage clear. Use restrained bedside light and calm textile layering rather than a hotel-lobby composition. Do not add kitchen appliances, sanitaryware or excessive seating.",
  "home office": "For a home office: use a practical walnut-accented desk, matte graphite functional storage and a supportive ergonomic chair with a warm light textile or restrained cognac accent where suitable. Warm light mineral surfaces may appear on a small useful desktop or storage detail; avoid fragile or reflective work surfaces. Preserve comfortable working clearances, cabinet access, daylight and screen visibility. Use plausible task light and a few purposeful books or accessories. No sofa, bed, kitchen appliances or decorative clutter.",
  "kids room": "For a kids room: create a welcoming age-appropriate bedroom with comfortable light bedding, safe rounded walnut-accented furniture and matte graphite limited to useful storage or small furniture frames. Keep the room bright; use durable washable surfaces and warm mineral neutrals rather than heavy stone furniture or a dark adult hotel scheme. Fit a bed, play or study area and accessible storage only where space supports them. No fragile stone slabs, sharp metallic furniture, kitchen appliances or additional installations.",
  studio: "For a studio: coordinate compact sleeping, sitting, working and storage functions actually visible or explicitly selected, without inventing separate rooms or hidden floor area. Use light upholstery and bedding, selective walnut furniture and matte graphite on suitable compact storage, with restrained warm mineral surfaces. Preserve existing kitchen and bathroom service zones if visible; do not invent them. Keep convertible furniture, access and circulation physically credible. Do not mechanically fill the studio with a complete furnishing set for every function.",
  "game room": "For a game room: use comfortable appropriately scaled seating, matte graphite media or game storage and selective walnut console or desk accents. Balance the composition with light tactile upholstery and restrained warm mineral surfaces. Preserve existing entertainment functions, screen positions and practical circulation; manage glare without changing daylight or darkening the photograph. No RGB neon scheme, extra arcade installations, kitchen appliances or unnecessary sofas.",
  gym: "For a gym: apply matte graphite to useful equipment frames and storage, selective walnut to a safe bench or storage detail, and warm mineral neutrals to appropriate walls and durable surfaces. Preserve the evident exercise functions with believable equipment spacing and access. Use impact-appropriate non-slip flooring; no fragile stone work surfaces, plush rugs, decorative sofas or extra machines merely to show luxury. Keep the original daylight and plausible task lighting.",
  "laundry room": "For a laundry room: use aligned matte graphite storage fronts, a selective walnut dry-zone accent and a practical warm light stone-look worktop or washable mineral surface. Keep washer, dryer, sink, utility connections and ventilation in their original zones. Renew authorized surfaces and fronts with moisture-, heat- and cleaning-appropriate finishes, clear appliance access and useful folding space. No additional appliances, concealed service room, sofa, rugs or fragile decorative objects.",
  "meeting room": "For a meeting room: use a realistically scaled walnut-accented or warm mineral meeting table, comfortable light upholstered chairs and selected matte graphite storage or furniture bases. Coordinate restrained warm-metal lighting at existing connections, with useful clear surfaces and practical chair spacing. Preserve existing presentation functions and accessible circulation. No oversized boardroom table, extra seats beyond capacity, kitchen appliances or lounge furniture that impairs the meeting function.",
  spa: "For a spa: translate graphite into suitable storage or fixture details, walnut into moisture-suitable dry-area accents and warm light stone into safe washable wet-area surfaces. Preserve the existing relaxation and wet-area functions and service zones; retain pools, baths or saunas only where already supported. Use restrained coordinated metal fittings and discreet plausible lighting without dark theatrical exposure. No new pool, sauna, tub, treatment room, fragile textiles in wet zones or extra installations.",
  outdoor: "For an outdoor space: preserve the building massing, openings, landscape topology, property boundaries, weather and the original view. Translate matte graphite into suitable outdoor furniture or existing storage, selective walnut-toned timber into weather-suitable furniture accents and warm light stone into authorized existing surface finishes. Use durable outdoor fabrics, drainage-appropriate non-slip surfaces and restrained lighting at existing mounting points. Do not extend a deck, create a pool, pergola, outdoor kitchen or new landscaping area, or import indoor cabinetry and fragile textiles.",
  "open plan living": "For open plan living: coordinate the visible living, dining and any existing kitchen areas as one warm modern composition. Use generous light seating and textiles, selective walnut furniture or accents and matte graphite on appropriate storage or existing kitchen fronts, with restrained warm-stone surfaces. Preserve every existing service zone and the original relationship between functions, and keep circulation between them clear. Do not invent a kitchen, island, partition, extra room or hidden dining area. Avoid repeating a full furnishing list in each zone.",
  entryway: "For an entryway: use compact matte graphite functional storage, a selective walnut bench or dry-zone shelf and durable warm light mineral or stone-look surfaces within the existing entrance footprint. Keep the entrance door swing, useful circulation, coat or shoe access and radiator access clear. A restrained mirror may occupy a plausible existing wall without resembling a new opening. Use practical objects and coordinated lighting; no sofa, kitchen appliances, oversized storage or fragile decorative clutter.",
});

/** An explicit per-room checklist prevents the model from renewing only one focal piece. */
export const MODERN_EXCLUSIVE_RENOVATION_INVENTORIES: Readonly<Record<string, string>> = Object.freeze({
  kitchen: "floor finish; wall finishes; cabinet fronts and handles; worktop and backsplash; sink and tap; existing refrigerator, oven and other visible appliances; appropriate existing seating and decorative light fixtures",
  bathroom: "floor finish; wall tiles and other wall finishes; vanity, basin and taps; existing bathtub; existing shower enclosure and shower fittings; existing toilet; suitable storage, mirror and decorative light fixtures",
  "living room": "floor finish; wall finishes; sofa and other existing seating; tables; functional storage; curtains and relevant textiles; decorative light fixtures",
  "dining room": "floor finish; wall finishes; dining table and chairs; suitable sideboard or existing storage; relevant textiles; decorative light fixtures",
  bedroom: "floor finish; wall finishes; bed and headboard; bedding and curtains; bedside furniture; existing wardrobes and useful storage; decorative light fixtures",
  "home office": "floor finish; wall finishes; desk and work surfaces; ergonomic seating; useful storage and shelving; relevant window textiles; decorative and task light fixtures",
  "kids room": "safe durable floor finish; wall finishes; existing bed and bedding; age-appropriate existing play or study furniture; accessible storage; safe textiles and decorative light fixtures",
  studio: "floor finish; wall finishes; visible existing sleeping, sitting and working furniture; functional storage and textiles; existing kitchen finishes and appliances only if present; existing bathroom fixtures only if present; decorative light fixtures",
  "game room": "floor finish; wall finishes; existing game or media furniture and functional storage; appropriate existing seating; relevant textiles and decorative light fixtures",
  gym: "impact-appropriate floor finish; wall finishes; visible existing exercise equipment and useful storage; safe benches and appropriate existing light fixtures",
  "laundry room": "washable floor finish; wall finishes; storage fronts and handles; work surfaces; existing sink and tap; visible existing washer and dryer as equivalent replacements in their existing zones; suitable light fixtures",
  "meeting room": "floor finish; wall finishes; meeting table and chairs; useful storage and existing presentation furniture; relevant textiles and decorative light fixtures",
  spa: "safe wet-area floor finish; wall finishes; existing relaxation furniture and storage; replaceable existing sanitary fixtures and wet-area fittings in their existing zones; suitable light fixtures, without introducing pools, saunas or new functions",
  outdoor: "authorized finish of existing paving or deck on its original footprint; weather-suitable existing outdoor furniture and storage; appropriate existing textiles and light fixtures, without changing landscape topology or building geometry",
  "open plan living": "floor finish; wall finishes; visible sitting and dining furniture; functional storage and textiles; existing kitchen fronts, surfaces, fittings and appliances only where that kitchen already exists; decorative light fixtures",
  entryway: "durable floor finish; wall finishes; existing functional storage; appropriate bench or shelf; practical mirror and decorative light fixtures",
});

export function isModernExclusivePreset(preset: string): boolean {
  return preset.includes("STYLE: Moderne (modern).") && preset.includes("TIER: tier3.");
}

export function buildModernExclusivePrompt(
  preset: string, scope: ImageEditScope, context = "", wishes = "", hasStyleReference = false,
): string {
  const room = preset.match(/^ROOM FUNCTION: ([^.]+)\./)?.[1];
  if (!room || !Object.hasOwn(MODERN_EXCLUSIVE_ROOM_APPLICATIONS, room)) {
    throw new Error("Missing approved Modern Exclusive room application");
  }
  const start = MODERN_EXCLUSIVE_TEMPLATE.indexOf("ROOM-APPROPRIATE APPLICATION");
  const end = MODERN_EXCLUSIVE_TEMPLATE.indexOf("TIER 3: VISIBLE DESIGN RESOLUTION");
  const roomApplication = scope === "furnishing_only"
    ? `SELECTED ROOM FUNCTION: ${room}.\nPreserve all existing fixed finishes, cabinetry, equipment, wet zones and service zones. Apply the graphite/walnut/warm-light-material hierarchy only through movable furnishings, textiles and practical decor appropriate to ${room}. Retain the room's essential function and access. Kitchen, bathroom, laundry, gym, spa and outdoor use require function-, moisture-, heat-, cleaning-, impact- and weather-suitable pieces; do not import sofas, fragile stone furniture or dry-room textiles into inappropriate zones. Do not add new fixed installations, additional appliances, equipment or extra functions.`
    : `SELECTED ROOM FUNCTION: ${room}.\n${MODERN_EXCLUSIVE_ROOM_APPLICATIONS[room]}\n\nWHOLE-ROOM CHECKLIST FOR ${room}: ${MODERN_EXCLUSIVE_RENOVATION_INVENTORIES[room]}. Renew only those items actually present and authorized; do not add missing functions or quantities. Coordinate all of them, rather than changing only one item. Explicit user retain/change wishes remain subject to camera, architecture, original lighting, scope and physical fit.`;
  let prompt = MODERN_EXCLUSIVE_TEMPLATE.slice(0, start)
    + `ROOM-APPROPRIATE APPLICATION\n\n${roomApplication}\n\n`
    + MODERN_EXCLUSIVE_TEMPLATE.slice(end);
  if (scope === "furnishing_only") {
    const scopeStart = prompt.indexOf("EDIT SCOPE:");
    const scopeEnd = prompt.indexOf("STYLE AND MATERIAL HIERARCHY");
    prompt = prompt.slice(0, scopeStart)
      + revision.common.edit_scopes.furnishing_only
      + "\n\nAll fitted-element, finish and integrated-lighting examples below refer only to existing elements, not permission to renew them. Do not replace fixed decorative lighting or install concealed lighting. Use suitable movable lamps where needed.\n\n"
      + prompt.slice(scopeEnd);
    prompt = prompt
      .replace("after a cohesive premium renovation", "after a cohesive premium furnishing update")
      .replace("through redesigned surfaces, fittings and furnishings", "through permitted movable furnishings, textiles and decor")
      .replace("Supplement it only through plausible renewed fixtures or authorized cabinetry-integrated lighting.", "Retain existing fixed lighting; supplement only with suitable movable lamps.")
      .replace("Use concealed, low-glare warm task lighting, approximately 2700–3000 K, beneath suitable cabinets or inside a small display compartment.", "Retain existing concealed task lighting. Suitable movable lamps may use low-glare warm light, approximately 2700–3000 K.");
  }
  const additions = [
    context.trim() ? `OBSERVED SCENE CONTEXT: ${context.trim()}` : "",
    wishes.trim() ? `USER WISHES: ${JSON.stringify(wishes.trim())}\nWithin the camera, architecture, original lighting, selected room function, allowed scope and physical-fit constraints, explicit retain/change wishes take priority over material and furniture examples.` : "",
    hasStyleReference
      ? "STYLE REFERENCE: A separate style-reference image is supplied; use its style, not its geometry."
      : "STYLE REFERENCE: No separate style reference is supplied; use the written style definition.",
  ].filter(Boolean).join("\n\n");
  return prompt.replace("\n\nREFERENCE AND PRIORITY", `\n\n${additions}\n\nREFERENCE AND PRIORITY`);
}
