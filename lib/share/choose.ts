import type { Category } from "@/lib/arcade";

/** Arcade Studio. products/get does not return a product page URL. */
export const ARCADE_LIBRARY_URL = "https://studio.arcade.ai";

const ARCADE_HOST = /(^|\.)arcade\.ai$/i;

/** Prefer a real Arcade URL on the product, otherwise Studio, where the account's products live. */
export function arcadeLink(product: object): string {
  const record = product as Record<string, unknown>;
  for (const key of ["productUrl", "url", "studioUrl", "href", "webUrl"]) {
    const value = record[key];
    if (typeof value !== "string" || !isArcadeWebUrl(value)) continue;
    return value;
  }
  return ARCADE_LIBRARY_URL;
}

function isArcadeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ARCADE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/** The reference guides color, texture, and mood. The product is an original. */
export function inspiredPrompt(userPrompt: string) {
  const ask = userPrompt.trim().replace(/\s+/g, " ").slice(0, 700);
  const frame = "Use the reference only as a style reference for color, texture, and mood. Design an original product. Do not copy the reference, its composition, any logo, or any identifiable artwork.";
  return `${ask}\n\n${frame}`.slice(0, 1000);
}

/**
 * Use the requested print category, otherwise the print category whose name the prompt names.
 * Decorative Pillows when nothing matches.
 */
export function chooseCategory(items: Category[], prompt: string, categoryId?: string | null): Category {
  const prints = items.filter((item) => item.world === "print");
  if (!prints.length) throw new Error("Arcade has no print categories right now.");
  if (categoryId) {
    const chosen = prints.find((item) => item.categoryId === categoryId);
    if (chosen) return chosen;
    const other = items.find((item) => item.categoryId === categoryId);
    if (other?.world === "jewelry") throw new Error("That category is jewelry. A share becomes an original print, with your image as a style reference.");
    throw new Error("That category is not available.");
  }
  const text = prompt.toLowerCase();
  const promptStems = new Set(words(text).map(stem));
  let best: Category | null = null;
  let bestScore = 0;
  for (const item of prints) {
    const name = item.name.toLowerCase();
    let score = 0;
    if (text.includes(name)) score += 12;
    for (const word of words(name)) {
      const rooted = stem(word);
      if (promptStems.has(rooted) || text.includes(word) || text.includes(rooted)) score += 4;
    }
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  if (best && bestScore > 0) return best;
  return prints.find((item) => /decorative pillows/i.test(item.name))
    ?? prints.find((item) => /pillow/i.test(item.name))
    ?? prints[0];
}

function words(value: string) {
  return value.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
}

/** pillows/pillow, scarves/scarf, napkins/napkin. */
function stem(word: string) {
  if (word.endsWith("ves")) return `${word.slice(0, -3)}f`;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 4) return word.slice(0, -1);
  return word;
}

export function aspectFromSize(size: string): number | undefined {
  const match = size.match(/(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return undefined;
  return width / height;
}

export function targetRatio(selections: Record<string, string>): number | undefined {
  const entries = Object.entries(selections);
  const preferred = entries.filter(([key]) => /size|dimension/i.test(key));
  for (const [, value] of preferred.length ? preferred : entries) {
    const ratio = aspectFromSize(value);
    if (ratio) return ratio;
  }
  return undefined;
}

export interface PatternFit {
  mode: "crop";
  zoomLevel: 1;
  crop: { left: number; top: number; width: number; height: number };
}

/** Center-crop the pattern when its aspect ratio does not match the product size. */
export function cropFit(width: number, height: number, ratio: number): PatternFit | undefined {
  if (!width || !height || !ratio) return undefined;
  const source = width / height;
  if (Math.abs(source - ratio) < 0.03) return undefined;
  let cropW = width;
  let cropH = height;
  if (source > ratio) cropW = Math.round(height * ratio);
  else cropH = Math.round(width / ratio);
  cropW = Math.max(16, Math.min(width, cropW));
  cropH = Math.max(16, Math.min(height, cropH));
  return {
    mode: "crop",
    zoomLevel: 1,
    crop: {
      left: Math.max(0, Math.floor((width - cropW) / 2)),
      top: Math.max(0, Math.floor((height - cropH) / 2)),
      width: cropW,
      height: cropH,
    },
  };
}
