export type BudgetTier = "budget" | "standard" | "luxury";

export interface TierConfig {
  prompt: string;
  description: string;
  exampleRetailers: string[];
}

export type StyleVocabulary = Record<string, Record<BudgetTier, TierConfig>>;

export const styleVocabulary: StyleVocabulary = {
  scandinavian: {
    budget: {
      prompt: "Complete Scandinavian transformation. REMOVE dark heavy furniture. ADD light oak pieces, white walls, natural textiles, minimalist decor, hygge elements, large windows feel. Dramatic bright and airy makeover. Simple affordable pieces, basic natural materials, clean functional layout",
      description: "Enkel og funktionel indretning med hvide møbler og naturlige materialer",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "Complete Scandinavian transformation. REMOVE dark heavy furniture. ADD light oak pieces, white walls, natural textiles, minimalist decor, hygge elements, large windows feel. Dramatic bright and airy makeover. Quality designer lamps, warm neutral palette, tactile materials, curated Nordic details",
      description: "Kvalitetsindretning med nordisk design og gode materialer",
      exampleRetailers: ["Ilva", "Hay", "Fritz Hansen"],
    },
    luxury: {
      prompt: "Complete Scandinavian transformation. REMOVE dark heavy furniture. ADD exclusive designer pieces in premium solid oak, white walls, artisan textiles, statement lighting, bespoke details, gallery-quality art, hygge elements. Dramatic bright and airy luxury makeover",
      description: "Eksklusiv indretning med designer-møbler og luksus-materialer",
      exampleRetailers: ["Bolia", "&Tradition", "Louis Poulsen"],
    },
  },
  modern: {
    budget: {
      prompt: "Full modern renovation. REPLACE traditional furniture with sleek contemporary pieces. ADD clean lines, neutral palette, geometric shapes, minimalist art, polished surfaces. Sharp sophisticated update. Simple geometric modern furniture, minimal accessories",
      description: "Moderne og minimalistisk med fokus på funktion",
      exampleRetailers: ["IKEA", "IDEmøbler"],
    },
    standard: {
      prompt: "Full modern renovation. REPLACE traditional furniture with sleek contemporary pieces. ADD clean lines, neutral palette, geometric shapes, minimalist art, polished surfaces. Sharp sophisticated update. Bold-shaped premium pieces, ambient lighting, refined color palette, architectural details",
      description: "Moderne design med kant og karakter",
      exampleRetailers: ["BoConcept", "Montana"],
    },
    luxury: {
      prompt: "Full modern renovation. REPLACE traditional furniture with sleek contemporary pieces. ADD clean lines, neutral palette, geometric shapes, minimalist art, polished surfaces. Sharp sophisticated update. Iconic designer pieces, marble accents, sophisticated lighting, curated art, premium metals, bespoke furniture",
      description: "High-end moderne indretning med ikoniske møbler",
      exampleRetailers: ["Minotti", "B&B Italia"],
    },
  },
  luxury: {
    budget: {
      prompt: "Full luxury estate transformation. REPLACE standard pieces with high-end designer furniture. ADD marble surfaces, velvet upholstery, gold accents, crystal lighting, bespoke elements. Opulent and exclusive. Elegant classic shapes, plush textiles, warm lighting",
      description: "Elegant stil med luksusfølelse til fornuftig pris",
      exampleRetailers: ["ILVA", "IDEmøbler"],
    },
    standard: {
      prompt: "Full luxury estate transformation. REPLACE standard pieces with high-end designer furniture. ADD marble surfaces, velvet upholstery, gold accents, crystal lighting, bespoke elements. Opulent and exclusive. Rich fabrics, deep colors, tailored furniture, sophisticated atmosphere",
      description: "Sofistikeret luksusindretning med rige materialer",
      exampleRetailers: ["BoConcept", "Bolia"],
    },
    luxury: {
      prompt: "Full luxury estate transformation. REMOVE all existing furniture. REPLACE with ultra high-end bespoke designer pieces. ADD rare marble surfaces, crystal chandeliers, silk textiles, gold accents, museum-quality art, velvet upholstery. Opulent, extravagant, palatial atmosphere",
      description: "Ultimativ luksus med skræddersyede møbler og sjældne materialer",
      exampleRetailers: ["Paustian", "Poltrona Frau", "Fendi Casa"],
    },
  },
  industrial: {
    budget: {
      prompt: "Total industrial warehouse conversion. REMOVE soft furnishings. ADD exposed brick, raw metal shelving, leather Chesterfield sofa, Edison bulb fixtures, concrete floors, vintage factory elements. Dramatic urban loft feel. Utilitarian furniture, pendant lights",
      description: "Rå og urban stil med basale industrielle elementer",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "Total industrial warehouse conversion. REMOVE soft furnishings. ADD exposed brick, raw metal shelving, leather Chesterfield sofa, Edison bulb fixtures, concrete floors, vintage factory elements. Dramatic urban loft feel. Premium reclaimed wood, quality metal fixtures, authentic materials",
      description: "Autentisk industriel stil med genbrugsmaterialer og kvalitet",
      exampleRetailers: ["House Doctor", "Muubs"],
    },
    luxury: {
      prompt: "Total industrial warehouse conversion. REMOVE all existing furniture. ADD exposed brick, custom steel and glass structures, premium reclaimed materials, designer industrial lighting, artisan metalwork, curated vintage pieces, leather Chesterfield sofa, concrete floors. Dramatic luxury urban loft feel",
      description: "Eksklusiv industriel stil med skræddersyede elementer",
      exampleRetailers: ["Norr11", "&Tradition", "Menu"],
    },
  },
  coastal: {
    budget: {
      prompt: "Complete beach house makeover. REPLACE dark wood with whitewashed pieces. ADD nautical stripes, sea grass rugs, driftwood decor, blue accents, airy linens. Relaxed coastal atmosphere. Simple wicker furniture, light blue and white palette",
      description: "Frisk kyststil med lyse farver og naturlige materialer",
      exampleRetailers: ["JYSK", "Søstrene Grene"],
    },
    standard: {
      prompt: "Complete beach house makeover. REPLACE dark wood with whitewashed pieces. ADD nautical stripes, sea grass rugs, driftwood decor, blue accents, airy linens. Relaxed coastal atmosphere. Quality rattan furniture, linen textiles, ocean-inspired palette, refined maritime decor",
      description: "Raffineret kyststil med kvalitetsmøbler og naturlige tekstiler",
      exampleRetailers: ["Ilva", "Bolia"],
    },
    luxury: {
      prompt: "Complete beach house makeover. REPLACE all furniture with designer outdoor-indoor pieces in whitewashed wood. ADD nautical stripes, sea grass rugs, driftwood decor, blue accents, premium natural materials, curated coral and shell art, high-end linen, bespoke driftwood furniture. Luxurious relaxed coastal atmosphere",
      description: "Eksklusiv kyststil med designer-møbler og unikke naturlige elementer",
      exampleRetailers: ["Paustian", "Tine K Home"],
    },
  },
  transitional: {
    budget: {
      prompt: "Blend traditional and contemporary. REPLACE ornate pieces with transitional furniture. ADD neutral palette, mixed metals, classic shapes with modern finishes, timeless elegance. Simple upholstered furniture, clean traditional details",
      description: "Klassisk møder moderne til en overkommelig pris",
      exampleRetailers: ["IKEA", "IDEmøbler"],
    },
    standard: {
      prompt: "Blend traditional and contemporary. REPLACE ornate pieces with transitional furniture. ADD neutral palette, mixed metals, classic shapes with modern finishes, timeless elegance. Quality upholstery, warm neutrals, elegant lighting, balanced proportions",
      description: "Elegant blanding af klassisk og moderne med kvalitetsmøbler",
      exampleRetailers: ["Ilva", "BoConcept"],
    },
    luxury: {
      prompt: "Blend traditional and contemporary. REPLACE all furniture with custom upholstered transitional pieces. ADD neutral palette, mixed metals, classic shapes with luxurious modern finishes, timeless elegance. Premium fabrics, designer lighting, curated antique accents, bespoke millwork",
      description: "Sofistikeret overgangsdesign med skræddersyede møbler og fine detaljer",
      exampleRetailers: ["Paustian", "Eilersen"],
    },
  },
  farmhouse: {
    budget: {
      prompt: "Total farmhouse renovation. REPLACE modern furniture with rustic wood pieces. ADD distressed finishes, vintage accessories, cozy quilts, wrought iron, reclaimed elements. Warm country charm. White painted furniture, gingham textiles",
      description: "Rustik og hyggelig landstil til fornuftig pris",
      exampleRetailers: ["JYSK", "Søstrene Grene"],
    },
    standard: {
      prompt: "Total farmhouse renovation. REPLACE modern furniture with rustic wood pieces. ADD distressed finishes, vintage accessories, cozy quilts, wrought iron, reclaimed elements. Warm country charm. Handmade ceramics, linen textiles, vintage-inspired fixtures",
      description: "Autentisk landstil med genbrugte materialer og håndværk",
      exampleRetailers: ["Ilva", "House Doctor"],
    },
    luxury: {
      prompt: "Total farmhouse renovation. REPLACE all furniture with artisan reclaimed timber pieces. ADD distressed finishes, vintage accessories, cozy quilts, wrought iron, reclaimed elements. Warm country charm. Bespoke pottery, premium linen, designer rustic lighting, curated antiques",
      description: "Eksklusiv landstil med kunsthåndværk og antikke fund",
      exampleRetailers: ["Tine K Home", "&Tradition"],
    },
  },
  midcentury: {
    budget: {
      prompt: "Complete 1950s-60s makeover. REPLACE with iconic teak furniture, curved silhouettes, sputnik chandelier, walnut sideboards, retro patterns, warm wood tones. Authentic vintage revival. Tapered wooden legs, vintage-inspired colors, functional clean design",
      description: "Retro 50'er/60'er stil med enkle træmøbler og tidløse former",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "Complete 1950s-60s makeover. REPLACE with iconic teak furniture, curved silhouettes, sputnik chandelier, walnut sideboards, retro patterns, warm wood tones. Authentic vintage revival. Authentic teak and walnut pieces, iconic designer chairs, organic curved forms, statement lighting",
      description: "Autentisk midcentury med kvalitetsmøbler i teak og valnød",
      exampleRetailers: ["Ilva", "BoConcept", "House Doctor"],
    },
    luxury: {
      prompt: "Complete 1950s-60s makeover. REMOVE all existing furniture. REPLACE with original designer pieces. ADD premium solid walnut and rosewood, Eames and Wegner chairs, sculptural sputnik chandeliers, curated vintage art, bespoke cabinetry, iconic teak sideboards. Gallery-quality authentic vintage revival",
      description: "Eksklusiv midcentury med originale designklassikere og ædle træsorter",
      exampleRetailers: ["&Tradition", "Carl Hansen & Søn", "Fritz Hansen"],
    },
  },
};
