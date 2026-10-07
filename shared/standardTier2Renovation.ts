/** Approved tier-2 renovation revision. STYLE paragraphs remain byte-identical. */
type RoomProfile = { inventory: string; detail: string; scandinavian: string; modern: string };

export const STANDARD_TIER2_REVISION = {
  rules: "Preserve the original camera, framing, room dimensions, structural shell, windows, doors, ceiling height and daylight. Keep existing functions, fixture counts, footprints and service zones. Do not add fixtures, enlarge the room, create niches or change the layout. Retain built-in versus freestanding configurations where changing them would require a different footprint. Replace lighting only at existing mounting points. All common geometry, lighting, access and photographic-quality rules remain in force.",
  tier: "Standard specification: create a fully renewed, attractive selected room using well-designed everyday materials and coordinated standard fittings. Make the upgrade visible through new surface finishes, renewed appropriate furniture and fittings, and a coherent finished appearance; accessories alone are insufficient. Prioritize balanced colours, useful storage, neat installation and practical forms. Use quality veneer or appropriate painted/matte fronts, practical porcelain or ceramic where functionally suitable, and durable woven fabrics only where the room supports them. Reserve elaborate custom joinery, expressive natural-stone slabs, sculptural stone forms and extensive integrated lighting for a more luxurious specification. Maintain the same high photographic quality as every other tier.",
  bathroom: {
    scope: "EDIT SCOPE: SURFACE AND FITTING RENOVATION VISUALIZATION (renovation_visualization). Renew the bathroom's visible wall and floor finishes, vanity, basin, mirror, tapware, shower enclosure and existing bath/toilet appearance as one coordinated renovation. Replace dated finishes and fittings throughout the visible bathroom rather than limiting the update to accessories. Preserve the original camera, framing, room dimensions, structural shell, windows, doors, ceiling height and daylight. Keep the original basin, toilet, bath and shower functions in their existing positions and service zones. Do not add fixtures, enlarge the room, create niches or change the layout. Retain built-in versus freestanding configurations where changing them would require a different footprint. Replace lighting only at existing mounting points. All common geometry, lighting, access and photographic-quality rules remain in force.",
    tier: "TIER: tier2. Standard specification: create a fully renewed, attractive bathroom using well-designed everyday materials and coordinated standard fittings. Make the upgrade visible through fresh wall and floor finishes, a new vanity and basin, updated mirror, clear shower glazing and matching tapware. Use good moisture-resistant cabinetry, convincing wood-look or matte fronts, porcelain or ceramic tiles and straightforward white sanitaryware. Prioritize balanced colours, useful storage, neat installation and a cohesive finished appearance. Keep forms simple and practical. Reserve elaborate custom joinery, expressive natural-stone slabs, sculptural stone baths, recessed display niches and extensive integrated lighting for a more luxurious specification. Maintain the same high photographic quality as every other tier.",
    detail: "ROOM-SPECIFIC TIER DETAIL: Where renovation is allowed, replace outdated tile patterns and dated cabinet or fixture styling with a coordinated contemporary scheme. Use standard-format tiles with visible, neatly aligned grout joints, a simple well-proportioned vanity, a practical white basin, a coordinated mirror and an uncomplicated clear-glass shower enclosure within the existing shower footprint. Where a bath is present, use a simple white bath with a clean, coordinated surround appropriate to its existing configuration. Complete the design with matching fittings, fresh towels and a small number of useful accessories; decoration must complement the renovation rather than substitute for it.",
    scandinavian: {
      visible: "VISIBLE STYLE-SPECIFIC SPECIFICATION: Use light natural-oak grain on a simple moisture-suitable vanity, warm-white ceramic, pale sand or gentle warm-grey porcelain tiles and restrained chrome or brushed-steel fittings. Choose clean fronts, softly rounded details and a simple round or softly rectangular mirror. Add cotton towels and one or two useful ceramic accessories. Keep the overall impression light, fresh, warm and unmistakably Scandinavian.",
      applied: "STYLE APPLIED TO THIS ROOM: When renovation is permitted, visibly renew the bathroom with a light-oak-look vanity, a practical white basin, warm off-white wall tiles and a slightly deeper pale-sand or warm-grey tiled floor. Use subtle surface variation and neat visible grout joints rather than dramatic veining. Update existing shower glazing and tapware in a coordinated simple finish. Use a modest light at an existing mounting point. Create a complete, welcoming everyday bathroom with a clear contrast between light wood, white sanitaryware and softly toned tiles.",
    },
    modern: {
      visible: "VISIBLE STYLE-SPECIFIC SPECIFICATION: Use smooth matte warm-greige or medium warm-grey vanity fronts, a restrained walnut-toned detail where suitable, warm stone-look porcelain and a practical white basin. Keep fronts flat, handles discreet and edges precise. Coordinate brushed-steel or matte-black fittings with a simple mirror frame. Use controlled light-dark contrast and clean geometric forms while keeping the room warm and comfortable.",
      applied: "STYLE APPLIED TO THIS ROOM: When renovation is allowed, visibly renew the bathroom with a simple contemporary flat-front vanity, coordinated warm stone-look porcelain wall and floor tiles, clear shower glazing and updated fittings in one consistent finish. Use a slightly deeper floor tone and selected darker details to give the room definition. Choose a clean rectangular or softly rounded mirror and a modest light at an existing mounting point. Keep tile joints visible and orderly. Deliver a cohesive modern renovation through renewed finishes and fittings, with straightforward materials and detailing rather than a luxurious spa treatment.",
    },
  },
  rooms: {
    "living room": {
      inventory: "wall and floor finishes, ceiling surface where present, existing fitted storage, seating, tables, media furniture and existing lights",
      detail: "Use durable everyday flooring, fresh wall finishes, well-made fabric seating, practical tables and coordinated standard storage. Replace dated movable furniture as a set. Preserve fireplace geometry, radiator access and existing service positions.",
      scandinavian: "Light-oak-look flooring and useful furniture, warm off-white walls, oatmeal or gentle warm-grey fabric seating, cotton/linen curtains and a restrained woven rug.",
      modern: "Quiet warm-greige walls, practical warm wood flooring, flat-front media storage in matte warm-grey with a restrained walnut detail, cream or taupe seating and selected matte-black accents.",
    },
    bedroom: {
      inventory: "wall and floor finishes, ceiling surface, existing wardrobes, bed and headboard, bedside furniture and existing lights",
      detail: "Use practical refreshed flooring, coordinated standard wardrobes within their existing footprint, a comfortable bed, simple headboard and useful bedside storage. Preserve wardrobe access and the selected bedroom function.",
      scandinavian: "Warm off-white walls, light-oak-look floors and bedside furniture, a simple light-wood or oatmeal fabric headboard, cotton bed linen and gentle sand accents.",
      modern: "Warm-greige walls, a clean taupe upholstered headboard, flat matte wardrobe fronts, restrained walnut-toned bedside details and controlled darker accents.",
    },
    kitchen: {
      inventory: "wall and floor finishes, existing cabinet fronts and units, worktops, backsplash, sink, tap, existing appliances and lights",
      detail: "Renew coordinated standard cabinet fronts, practical laminate or restrained porcelain worktops, ceramic backsplash and existing sink, tap and appliances with contemporary equivalents. Preserve the cabinet footprint, cooking/sink/appliance positions and any existing island or peninsula; do not add an island.",
      scandinavian: "Simple light-oak-look or warm-white fronts, pale quiet worktops, warm-white ceramic backsplash, practical pale flooring and restrained chrome or brushed-steel fittings.",
      modern: "Smooth warm-greige or medium warm-grey fronts, a restrained walnut detail, warm stone-look porcelain or practical quiet worktops, darker floor contrast and coordinated brushed-steel or matte-black fittings.",
    },
    "dining room": {
      inventory: "wall and floor finishes, ceiling surface, dining table and chairs, existing storage and lights",
      detail: "Use practical renewed floors, coordinated walls, a well-proportioned standard dining table, comfortable chairs and useful storage. Maintain passages and seating clearances; do not invent an additional dining zone.",
      scandinavian: "Light-oak table and chairs, softly toned walls, pale wood-look flooring, simple cotton upholstery where appropriate and a softly shaded existing pendant.",
      modern: "A clean warm-wood table, cream or taupe upholstered chairs, matte warm-grey storage and restrained darker details against warm neutral surfaces.",
    },
    "home office": {
      inventory: "wall and floor finishes, ceiling surface, desk, task chair, existing storage and lights",
      detail: "Renew a practical desk and ergonomic task chair, coordinated standard shelving/storage and durable finishes. Preserve comfortable working clearances, power/service zones and window access; do not add living-room furniture.",
      scandinavian: "Light-oak desk and shelves, warm off-white walls, pale practical flooring, gentle warm-grey task-chair fabric and a modest task light.",
      modern: "A clean flat-front desk and storage in warm-grey with a walnut-toned work surface, taupe task-chair fabric and controlled matte-black details.",
    },
    "kids room": {
      inventory: "wall and floor finishes, ceiling surface, existing bed, age-appropriate furniture, storage and lights",
      detail: "Renew durable easy-clean finishes, a simple safe bed and practical standard storage with rounded edges. Preserve existing sleeping and play functions, usable floor area and clear access; do not add unsafe climbing structures.",
      scandinavian: "Light-oak-look furniture, warm off-white walls, gentle muted sage or dusty-blue accents, washable cotton textiles and simple rounded details.",
      modern: "Matte warm-greige standard storage, restrained warm-wood details, clean rounded forms and washable cream/taupe textiles with modest colour accents.",
    },
    studio: {
      inventory: "wall and floor finishes, ceiling surface, furniture and existing fitted elements within the visible sleeping, sitting and kitchenette functions",
      detail: "Renew every visible existing functional zone with coordinated standard compact furniture and finishes. Keep the observed sleeping/seating arrangement and kitchenette service footprint; do not invent a kitchenette, divide the space or add unseen functions.",
      scandinavian: "Light-oak-look compact furniture, warm-white surfaces, light cotton fabrics and pale practical flooring across the existing functions.",
      modern: "Continuous matte warm-greige fronts, selective walnut-toned compact furniture, cream/taupe textiles and restrained dark details across existing zones.",
    },
    "game room": {
      inventory: "wall and floor finishes, ceiling surface, existing gaming desk or table, seating, equipment appearance, storage and lights",
      detail: "Renew practical durable finishes, standard gaming furniture, comfortable seating and useful storage. Preserve the observed game functions and equipment zones; do not add absent game tables or extensive RGB/integrated lighting.",
      scandinavian: "Light-oak-look gaming furniture, warm off-white walls, gentle warm-grey seating and restrained useful accessories.",
      modern: "Flat-front warm-grey storage, restrained walnut details, comfortable taupe seating and selected dark equipment accents without neon or a luxury entertainment build-out.",
    },
    gym: {
      inventory: "wall and impact-appropriate floor finishes, ceiling surface, existing exercise equipment appearance, mirrors where present, storage and lights",
      detail: "Renew durable easy-clean walls, suitable non-slip impact-appropriate flooring and contemporary equivalents of the existing visible equipment. Keep equipment counts and safe exercise clearances; no living-room rugs or upholstered sofas.",
      scandinavian: "Warm-white walls, pale warm-grey exercise flooring, simple light-wood-look dry-zone storage and restrained practical accessories.",
      modern: "Warm-grey durable surfaces, controlled graphite equipment accents, simple matte storage and precise geometric details.",
    },
    "laundry room": {
      inventory: "wall and floor finishes, existing utility cabinets, counters, existing sink and tap, laundry appliances and lights",
      detail: "Renew moisture-resistant standard cabinets, practical counters, ceramic or porcelain flooring and existing laundry appliances with contemporary equivalents. Preserve appliance count, ventilation and plumbing zones; do not add a sink if absent.",
      scandinavian: "Warm-white or light-oak-look moisture-suitable fronts, pale practical counters, softly toned tiles and restrained steel fittings.",
      modern: "Smooth matte warm-greige cabinets, warm stone-look practical counters/flooring and restrained steel or matte-black fittings.",
    },
    "meeting room": {
      inventory: "wall and floor finishes, ceiling surface, existing meeting table, chairs, storage, presentation equipment appearance and lights",
      detail: "Renew practical coordinated standard meeting furniture, appropriate easy-clean flooring and calm wall finishes. Preserve the meeting function, equipment zones, exits and usable seated circulation.",
      scandinavian: "A light-oak meeting table, warm-white walls, gentle warm-grey fabric chairs and simple light storage.",
      modern: "A clean walnut-toned meeting table, warm-greige walls, matte storage, comfortable taupe chairs and selected darker details without an all-chrome office look.",
    },
    spa: {
      inventory: "wall and wet-appropriate floor finishes, existing spa fittings, existing treatment furniture, storage and lights",
      detail: "Renew only observed spa functions using standard moisture-suitable finishes and fittings. Keep wet/dry zones and existing fixture counts; do not invent a sauna, pool, shower or bath or imply engineering feasibility.",
      scandinavian: "Warm-white and pale-sand ceramic/porcelain, moisture-suitable light-oak-look dry-zone storage and simple cotton textiles only where appropriate.",
      modern: "Warm stone-look porcelain, smooth matte warm-grey storage, practical white existing sanitaryware and restrained dark fitting accents rather than a luxurious spa treatment.",
    },
    outdoor: {
      inventory: "visible existing terrace/deck/paving and nonstructural surface finishes, existing outdoor furniture, planters and existing lights",
      detail: "Renew existing surface finishes and practical weather-suitable furniture. Preserve building geometry, existing paving/deck footprint, landscape layout, vegetation, boundaries and weather. Do not add walls, pergolas, terraces or a pool.",
      scandinavian: "Light natural-looking weather-suitable timber or timber-look furniture, soft warm-grey practical paving and washable neutral outdoor textiles.",
      modern: "Clean geometric weather-suitable furniture, warm-grey existing paving finishes, restrained warm-wood accents and selected matte-dark details.",
    },
    "open plan living": {
      inventory: "wall and floor finishes, ceiling surface, existing living and dining furniture, existing kitchen fittings where visible, storage and lights",
      detail: "Renew each visibly existing zone coherently with practical coordinated standard furniture and fittings. Preserve the original open-plan geometry, observed functions and kitchen service footprint. Do not invent a kitchen, extra dining zone, island or partition.",
      scandinavian: "Coherent light-oak-look furniture and floors, warm-white walls, oatmeal seating, simple light dining furniture and pale practical kitchen fronts only where already present.",
      modern: "Coherent warm-greige surfaces, restrained walnut-toned furniture, cream/taupe seating and matte storage or kitchen fronts within existing visible zones.",
    },
    entryway: {
      inventory: "wall and durable floor finishes, ceiling surface, existing fitted storage, appropriate entry furniture, mirrors where present and lights",
      detail: "Renew durable easy-clean flooring, practical standard coat/shoe storage and proportionate entry furniture. Keep door swings, passages, stairs and radiator access clear; do not invent stairs or cut storage niches.",
      scandinavian: "Light-oak-look practical storage, warm-white walls, pale durable flooring and simple rounded dry-zone furniture.",
      modern: "Flat-front matte warm-greige storage, warm stone-look durable flooring, restrained walnut-toned details and controlled dark accents.",
    },
  } satisfies Record<string, RoomProfile>,
};

