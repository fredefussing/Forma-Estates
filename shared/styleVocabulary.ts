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
      prompt: "affordable scandinavian style, simple white furniture, basic natural materials, clean lines, minimal decor, light wood tones, functional layout",
      description: "Enkel og funktionel indretning med hvide møbler og naturlige materialer",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "premium scandinavian style, quality oak furniture, soft textiles, designer lamps, warm neutral palette, tactile materials, curated decor",
      description: "Kvalitetsindretning med nordisk design og gode materialer",
      exampleRetailers: ["Ilva", "Hay", "Fritz Hansen"],
    },
    luxury: {
      prompt: "luxury scandinavian style, exclusive designer furniture, premium solid oak, artisan textiles, statement lighting, bespoke details, gallery-quality art",
      description: "Eksklusiv indretning med designer-møbler og luksus-materialer",
      exampleRetailers: ["Bolia", "&Tradition", "Louis Poulsen"],
    },
  },
  modern: {
    budget: {
      prompt: "affordable modern style, simple geometric furniture, monochrome colors, functional design, clean surfaces, minimal accessories",
      description: "Moderne og minimalistisk med fokus på funktion",
      exampleRetailers: ["IKEA", "IDEmøbler"],
    },
    standard: {
      prompt: "premium modern style, sleek furniture, bold shapes, quality materials, ambient lighting, refined color palette, architectural details",
      description: "Moderne design med kant og karakter",
      exampleRetailers: ["BoConcept", "Montana"],
    },
    luxury: {
      prompt: "luxury modern style, iconic designer pieces, marble accents, sophisticated lighting, curated art, premium metals, bespoke furniture",
      description: "High-end moderne indretning med ikoniske møbler",
      exampleRetailers: ["Minotti", "B&B Italia"],
    },
  },
  luxury: {
    budget: {
      prompt: "elegant style on a budget, classic shapes, gold-tone accents, plush textiles, warm lighting, affordable luxury feel",
      description: "Elegant stil med luksusfølelse til fornuftig pris",
      exampleRetailers: ["ILVA", "IDEmøbler"],
    },
    standard: {
      prompt: "premium luxury style, rich fabrics, marble details, crystal lighting, deep colors, tailored furniture, sophisticated atmosphere",
      description: "Sofistikeret luksusindretning med rige materialer",
      exampleRetailers: ["BoConcept", "Bolia"],
    },
    luxury: {
      prompt: "ultra luxury style, bespoke furniture, rare marble, crystal chandeliers, silk textiles, gold accents, museum-quality art, opulent atmosphere",
      description: "Ultimativ luksus med skræddersyede møbler og sjældne materialer",
      exampleRetailers: ["Paustian", "Poltrona Frau", "Fendi Casa"],
    },
  },
  industrial: {
    budget: {
      prompt: "affordable industrial style, exposed brick effect, metal shelving, simple pendant lights, raw wood, utilitarian furniture",
      description: "Rå og urban stil med basale industrielle elementer",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "premium industrial style, reclaimed wood furniture, quality metal fixtures, edison bulb lighting, leather accents, authentic materials",
      description: "Autentisk industriel stil med genbrugsmaterialer og kvalitet",
      exampleRetailers: ["House Doctor", "Muubs"],
    },
    luxury: {
      prompt: "luxury industrial style, custom steel and glass, premium reclaimed materials, designer industrial lighting, artisan metalwork, curated vintage pieces",
      description: "Eksklusiv industriel stil med skræddersyede elementer",
      exampleRetailers: ["Norr11", "&Tradition", "Menu"],
    },
  },
  coastal: {
    budget: {
      prompt: "affordable coastal style, light blue and white palette, simple wicker furniture, nautical accents, natural textures, airy feel",
      description: "Frisk kyststil med lyse farver og naturlige materialer",
      exampleRetailers: ["JYSK", "Søstrene Grene"],
    },
    standard: {
      prompt: "premium coastal style, quality rattan furniture, linen textiles, driftwood accents, ocean-inspired palette, refined maritime decor",
      description: "Raffineret kyststil med kvalitetsmøbler og naturlige tekstiler",
      exampleRetailers: ["Ilva", "Bolia"],
    },
    luxury: {
      prompt: "luxury coastal style, designer outdoor-indoor furniture, premium natural materials, curated coral and shell art, high-end linen, bespoke driftwood pieces",
      description: "Eksklusiv kyststil med designer-møbler og unikke naturlige elementer",
      exampleRetailers: ["Paustian", "Tine K Home"],
    },
  },
  transitional: {
    budget: {
      prompt: "affordable transitional style, mix of classic and modern shapes, neutral palette, simple upholstered furniture, clean traditional details",
      description: "Klassisk møder moderne til en overkommelig pris",
      exampleRetailers: ["IKEA", "IDEmøbler"],
    },
    standard: {
      prompt: "premium transitional style, quality upholstery, refined mix of traditional and contemporary, warm neutrals, elegant lighting, balanced proportions",
      description: "Elegant blanding af klassisk og moderne med kvalitetsmøbler",
      exampleRetailers: ["Ilva", "BoConcept"],
    },
    luxury: {
      prompt: "luxury transitional style, custom upholstered furniture, premium fabrics, designer lighting, curated antique accents, bespoke millwork, sophisticated palette",
      description: "Sofistikeret overgangsdesign med skræddersyede møbler og fine detaljer",
      exampleRetailers: ["Paustian", "Eilersen"],
    },
  },
  farmhouse: {
    budget: {
      prompt: "affordable farmhouse style, white painted furniture, simple rustic wood, mason jar accents, gingham textiles, warm country feel",
      description: "Rustik og hyggelig landstil til fornuftig pris",
      exampleRetailers: ["JYSK", "Søstrene Grene"],
    },
    standard: {
      prompt: "premium farmhouse style, quality reclaimed wood, handmade ceramics, linen textiles, vintage-inspired fixtures, warm natural palette",
      description: "Autentisk landstil med genbrugte materialer og håndværk",
      exampleRetailers: ["Ilva", "House Doctor"],
    },
    luxury: {
      prompt: "luxury farmhouse style, artisan reclaimed timber, bespoke pottery, premium linen, designer rustic lighting, curated antiques, refined country elegance",
      description: "Eksklusiv landstil med kunsthåndværk og antikke fund",
      exampleRetailers: ["Tine K Home", "&Tradition"],
    },
  },
  midcentury: {
    budget: {
      prompt: "affordable mid-century modern style, retro 1950s 1960s furniture, tapered wooden legs, simple organic shapes, warm wood tones, vintage-inspired colors, functional clean design",
      description: "Retro 50'er/60'er stil med enkle træmøbler og tidløse former",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "premium mid-century modern style, authentic teak and walnut furniture, iconic designer chairs, organic curved forms, warm earthy palette, statement lighting, vintage art prints",
      description: "Autentisk midcentury med kvalitetsmøbler i teak og valnød",
      exampleRetailers: ["Ilva", "BoConcept", "House Doctor"],
    },
    luxury: {
      prompt: "luxury mid-century modern style, original designer pieces, premium solid walnut and rosewood, Eames and Wegner chairs, sculptural lighting, curated vintage art, bespoke cabinetry, gallery-quality space",
      description: "Eksklusiv midcentury med originale designklassikere og ædle træsorter",
      exampleRetailers: ["&Tradition", "Carl Hansen & Søn", "Fritz Hansen"],
    },
  },
};
