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
      prompt: "Scandinavian minimalist interior with IKEA-style light pine and white furniture, clean functional lines, white walls and simple neutral textiles. Affordable but stylish.",
      description: "Enkel nordisk indretning med lyse træer og hvide møbler. Stilrent og funktionelt til en god pris.",
      exampleRetailers: ["IKEA", "JYSK", "jem & fix"],
    },
    standard: {
      prompt: "Scandinavian design with quality oak and birch furniture, warm white tones, natural wool and linen textiles, layered rugs and thoughtful craftsmanship.",
      description: "Klassisk nordisk kvalitetsstil med egetræ og naturlige tekstiler i uld og hør. Balanceret og tidløst.",
      exampleRetailers: ["Ilva", "BoConcept", "Hay"],
    },
    luxury: {
      prompt: "High-end Scandinavian design with premium solid oak and walnut custom furniture, designer pendant lighting, handcrafted wool textiles, curated ceramics and artisan details.",
      description: "Premium nordisk design med massivt egetræ, designerlamper og håndlavede detaljer. Eksklusivt og tidløst.",
      exampleRetailers: ["Hay", "Menu", "&Tradition", "Louis Poulsen"],
    },
  },
  modern: {
    budget: {
      prompt: "Modern minimalist interior with clean geometric lines, neutral gray and white palette, simple contemporary furniture and statement lighting at accessible prices.",
      description: "Ren og moderne minimalistisk stil med geometriske former og neutrale farver. Moderne look til fornuftig pris.",
      exampleRetailers: ["IKEA", "Kvik", "IDEmøbler"],
    },
    standard: {
      prompt: "Modern interior with quality upholstered sofas in warm neutrals, glass and brushed metal accents, architectural floor lamps and gallery wall art.",
      description: "Moderne indretning med kvalitetssofaer, glas og ståldetaljer samt struktureret belysning og kunst.",
      exampleRetailers: ["BoConcept", "Ilva", "Sofacompany"],
    },
    luxury: {
      prompt: "Luxury modern interior with premium Italian designer furniture, polished marble surfaces, architectural statement lighting and bespoke built-in elements.",
      description: "Luksuriøs moderne indretning med premiumitalienske møbler, marmoroverflader og ikonisk designbelysning.",
      exampleRetailers: ["Montana", "Fritz Hansen", "Gubi", "Paustian"],
    },
  },
  luxury: {
    budget: {
      prompt: "Glamorous luxury-look interior with velvet upholstery in jewel tones, gold-tone hardware, mirrored surfaces and rich accent colors at accessible prices.",
      description: "Glamourøs luksusindretning med fløjl, gulddetaljer og spejloverflader. Luksusudseende til fornuftig pris.",
      exampleRetailers: ["H&M Home", "Zara Home", "Maisons du Monde"],
    },
    standard: {
      prompt: "Elegant luxury interior with quality velvet and bouclé sofas, brass and gold fixtures, deep emerald and sapphire accent walls and layered ornate textiles.",
      description: "Elegant luksusindretning med fløjlssofaer, messinglysestager og dybe smykkefarver i grøn og blå.",
      exampleRetailers: ["Sofacompany", "Wendelbo", "Bolia"],
    },
    luxury: {
      prompt: "Ultra-luxury interior with bespoke statement furniture, rare natural stone features, crystal chandeliers, silk and cashmere textiles and museum-quality art.",
      description: "Ultra-luksus med skræddersyede møbler, natursten, krystallamper og de fineste tekstiler i silke og cashmere.",
      exampleRetailers: ["Cassina", "Poltrona Frau", "Fendi Casa", "Minotti"],
    },
  },
  industrial: {
    budget: {
      prompt: "Industrial loft style with exposed brick effect walls, black metal pipe shelving, Edison bulb string lights, reclaimed wood accents and concrete-look surfaces.",
      description: "Rå industriel stil med teglstenseffekt, sorte metalreoler og Edison-pærer. Autentisk look til god pris.",
      exampleRetailers: ["IKEA", "jem & fix", "JYSK"],
    },
    standard: {
      prompt: "Industrial interior with genuine exposed concrete or brick, quality powder-coated steel furniture, full-grain leather seating and warm filament lighting.",
      description: "Autentisk industriel indretning med beton, stålmøbler og kornlæder. Robust og karakterfuldt.",
      exampleRetailers: ["Vipp", "House Doctor", "Muubs"],
    },
    luxury: {
      prompt: "Premium industrial interior with polished concrete floors, custom fabricated steel and glass structures, Italian full-grain leather and bespoke factory-loft lighting.",
      description: "Premium industri-loft med poleret beton, skræddersyet stål og italiensk læder. Eksklusivt og råt.",
      exampleRetailers: ["Vipp", "Tom Dixon", "Norr11", "&Tradition"],
    },
  },
  coastal: {
    budget: {
      prompt: "Coastal beach house style with light sky blues and sandy whites, wicker and rattan furniture, cotton linen cushions and decorative driftwood at budget prices.",
      description: "Afslappet kystliv-stil med lyseblå og sandfarver, rattan og naturlige tekstiler. Frisk og hyggeligt.",
      exampleRetailers: ["JYSK", "Søstrene Grene", "Bahne"],
    },
    standard: {
      prompt: "Coastal interior with quality teak and rattan furniture, ocean-inspired palette of aquas, creams and navy, natural sisal rugs and linen drapes.",
      description: "Raffineret kystindretning med teak og rattan, havblå nuancer, naturlige tæpper og linengardiner.",
      exampleRetailers: ["Bloomingville", "Ilva", "Bolia"],
    },
    luxury: {
      prompt: "Luxury coastal retreat with custom teak and reclaimed driftwood furniture, designer oversized rattan lighting, high-thread Belgian linen and curated artisan ceramics.",
      description: "Luksuriøs feriestemsning med teak, designer-rattan-lamper, belgisk linned og håndlavet keramik.",
      exampleRetailers: ["Sika Design", "Cane-line", "Tine K Home"],
    },
  },
  transitional: {
    budget: {
      prompt: "Transitional style blending classic and contemporary with warm beige and greige neutrals, simple upholstered furniture and architectural clean lines.",
      description: "Tidløs overgangssstil der blander klassisk og moderne. Neutrale varme toner og enkle former.",
      exampleRetailers: ["IKEA", "IDEmøbler", "Ilva"],
    },
    standard: {
      prompt: "Transitional interior with quality neutral upholstered sofas, mixed warm wood tones, layered area rugs, subtle traditional millwork and curated accessories.",
      description: "Balanceret transitional med kvalitetssofaer, blandede træsorter, lagdelte tæpper og klassiske detaljer.",
      exampleRetailers: ["BoConcept", "Sofacompany", "Ethnicraft"],
    },
    luxury: {
      prompt: "Premium transitional interior with bespoke cabinetry and millwork, heirloom-quality upholstery, antique brass hardware, statement chandeliers and art-filled walls.",
      description: "Premium transitional design med skræddersyede skabe, antik messing, arvestykke-kvalitet og kunst.",
      exampleRetailers: ["Eilersen", "Paustian", "Flexform"],
    },
  },
  farmhouse: {
    budget: {
      prompt: "Farmhouse style with white shiplap paneling effect, simple pine and MDF furniture with distressed finish, cotton check textiles and vintage-inspired accessories.",
      description: "Hyggeligt bondegårds-look med hvid panel-effekt, rustikt træ, ternede tekstiler og vintage detaljer.",
      exampleRetailers: ["JYSK", "Søstrene Grene", "H&M Home"],
    },
    standard: {
      prompt: "Modern farmhouse interior with genuine reclaimed wood accent walls, quality linen upholstery, shaker-style kitchen cabinetry, ceramic farmhouse sink and iron hardware.",
      description: "Moderne bondegårdsindretning med genbrugstræ, linned, shaker-skabe og jernbeslag. Autentisk og hyggeligt.",
      exampleRetailers: ["Bloomingville", "House Doctor", "Broste Copenhagen"],
    },
    luxury: {
      prompt: "Luxury farmhouse estate interior with custom reclaimed timber beams, bespoke stone fireplace, designer French country linens, hand-thrown ceramics and antique furniture.",
      description: "Eksklusiv bondegårds-stil med rå tømmerbjælker, natursten, franske linned og antikke møbler.",
      exampleRetailers: ["Tine K Home", "Flamant", "&Tradition"],
    },
  },
  midcentury: {
    budget: {
      prompt: "Mid-century modern style with retro organic shapes, warm walnut-look furniture, mustard yellow and teal accent colors, tapered wooden legs and graphic rugs.",
      description: "Retroinspireret 50er/60er stil med organiske former, varmt valnød-look og sennepsfarver. Tidløst og legende.",
      exampleRetailers: ["IKEA", "JYSK", "Maisons du Monde"],
    },
    standard: {
      prompt: "Mid-century modern interior with real teak and walnut furniture, Eames-inspired chairs, Danish modern credenza, iconic pendant lighting and warm textiles.",
      description: "Autentisk midcentury med teaktræ, Eames-inspirerede stole og klassisk dansk design med ikonisk belysning.",
      exampleRetailers: ["Hay", "BoConcept", "House Doctor", "Paustian"],
    },
    luxury: {
      prompt: "Authentic mid-century modern masterwork with original Hans Wegner shell chairs, Fritz Hansen Series 7, Poul Henningsen pendant lights, premium teak sideboard and original artwork.",
      description: "Autentisk midcentury med ikonmøbler af Hans Wegner, Fritz Hansen og PH-lamper. Det bedste af dansk design.",
      exampleRetailers: ["Fritz Hansen", "Carl Hansen & Søn", "PP Møbler", "Paustian"],
    },
  },
};