export function tier2RenovationProfile(preset: string) {
  const room = /^ROOM FUNCTION: ([^.]+)\./.exec(preset)?.[1];
  const style = /STYLE: (?:Skandinavisk|Moderne) \((scandinavian|modern)\)\./.exec(preset)?.[1] as "scandinavian" | "modern" | undefined;
  if (!room || !style || !preset.includes("TIER: tier2.")) return null;
  if (room !== "bathroom" && !Object.prototype.hasOwnProperty.call(STANDARD_TIER2_REVISION.rooms, room)) throw new Error(`Missing tier2 room profile: ${room}`);
  return { room, style };
}

export function tier2RenovationScope(preset: string): string {
  const profile = tier2RenovationProfile(preset);
  if (!profile) return "";
  if (profile.room === "bathroom") return STANDARD_TIER2_REVISION.bathroom.scope;
  const room = STANDARD_TIER2_REVISION.rooms[profile.room as keyof typeof STANDARD_TIER2_REVISION.rooms];
  return `EDIT SCOPE: SURFACE AND FITTING RENOVATION VISUALIZATION (renovation_visualization). Renew the entire visible ${profile.room}: ${room.inventory}, as one coordinated simple renovation, not an accessory-only update. ${STANDARD_TIER2_REVISION.rules} ${room.detail}`;
}

