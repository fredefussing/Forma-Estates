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
      prompt: "Transform this room into a Scandinavian interior design style. Replace furniture with light wood pieces, add hygge elements, neutral colors, natural light, minimalist decor. Simple white furniture, basic natural materials, clean lines, functional layout",
      description: "Enkel og funktionel indretning med hvide møbler og naturlige materialer",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "Transform this room into a Scandinavian interior design style. Replace furniture with quality oak pieces, add soft textiles, designer lamps, warm neutral palette, tactile materials, curated decor. Premium Nordic design with crafted details",
      description: "Kvalitetsindretning med nordisk design og gode materialer",
      exampleRetailers: ["Ilva", "Hay", "Fritz Hansen"],
    },
    luxury: {
      prompt: "Transform this room into a Scandinavian interior design style. Replace furniture with exclusive designer pieces in premium solid oak. Add artisan textiles, statement lighting, bespoke details, gallery-quality art. Luxurious Nordic elegance",
      description: "Eksklusiv indretning med designer-møbler og luksus-materialer",
      exampleRetailers: ["Bolia", "&Tradition", "Louis Poulsen"],
    },
  },
  modern: {
    budget: {
      prompt: "Transform this room into a Modern interior design style. Clean lines, functional furniture, monochrome palette, sleek surfaces, contemporary pieces. Replace old furniture with simple geometric modern furniture, minimal accessories",
      description: "Moderne og minimalistisk med fokus på funktion",
      exampleRetailers: ["IKEA", "IDEmøbler"],
    },
    standard: {
      prompt: "Transform this room into a Modern interior design style. Clean lines, functional furniture, monochrome palette, sleek surfaces, contemporary pieces. REPLACE furniture with bold-shaped premium pieces, ambient lighting, refined color palette, architectural details",
      description: "Moderne design med kant og karakter",
      exampleRetailers: ["BoConcept", "Montana"],
    },
    luxury: {
      prompt: "Transform this room into a Modern interior design style. Clean lines, functional furniture, monochrome palette, sleek surfaces. REPLACE all furniture with iconic designer pieces, add marble accents, sophisticated lighting, curated art, premium metals, bespoke furniture",
      description: "High-end moderne indretning med ikoniske møbler",
      exampleRetailers: ["Minotti", "B&B Italia"],
    },
  },
  luxury: {
    budget: {
      prompt: "Complete luxury makeover. REPLACE standard furniture with high-end designer pieces. ADD marble surfaces, velvet upholstery, gold accents, crystal chandeliers, rich textures. Elegant style with classic shapes, gold-tone accents, plush textiles, warm lighting. Opulent sophisticated elegance",
      description: "Elegant stil med luksusfølelse til fornuftig pris",
      exampleRetailers: ["ILVA", "IDEmøbler"],
    },
    standard: {
      prompt: "Complete luxury makeover. REPLACE standard furniture with high-end designer pieces. ADD marble surfaces, velvet upholstery, gold accents, crystal chandeliers, bespoke furniture, rich textures. Premium luxury with rich fabrics, marble details, crystal lighting, deep colors, tailored furniture. Opulent sophisticated elegance",
      description: "Sofistikeret luksusindretning med rige materialer",
      exampleRetailers: ["BoConcept", "Bolia"],
    },
    luxury: {
      prompt: "Complete luxury makeover. REMOVE all existing furniture. REPLACE with ultra high-end bespoke designer pieces. ADD rare marble surfaces, crystal chandeliers, silk textiles, gold accents, museum-quality art, velvet upholstery. Opulent, extravagant, palatial atmosphere",
      description: "Ultimativ luksus med skræddersyede møbler og sjældne materialer",
      exampleRetailers: ["Paustian", "Poltrona Frau", "Fendi Casa"],
    },
  },
  industrial: {
    budget: {
      prompt: "Complete industrial loft transformation. REMOVE existing soft furniture. ADD raw metal shelving, exposed brick walls, leather sofas, Edison bulb lighting, concrete floors, vintage factory elements. Dramatic urban warehouse feel with utilitarian furniture and pendant lights",
      description: "Rå og urban stil med basale industrielle elementer",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "Complete industrial loft transformation. REMOVE existing soft furniture. ADD raw metal shelving, exposed brick walls, leather sofas, Edison bulb lighting, concrete floors, vintage factory elements. Premium reclaimed wood furniture, quality metal fixtures, authentic materials. Dramatic urban warehouse feel",
      description: "Autentisk industriel stil med genbrugsmaterialer og kvalitet",
      exampleRetailers: ["House Doctor", "Muubs"],
    },
    luxury: {
      prompt: "Complete industrial loft transformation. REMOVE all existing furniture. ADD custom steel and glass structures, exposed brick walls, premium reclaimed materials, designer industrial lighting, artisan metalwork, curated vintage pieces, leather chesterfield sofas, concrete floors. Dramatic luxury warehouse atmosphere",
      description: "Eksklusiv industriel stil med skræddersyede elementer",
      exampleRetailers: ["Norr11", "&Tradition", "Menu"],
    },
  },
  coastal: {
    budget: {
      prompt: "Transform to coastal beach house. REPLACE dark furniture with whitewashed wood. ADD nautical elements, sea grass rugs, blue accents, natural fibers, driftwood decor, airy curtains. Light blue and white palette, simple wicker furniture. Relaxed seaside atmosphere",
      description: "Frisk kyststil med lyse farver og naturlige materialer",
      exampleRetailers: ["JYSK", "Søstrene Grene"],
    },
    standard: {
      prompt: "Transform to coastal beach house. REPLACE dark furniture with whitewashed wood. ADD nautical elements, sea grass rugs, blue accents, natural fibers, driftwood decor, airy curtains. Quality rattan furniture, linen textiles, ocean-inspired palette, refined maritime decor. Relaxed seaside atmosphere",
      description: "Raffineret kyststil med kvalitetsmøbler og naturlige tekstiler",
      exampleRetailers: ["Ilva", "Bolia"],
    },
    luxury: {
      prompt: "Transform to coastal beach house. REPLACE all furniture with designer outdoor-indoor pieces in whitewashed wood. ADD premium natural materials, curated coral and shell art, high-end linen, bespoke driftwood furniture, nautical elements, sea grass rugs. Luxurious relaxed seaside atmosphere",
      description: "Eksklusiv kyststil med designer-møbler og unikke naturlige elementer",
      exampleRetailers: ["Paustian", "Tine K Home"],
    },
  },
  transitional: {
    budget: {
      prompt: "Blend traditional and modern. REPLACE ornate furniture with transitional pieces. ADD neutral palette, mixed metals, classic silhouettes with contemporary finishes, balanced elegance. Simple upholstered furniture, clean traditional details. Dramatic transformation",
      description: "Klassisk møder moderne til en overkommelig pris",
      exampleRetailers: ["IKEA", "IDEmøbler"],
    },
    standard: {
      prompt: "Blend traditional and modern. REPLACE ornate furniture with transitional pieces. ADD neutral palette, mixed metals, classic silhouettes with contemporary finishes. Quality upholstery, refined mix of traditional and contemporary, warm neutrals, elegant lighting, balanced proportions. Dramatic transformation",
      description: "Elegant blanding af klassisk og moderne med kvalitetsmøbler",
      exampleRetailers: ["Ilva", "BoConcept"],
    },
    luxury: {
      prompt: "Blend traditional and modern. REPLACE all furniture with custom upholstered transitional pieces. ADD premium fabrics, designer lighting, curated antique accents, bespoke millwork, sophisticated palette, mixed metals, classic silhouettes with luxurious contemporary finishes. Dramatic elegant transformation",
      description: "Sofistikeret overgangsdesign med skræddersyede møbler og fine detaljer",
      exampleRetailers: ["Paustian", "Eilersen"],
    },
  },
  farmhouse: {
    budget: {
      prompt: "Full farmhouse transformation. REPLACE sleek furniture with rustic wood. ADD distressed finishes, vintage accessories, cozy textiles, wrought iron, reclaimed wood. White painted furniture, mason jar accents, gingham textiles. Warm inviting country atmosphere",
      description: "Rustik og hyggelig landstil til fornuftig pris",
      exampleRetailers: ["JYSK", "Søstrene Grene"],
    },
    standard: {
      prompt: "Full farmhouse transformation. REPLACE sleek furniture with rustic wood. ADD distressed finishes, vintage accessories, cozy textiles, wrought iron, reclaimed wood. Quality handmade ceramics, linen textiles, vintage-inspired fixtures, warm natural palette. Warm inviting country atmosphere",
      description: "Autentisk landstil med genbrugte materialer og håndværk",
      exampleRetailers: ["Ilva", "House Doctor"],
    },
    luxury: {
      prompt: "Full farmhouse transformation. REPLACE all furniture with artisan reclaimed timber pieces. ADD bespoke pottery, premium linen, designer rustic lighting, curated antiques, distressed finishes, wrought iron, reclaimed wood. Refined luxury country elegance",
      description: "Eksklusiv landstil med kunsthåndværk og antikke fund",
      exampleRetailers: ["Tine K Home", "&Tradition"],
    },
  },
  midcentury: {
    budget: {
      prompt: "Full midcentury modern renovation. REPLACE with iconic 1950s-60s furniture. ADD teak sideboards, Eames-style chairs, organic curved sofas, sputnik chandeliers, walnut wood, retro patterns. Tapered wooden legs, vintage-inspired colors, functional clean design. Authentic vintage atmosphere",
      description: "Retro 50'er/60'er stil med enkle træmøbler og tidløse former",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "Full midcentury modern renovation. REPLACE with iconic 1950s-60s furniture. ADD authentic teak and walnut furniture, iconic designer chairs, organic curved forms, sputnik chandeliers, warm earthy palette, statement lighting, vintage art prints, retro patterns. Authentic vintage atmosphere",
      description: "Autentisk midcentury med kvalitetsmøbler i teak og valnød",
      exampleRetailers: ["Ilva", "BoConcept", "House Doctor"],
    },
    luxury: {
      prompt: "Full midcentury modern renovation. REMOVE all existing furniture. REPLACE with original designer pieces. ADD premium solid walnut and rosewood furniture, Eames and Wegner chairs, sculptural sputnik chandeliers, curated vintage art, bespoke cabinetry, teak sideboards, organic curved sofas. Gallery-quality authentic vintage atmosphere",
      description: "Eksklusiv midcentury med originale designklassikere og ædle træsorter",
      exampleRetailers: ["&Tradition", "Carl Hansen & Søn", "Fritz Hansen"],
    },
  },
};
