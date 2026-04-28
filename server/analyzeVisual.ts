import { Jimp } from "jimp";

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
      case gn: h = ((bn - rn) / d + 2) / 6; break;
      case bn: h = ((rn - gn) / d + 4) / 6; break;
    }
  }

  return [h * 360, s, l];
}

function mapRgbToSearchTerms(r: number, g: number, b: number): string[] {
  const [h, s, l] = rgbToHsl(r, g, b);

  if (s < 0.12) {
    if (l > 0.88) return ["hvid", "white", "lys"];
    if (l > 0.65) return ["beige", "cream", "off-white", "lysegrå", "natur"];
    if (l > 0.4)  return ["grå", "sand", "natur"];
    if (l > 0.2)  return ["mørkegrå", "antracit"];
    return ["sort", "black"];
  }

  if (s < 0.35 && h >= 20 && h <= 60) {
    if (l > 0.70) return ["beige", "cream", "sand", "natur"];
    if (l > 0.45) return ["brun", "lysebrun", "eg", "natur", "oak"];
    return ["mørkebrun", "valnød", "walnut"];
  }

  if (h < 30 || h >= 330) return ["rød", "terra", "rust"];
  if (h < 60)  return ["orange", "okker", "terra"];
  if (h < 90)  return ["gul", "okker", "sand"];
  if (h < 150) return ["grøn", "olive", "sage"];
  if (h < 210) return ["blå", "turkis", "petrol"];
  if (h < 270) return ["blå", "navy", "indigo"];
  if (h < 300) return ["lilla", "violet"];
  return ["pink", "lyserød"];
}

export async function getDominantColorTerms(imageFilePath: string): Promise<string[]> {
  try {
    const image = await Jimp.read(imageFilePath);
    const { data, width, height } = image.bitmap;

    let totalR = 0, totalG = 0, totalB = 0, count = 0;
    const step = 8;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        totalR += data[idx];
        totalG += data[idx + 1];
        totalB += data[idx + 2];
        count++;
      }
    }

    if (count === 0) return [];

    const avgR = Math.round(totalR / count);
    const avgG = Math.round(totalG / count);
    const avgB = Math.round(totalB / count);

    return mapRgbToSearchTerms(avgR, avgG, avgB);
  } catch (err: any) {
    console.error("getDominantColorTerms fejl:", err.message);
    return [];
  }
}

const STYLE_TO_TERMS: Record<string, string[]> = {
  "scandinavian": ["skandinavisk", "nordisk", "minimalistisk", "natur", "eg"],
  "modern":       ["moderne", "minimalistisk"],
  "classic":      ["klassisk", "traditionel"],
  "industrial":   ["industriel", "metal"],
  "bohemian":     ["rattan", "flet", "bambus"],
  "luxury":       ["eksklusiv", "luksus", "velour", "læder"],
  "coastal":      ["hav", "blå", "natur"],
  "minimalist":   ["minimalistisk", "simpel", "hvid"],
};

export function getStyleSearchTerms(designStyle?: string): string[] {
  if (!designStyle) return [];
  return STYLE_TO_TERMS[designStyle.toLowerCase()] ?? [];
}