function replaceSection(preset: string, heading: string, next: string, replacement: string) {
  const start = preset.indexOf(heading);
  const end = preset.indexOf(next, start);
  if (start < 0 || end < 0) throw new Error(`Invalid tier2 section: ${heading}`);
  return preset.slice(0, start) + replacement + "\n\n" + preset.slice(end);
}

export function revisedTier2Preset(preset: string): string {
  const profile = tier2RenovationProfile(preset);
  if (!profile) return preset;
  const bath = STANDARD_TIER2_REVISION.bathroom;
  const room = profile.room === "bathroom" ? null : STANDARD_TIER2_REVISION.rooms[profile.room as keyof typeof STANDARD_TIER2_REVISION.rooms];
  const visible = room
    ? `VISIBLE STYLE-SPECIFIC SPECIFICATION: ${room[profile.style]} Use well-designed everyday materials, simple coordinated standard fittings and modest lighting only at existing mounting points.`
    : bath[profile.style].visible;
  const applied = room
    ? `STYLE APPLIED TO THIS ROOM: When renovation is permitted, visibly renew the entire ${profile.room}: ${room.inventory}. ${room[profile.style]} ${room.detail} Deliver a complete everyday renovation with straightforward materials and detailing, not an exclusive custom build-out.`
    : bath[profile.style].applied;
  let result = replaceSection(preset, "TIER: tier2.", "VISIBLE STYLE-SPECIFIC SPECIFICATION:",
    room ? `TIER: tier2. ${STANDARD_TIER2_REVISION.tier} Selected room: ${profile.room}.` : bath.tier);
  result = replaceSection(result, "VISIBLE STYLE-SPECIFIC SPECIFICATION:", "ROOM-SPECIFIC TIER DETAIL:", visible);
  result = replaceSection(result, "ROOM-SPECIFIC TIER DETAIL:", "STYLE APPLIED TO THIS ROOM:",
    room ? `ROOM-SPECIFIC TIER DETAIL: ${room.detail} Complete the design with a few useful room-appropriate accessories; decoration must complement the renovation rather than substitute for it.` : bath.detail);
  return replaceSection(result, "STYLE APPLIED TO THIS ROOM:", "Apply fixed-finish", applied);
}
