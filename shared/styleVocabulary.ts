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
      prompt: "Scandinavian interior design",
      description: "Enkel og funktionel indretning med hvide møbler og naturlige materialer",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "Scandinavian interior design",
      description: "Kvalitetsindretning med nordisk design og gode materialer",
      exampleRetailers: ["Ilva", "Hay", "Fritz Hansen"],
    },
    luxury: {
      prompt: "Scandinavian interior design",
      description: "Eksklusiv indretning med designer-møbler og luksus-materialer",
      exampleRetailers: ["Bolia", "&Tradition", "Louis Poulsen"],
    },
  },
  modern: {
    budget: {
      prompt: "Modern interior design",
      description: "Moderne og minimalistisk med fokus på funktion",
      exampleRetailers: ["IKEA", "IDEmøbler"],
    },
    standard: {
      prompt: "Modern interior design",
      description: "Moderne design med kant og karakter",
      exampleRetailers: ["BoConcept", "Montana"],
    },
    luxury: {
      prompt: "Modern interior design",
      description: "High-end moderne indretning med ikoniske møbler",
      exampleRetailers: ["Minotti", "B&B Italia"],
    },
  },
  luxury: {
    budget: {
      prompt: "Luxury interior design",
      description: "Elegant stil med luksusfølelse til fornuftig pris",
      exampleRetailers: ["ILVA", "IDEmøbler"],
    },
    standard: {
      prompt: "Luxury interior design",
      description: "Sofistikeret luksusindretning med rige materialer",
      exampleRetailers: ["BoConcept", "Bolia"],
    },
    luxury: {
      prompt: "Luxury interior design",
      description: "Ultimativ luksus med skræddersyede møbler og sjældne materialer",
      exampleRetailers: ["Paustian", "Poltrona Frau", "Fendi Casa"],
    },
  },
  industrial: {
    budget: {
      prompt: "Industrial loft interior",
      description: "Rå og urban stil med basale industrielle elementer",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "Industrial loft interior",
      description: "Autentisk industriel stil med genbrugsmaterialer og kvalitet",
      exampleRetailers: ["House Doctor", "Muubs"],
    },
    luxury: {
      prompt: "Industrial loft interior",
      description: "Eksklusiv industriel stil med skræddersyede elementer",
      exampleRetailers: ["Norr11", "&Tradition", "Menu"],
    },
  },
  coastal: {
    budget: {
      prompt: "Coastal beach house interior",
      description: "Frisk kyststil med lyse farver og naturlige materialer",
      exampleRetailers: ["JYSK", "Søstrene Grene"],
    },
    standard: {
      prompt: "Coastal beach house interior",
      description: "Raffineret kyststil med kvalitetsmøbler og naturlige tekstiler",
      exampleRetailers: ["Ilva", "Bolia"],
    },
    luxury: {
      prompt: "Coastal beach house interior",
      description: "Eksklusiv kyststil med designer-møbler og unikke naturlige elementer",
      exampleRetailers: ["Paustian", "Tine K Home"],
    },
  },
  transitional: {
    budget: {
      prompt: "Transitional interior design",
      description: "Klassisk møder moderne til en overkommelig pris",
      exampleRetailers: ["IKEA", "IDEmøbler"],
    },
    standard: {
      prompt: "Transitional interior design",
      description: "Elegant blanding af klassisk og moderne med kvalitetsmøbler",
      exampleRetailers: ["Ilva", "BoConcept"],
    },
    luxury: {
      prompt: "Transitional interior design",
      description: "Sofistikeret overgangsdesign med skræddersyede møbler og fine detaljer",
      exampleRetailers: ["Paustian", "Eilersen"],
    },
  },
  farmhouse: {
    budget: {
      prompt: "Farmhouse rustic interior",
      description: "Rustik og hyggelig landstil til fornuftig pris",
      exampleRetailers: ["JYSK", "Søstrene Grene"],
    },
    standard: {
      prompt: "Farmhouse rustic interior",
      description: "Autentisk landstil med genbrugte materialer og håndværk",
      exampleRetailers: ["Ilva", "House Doctor"],
    },
    luxury: {
      prompt: "Farmhouse rustic interior",
      description: "Eksklusiv landstil med kunsthåndværk og antikke fund",
      exampleRetailers: ["Tine K Home", "&Tradition"],
    },
  },
  midcentury: {
    budget: {
      prompt: "Mid-century modern interior",
      description: "Retro 50'er/60'er stil med enkle træmøbler og tidløse former",
      exampleRetailers: ["IKEA", "JYSK"],
    },
    standard: {
      prompt: "Mid-century modern interior",
      description: "Autentisk midcentury med kvalitetsmøbler i teak og valnød",
      exampleRetailers: ["Ilva", "BoConcept", "House Doctor"],
    },
    luxury: {
      prompt: "Mid-century modern interior",
      description: "Eksklusiv midcentury med originale designklassikere og ædle træsorter",
      exampleRetailers: ["&Tradition", "Carl Hansen & Søn", "Fritz Hansen"],
    },
  },
};
