export type BudgetTier = "budget" | "standard" | "luxury";

export interface TierConfig {
  prompt: string;
  description: string;
  exampleRetailers: string[];
}

export type StyleVocabulary = Record<string, Record<BudgetTier, TierConfig>>;

const PRESERVE =
  "Retain the exact same room structure: keep the original floor, ceiling, walls, windows, doors, and architectural features unchanged. Preserve all fixed elements including wooden beams, moldings, built-in fixtures, flooring material, wall colors, and natural lighting conditions exactly as they appear. Do NOT alter the room layout, proportions, or any structural details.\n\n";

export const styleVocabulary: StyleVocabulary = {
  scandinavian: {
    budget: {
      prompt:
        "Retain the exact same room structure: keep the original floor, ceiling, walls, windows, doors, and architectural features unchanged. Preserve all fixed elements including wooden beams, moldings, built-in fixtures, flooring material, wall colors, and natural lighting conditions exactly as they appear. Do NOT alter the room layout, proportions, or any structural details. Only replace the movable furniture and decor with new pieces in classic Scandinavian style. New furniture: quality light oak sofa, mid-century oak coffee table, Louis Poulsen-style pendant light, woven wool armchair, minimalist oak shelving. Colors: warm white, light oak, muted grey, natural linen, soft green accents. Materials: solid oak, natural wool, pure linen, brushed brass. Plants: large fiddle-leaf fig in terracotta pot, monstera deliciosa near window, trailing ivy on shelf, small snake plant on side table, fresh eucalyptus in glass vase, hanging string-of-pearls near natural light. Warm white LED strip hidden under the oak shelving for soft downward glow, subtle LED strip beneath the sofa casting gentle floor light, small LED spot highlighting the monstera plant from below, LED strip along the window frame for evening ambiance; all LED strips warm white 2700K, cozy hygge glow, barely visible. The new furniture, plants, and lighting must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering, sharp focus, 8K detail, natural lighting with correct shadows and reflections, no blur, no soft focus, every texture crisp and defined. Textured wool throws, cozy hygge atmosphere, functional elegance, natural materials.",
      description: "Enkel nordisk indretning med lyse træer og hvide møbler. Stilrent og funktionelt til en god pris.",
      exampleRetailers: ["IKEA", "JYSK", "jem & fix"],
    },
    standard: {
      prompt:
        "Retain the exact same room structure: keep the original floor, ceiling, walls, windows, doors, and architectural features unchanged. Preserve all fixed elements including wooden beams, moldings, built-in fixtures, flooring material, wall colors, and natural lighting conditions exactly as they appear. Do NOT alter the room layout, proportions, or any structural details. Only replace the movable furniture and decor with new pieces in classic Scandinavian style. New furniture: quality light oak sofa, mid-century oak coffee table, Louis Poulsen-style pendant light, woven wool armchair, minimalist oak shelving. Colors: warm white, light oak, muted grey, natural linen, soft green accents. Materials: solid oak, natural wool, pure linen, brushed brass. Plants: large fiddle-leaf fig in terracotta pot, monstera deliciosa near window, trailing ivy on shelf, small snake plant on side table, fresh eucalyptus in glass vase, hanging string-of-pearls near natural light. Warm white LED strip hidden under the oak shelving for soft downward glow, subtle LED strip beneath the sofa casting gentle floor light, small LED spot highlighting the monstera plant from below, LED strip along the window frame for evening ambiance; all LED strips warm white 2700K, cozy hygge glow, barely visible. The new furniture, plants, and lighting must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering, sharp focus, 8K detail, natural lighting with correct shadows and reflections, no blur, no soft focus, every texture crisp and defined. Textured wool throws, cozy hygge atmosphere, functional elegance, natural materials.",
      description: "Klassisk nordisk kvalitetsstil med egetræ og naturlige tekstiler i uld og hør. Balanceret og tidløst.",
      exampleRetailers: ["Ilva", "BoConcept", "Hay"],
    },
    luxury: {
      prompt:
        "Retain the exact same room structure: keep the original floor, ceiling, walls, windows, doors, and architectural features unchanged. Preserve all fixed elements including wooden beams, moldings, built-in fixtures, flooring material, wall colors, and natural lighting conditions exactly as they appear. Do NOT alter the room layout, proportions, or any structural details. Only replace the movable furniture and decor with new pieces in classic Scandinavian style. New furniture: quality light oak sofa, mid-century oak coffee table, Louis Poulsen-style pendant light, woven wool armchair, minimalist oak shelving. Colors: warm white, light oak, muted grey, natural linen, soft green accents. Materials: solid oak, natural wool, pure linen, brushed brass. Plants: large fiddle-leaf fig in terracotta pot, monstera deliciosa near window, trailing ivy on shelf, small snake plant on side table, fresh eucalyptus in glass vase, hanging string-of-pearls near natural light. Warm white LED strip hidden under the oak shelving for soft downward glow, subtle LED strip beneath the sofa casting gentle floor light, small LED spot highlighting the monstera plant from below, LED strip along the window frame for evening ambiance; all LED strips warm white 2700K, cozy hygge glow, barely visible. The new furniture, plants, and lighting must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering, sharp focus, 8K detail, natural lighting with correct shadows and reflections, no blur, no soft focus, every texture crisp and defined. Textured wool throws, cozy hygge atmosphere, functional elegance, natural materials.",
      description: "Premium nordisk design med massivt egetræ, designerlamper og håndlavede detaljer. Eksklusivt og tidløst.",
      exampleRetailers: ["Hay", "Menu", "&Tradition", "Louis Poulsen"],
    },
  },

  modern: {
    budget: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in modern minimalist style. New furniture: sleek low-profile sofa in neutral fabric, simple geometric coffee table, basic pendant lamp, contemporary side table, clean shelving. Colors: charcoal, cream, matte black, light grey. Materials: engineered wood, basic metal, woven fabric. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Clean lines, uncluttered, modern look.",
      description: "Ren og moderne minimalistisk stil med geometriske former og neutrale farver. Moderne look til fornuftig pris.",
      exampleRetailers: ["IKEA", "Kvik", "IDEmøbler"],
    },
    standard: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in modern minimalist style. New furniture: sleek low-profile sofa, geometric coffee table, statement pendant lamp, modern side table, contemporary shelving. Colors: charcoal, cream, brushed brass, matte black. Materials: brushed metal, leather, glass, polished wood. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Clean lines, uncluttered, sophisticated.",
      description: "Moderne indretning med kvalitetssofaer, glas og ståldetaljer samt struktureret belysning og kunst.",
      exampleRetailers: ["BoConcept", "Ilva", "Sofacompany"],
    },
    luxury: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in luxury modern style. New furniture: premium Italian-designed sectional sofa, polished marble-top coffee table, architectural statement floor lamp, bespoke built-in shelving, designer armchair. Colors: cream, polished marble white, brushed gold, warm grey, charcoal. Materials: Italian leather, Calacatta marble, brushed brass, lacquered wood. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Luxury modernism, bespoke and architectural.",
      description: "Luksuriøs moderne indretning med premiumitalienske møbler, marmoroverflader og ikonisk designbelysning.",
      exampleRetailers: ["Montana", "Fritz Hansen", "Gubi", "Paustian"],
    },
  },

  luxury: {
    budget: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in glamorous luxury-look style. New furniture: velvet sofa in jewel tone, gold-tone side table, mirrored accent table, plush area rug, decorative cushions. Colors: deep emerald, gold, cream, dusty rose. Materials: velvet, gold-tone metal, mirror accents, plush textiles. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Glamorous luxury look at accessible price.",
      description: "Glamourøs luksusindretning med fløjl, gulddetaljer og spejloverflader. Luksusudseende til fornuftig pris.",
      exampleRetailers: ["H&M Home", "Zara Home", "Maisons du Monde"],
    },
    standard: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in luxury contemporary style. New furniture: velvet sectional sofa, marble-top coffee table, designer arc floor lamp, polished wood sideboard, statement armchair. Colors: deep emerald, gold, cream, walnut, champagne. Materials: Italian velvet, Calacatta marble, brushed brass, walnut, silk. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Opulent but tasteful, designer quality.",
      description: "Elegant luksusindretning med fløjlssofaer, messinglysestager og dybe smykkefarver i grøn og blå.",
      exampleRetailers: ["Sofacompany", "Wendelbo", "Bolia"],
    },
    luxury: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in ultra-luxury style. New furniture: bespoke velvet chaise lounge, rare natural stone coffee table, crystal chandelier, custom silk drapes, museum-quality art pieces. Colors: deep sapphire, champagne gold, ivory, ebony. Materials: silk, cashmere, natural stone, crystal, hand-gilded finishes. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Ultra-luxury, one-of-a-kind, museum quality.",
      description: "Ultra-luksus med skræddersyede møbler, natursten, krystallamper og de fineste tekstiler i silke og cashmere.",
      exampleRetailers: ["Cassina", "Poltrona Frau", "Fendi Casa", "Minotti"],
    },
  },

  industrial: {
    budget: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in refined industrial style. New furniture: distressed leather Chesterfield sofa, black metal pipe shelving, reclaimed wood coffee table, vintage Edison bulb floor lamp, metal-framed armchair. Colors: distressed brown leather, matte black metal, warm wood, aged brass. Materials: faux leather, black metal pipe, reclaimed-look wood, wrought iron. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Loft aesthetic, raw but accessible.",
      description: "Rå industriel stil med teglstenseffekt, sorte metalreoler og Edison-pærer. Autentisk look til god pris.",
      exampleRetailers: ["IKEA", "jem & fix", "JYSK"],
    },
    standard: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in refined industrial style. New furniture: distressed leather Chesterfield sofa, black metal pipe shelving, reclaimed wood coffee table, vintage Edison bulb floor lamp, metal-framed armchair. Colors: distressed brown leather, matte black metal, warm wood, aged brass. Materials: full-grain leather, blackened steel, reclaimed wood, wrought iron. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Loft aesthetic, raw but refined.",
      description: "Autentisk industriel indretning med beton, stålmøbler og kornlæder. Robust og karakterfuldt.",
      exampleRetailers: ["Vipp", "House Doctor", "Muubs"],
    },
    luxury: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in premium industrial style. New furniture: custom-made full-grain leather Chesterfield, bespoke steel-and-glass shelving, hand-forged iron coffee table, factory-style statement pendant, Italian leather armchair. Colors: cognac leather, polished dark steel, smoked oak, antique brass. Materials: Italian full-grain leather, hand-forged steel, polished concrete accents, smoked oak. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Premium loft, raw luxury.",
      description: "Premium industri-loft med poleret beton, skræddersyet stål og italiensk læder. Eksklusivt og råt.",
      exampleRetailers: ["Vipp", "Tom Dixon", "Norr11", "&Tradition"],
    },
  },

  coastal: {
    budget: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in coastal beach house style. New furniture: whitewashed oak coffee table, linen slipcovered sofa, rattan accent chair, rope-wrapped lamp, seagrass rug. Colors: white, sand, ocean blue, driftwood grey, natural linen. Materials: whitewashed pine, cotton linen, rattan, seagrass, jute. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Breezy, relaxed, seaside feel at a good price.",
      description: "Afslappet kystliv-stil med lyseblå og sandfarver, rattan og naturlige tekstiler. Frisk og hyggeligt.",
      exampleRetailers: ["JYSK", "Søstrene Grene", "Bahne"],
    },
    standard: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in coastal beach house style. New furniture: whitewashed oak coffee table, linen slipcovered sofa, rattan accent chair, rope-wrapped lamp, seagrass rug. Colors: white, sand, ocean blue, driftwood grey, natural linen. Materials: whitewashed oak, natural linen, rattan, seagrass, jute. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Breezy, relaxed, seaside elegance.",
      description: "Raffineret kystindretning med teak og rattan, havblå nuancer, naturlige tæpper og linengardiner.",
      exampleRetailers: ["Bloomingville", "Ilva", "Bolia"],
    },
    luxury: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in luxury coastal style. New furniture: custom teak and driftwood sofa, designer oversized rattan pendant, high-thread Belgian linen daybed, artisan ceramic collection, hand-knotted sisal rug. Colors: bleached white, natural teak, deep ocean navy, warm sand, coral accent. Materials: reclaimed teak, Belgian linen, hand-blown glass, artisan ceramics. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Luxury coastal retreat, curated and serene.",
      description: "Luksuriøs feriestemsning med teak, designer-rattan-lamper, belgisk linned og håndlavet keramik.",
      exampleRetailers: ["Sika Design", "Cane-line", "Tine K Home"],
    },
  },

  transitional: {
    budget: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in transitional style blending classic and contemporary. New furniture: simple upholstered sofa in warm beige, rectangular coffee table, basic floor lamp, neutral area rug, clean-lined side table. Colors: warm beige, greige, cream, soft taupe, light wood. Materials: upholstered fabric, engineered wood, basic metal. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Timeless and versatile, affordable transitional look.",
      description: "Tidløs overgangssstil der blander klassisk og moderne. Neutrale varme toner og enkle former.",
      exampleRetailers: ["IKEA", "IDEmøbler", "Ilva"],
    },
    standard: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in transitional style. New furniture: quality neutral upholstered sofa, mixed warm wood coffee table, layered area rug, architectural floor lamp, classic millwork-inspired shelving. Colors: warm taupe, cream, brushed nickel, warm walnut, soft sage. Materials: quality upholstery fabric, warm walnut, brushed nickel, wool rug. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Balanced classic-meets-contemporary, refined.",
      description: "Balanceret transitional med kvalitetssofaer, blandede træsorter, lagdelte tæpper og klassiske detaljer.",
      exampleRetailers: ["BoConcept", "Sofacompany", "Ethnicraft"],
    },
    luxury: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in premium transitional style. New furniture: bespoke cabinetry with antique brass hardware, heirloom-quality upholstered chesterfield, statement chandelier, custom area rug, art-filled gallery wall. Colors: warm ivory, antique brass, deep navy, walnut, warm cream. Materials: solid walnut, antique brass, premium upholstery, hand-knotted rug. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Premium transitional, heirloom quality.",
      description: "Premium transitional design med skræddersyede skabe, antik messing, arvestykke-kvalitet og kunst.",
      exampleRetailers: ["Eilersen", "Paustian", "Flexform"],
    },
  },

  farmhouse: {
    budget: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in modern farmhouse style. New furniture: reclaimed wood dining table, slipcovered roll-arm sofa, vintage-style pendant lights, distressed wood coffee table, wrought iron shelf. Colors: white, warm wood, sage green, cream, aged black. Materials: reclaimed pine, natural cotton, wrought iron, distressed wood. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Cozy, rustic, lived-in charm at a good price.",
      description: "Hyggeligt bondegårds-look med hvid panel-effekt, rustikt træ, ternede tekstiler og vintage detaljer.",
      exampleRetailers: ["JYSK", "Søstrene Grene", "H&M Home"],
    },
    standard: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in modern farmhouse style. New furniture: reclaimed wood dining table, slipcovered roll-arm sofa, vintage-style pendant lights, distressed wood coffee table, wrought iron shelf. Colors: white, warm wood, sage green, cream, aged black. Materials: reclaimed pine, natural cotton, wrought iron, distressed wood. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Cozy, rustic, lived-in charm.",
      description: "Moderne bondegårdsindretning med genbrugstræ, linned, shaker-skabe og jernbeslag. Autentisk og hyggeligt.",
      exampleRetailers: ["Bloomingville", "House Doctor", "Broste Copenhagen"],
    },
    luxury: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in luxury farmhouse estate style. New furniture: custom reclaimed timber dining table, designer French country linen sofa, hand-thrown ceramic collection, antique farmhouse armoire, statement stone fireplace surround. Colors: warm cream, aged oak, stone grey, sage green, antique black. Materials: reclaimed timber beams, Belgian linen, hand-thrown ceramics, antique iron. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Luxury farmhouse estate, artisan and antique.",
      description: "Eksklusiv bondegårds-stil med rå tømmerbjælker, natursten, franske linned og antikke møbler.",
      exampleRetailers: ["Tine K Home", "Flamant", "&Tradition"],
    },
  },

  midcentury: {
    budget: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in mid-century modern style. New furniture: retro organic-shaped sofa, tapered-leg coffee table, sputnik-inspired pendant, walnut-look credenza, graphic wool rug. Colors: walnut, mustard yellow, teal, burnt orange, cream. Materials: walnut veneer, molded plastic, woven wool, brass accents. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. 1950s-1960s retro aesthetic, accessible.",
      description: "Retroinspireret 50er/60er stil med organiske former, varmt valnød-look og sennepsfarver. Tidløst og legende.",
      exampleRetailers: ["IKEA", "JYSK", "Maisons du Monde"],
    },
    standard: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in authentic mid-century modern style. New furniture: Eames-style lounge chair, teak credenza, tulip coffee table, sputnik chandelier, woven wool rug. Colors: walnut, mustard yellow, teal, burnt orange, cream. Materials: solid teak, molded fiberglass, wool, brass. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. 1950s-1960s aesthetic, organic shapes.",
      description: "Autentisk midcentury med teaktræ, Eames-inspirerede stole og klassisk dansk design med ikonisk belysning.",
      exampleRetailers: ["Hay", "BoConcept", "House Doctor", "Paustian"],
    },
    luxury: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in authentic luxury mid-century modern style. New furniture: original Hans Wegner Shell chair, Fritz Hansen Series 7 dining chairs, Poul Henningsen PH5 pendant lamp, premium teak sideboard, hand-knotted vintage-style rug. Colors: warm walnut, cognac leather, mustard yellow, teal, brass. Materials: solid teak, premium leather, hand-blown glass, solid brass. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Iconic Danish mid-century design, museum quality.",
      description: "Autentisk midcentury med ikonmøbler af Hans Wegner, Fritz Hansen og PH-lamper. Det bedste af dansk design.",
      exampleRetailers: ["Fritz Hansen", "Carl Hansen & Søn", "PP Møbler", "Paustian"],
    },
  },

  bohemian: {
    budget: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in curated bohemian style. New furniture: Moroccan pouf, vintage kilim rug, rattan peacock chair, macrame wall hanging, low wooden table, layered textiles. Colors: terracotta, mustard, deep blue, cream, coral. Materials: handwoven wool, rattan, carved wood, vintage textiles, brass. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Eclectic, layered, collected-over-time aesthetic.",
      description: "Afslappet boheme-stil med marokkanske poufs, kilim-tæpper og lagdelte tekstiler. Eklektisk og farverigt.",
      exampleRetailers: ["Søstrene Grene", "H&M Home", "Maisons du Monde"],
    },
    standard: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in curated bohemian style. New furniture: Moroccan pouf, vintage kilim rug, rattan peacock chair, macrame wall hanging, low wooden table, layered textiles. Colors: terracotta, mustard, deep blue, cream, coral. Materials: handwoven wool, rattan, carved wood, vintage textiles, brass. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Eclectic, layered, collected-over-time aesthetic.",
      description: "Curateret boheme med rattan, kilim-tæpper, makramé og varme jordfarver. Personligt og kreativt.",
      exampleRetailers: ["Bloomingville", "House Doctor", "Tine K Home"],
    },
    luxury: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in luxury curated bohemian style. New furniture: custom Moroccan hand-carved sofa, antique Persian silk rug, designer rattan pendant, bespoke macrame installation, artisan brass coffee table. Colors: deep saffron, midnight blue, antique gold, rich terracotta, ivory. Materials: hand-carved walnut, antique silk, artisan brass, natural rattan, hand-thrown ceramics. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Luxury global collector's aesthetic.",
      description: "Luksuriøs boheme med persiske silketæpper, håndskåret træ og designerlamper. Globalt og eksotisk.",
      exampleRetailers: ["Tine K Home", "Muubs", "Broste Copenhagen"],
    },
  },

  japandi: {
    budget: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in Japandi (Japanese-Scandinavian) style. New furniture: low-profile oak platform sofa, minimalist wooden coffee table, paper lantern pendant lamp, simple oak shelving, tatami-inspired rug. Colors: warm white, light oak, soft grey, charcoal, natural linen. Materials: solid light oak, washi paper, natural linen, bamboo, stone. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Zen simplicity, wabi-sabi, functional beauty.",
      description: "Japansk-skandinavisk fusion med lave møbler, bambus og zen-enkelhed. Rolig og balanceret.",
      exampleRetailers: ["IKEA", "Søstrene Grene", "JYSK"],
    },
    standard: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in Japandi (Japanese-Scandinavian) style. New furniture: low-profile oak platform sofa, minimalist wooden coffee table, paper lantern pendant lamp, simple oak shelving, tatami-inspired rug. Colors: warm white, light oak, soft grey, charcoal, natural linen. Materials: solid light oak, washi paper, natural linen, bamboo, stone. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Zen simplicity, wabi-sabi, functional beauty.",
      description: "Raffineret Japandi med massivt egetræ, washi-papir og natursten. Ro og præcision i balance.",
      exampleRetailers: ["Hay", "Muubs", "Menu"],
    },
    luxury: {
      prompt:
        PRESERVE +
        "Only replace the movable furniture and decor with new pieces in luxury Japandi style. New furniture: bespoke low-profile walnut platform sofa, hand-crafted stone coffee table, designer washi paper pendant lamp, custom lacquered shelving, hand-woven silk tatami rug. Colors: warm white, smoked walnut, charcoal, warm stone, deep indigo accent. Materials: solid walnut, hand-crafted stone, washi silk, natural bamboo, lacquered oak. The new furniture must blend naturally with the preserved room, matching the existing lighting, shadows, and perspective. Photorealistic rendering. Luxury zen, artisan Japanese-Nordic fusion.",
      description: "Premium Japandi med bespoke valnød, natursten og designerlamper i washi-silke. Eksklusiv ro.",
      exampleRetailers: ["Hay", "Carl Hansen & Søn", "Paustian"],
    },
  },
};
