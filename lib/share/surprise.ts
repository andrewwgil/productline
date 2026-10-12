import type { Category } from "@/lib/arcade";

export interface ImageCue {
  width: number;
  height: number;
  palette: string[];
  mood: string;
}

/** The sentence every surprise starts from. Jewelry adds mood in the same string. */
export function autoPrompt(categoryName: string, image?: Partial<ImageCue>, jewelry = false) {
  const name = categoryName.trim().toLowerCase();
  let prompt = `An original ${name} inspired by the colors, texture and mood of this reference`;
  if (jewelry) {
    const mood = image?.mood?.trim();
    const colors = (image?.palette ?? []).filter(Boolean).slice(0, 4).join(", ");
    const felt = [mood, colors ? `a palette of ${colors}` : ""].filter(Boolean).join(", ");
    if (felt) prompt += `. The reference feels like ${felt}`;
    prompt += ". A wearable piece in metal that suits that mood";
  }
  return prompt.slice(0, 700);
}

const LABELS: [RegExp, string][] = [
  [/scarf/, "a silk scarf"],
  [/pillow/, "a pillow"],
  [/napkin/, "dinner napkins"],
  [/placemat|place mat/, "a placemat"],
  [/lampshade|lamp shade/, "a lampshade"],
  [/towel/, "a tea towel"],
  [/pendant|necklace/, "a pendant"],
  [/\bring/, "a ring"],
];

/** Singular, spoken label for the reveal. */
export function surpriseLabel(name: string) {
  const text = name.toLowerCase();
  for (const [pattern, label] of LABELS) {
    if (pattern.test(text)) return label;
  }
  return `a ${text}`;
}

export function revealLine(name: string, price: string | null) {
  const label = surpriseLabel(name);
  return price ? `Your surprise: ${label}, ${price}` : `Your surprise: ${label}`;
}

function named(name: string, pattern: RegExp) {
  return pattern.test(name.toLowerCase());
}

/** Higher when the category suits the picture. Names only, never ids. Floor is 1. */
export function categoryWeight(category: Category, image: ImageCue) {
  const ratio = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
  const mood = (image.mood || "").toLowerCase();
  const wide = ratio > 1.25;
  const tall = ratio < 0.8;
  const square = !wide && !tall;
  let weight = 1;
  if (wide && named(category.name, /placemat|table|runner|towel|scarf/)) weight += 4;
  if (square && named(category.name, /pillow|napkin|lamp/)) weight += 4;
  if (tall && named(category.name, /scarf|pendant|necklace/)) weight += 4;
  if (/vivid|dark/.test(mood) && (category.world === "jewelry" || named(category.name, /scarf/))) weight += 3;
  if (/muted|soft|pale/.test(mood) && named(category.name, /linen|napkin|towel|placemat|pillow/)) weight += 3;
  return Math.max(1, weight);
}

/**
 * A surprise category from the live list. The last three picks are skipped
 * while anything else remains.
 */
export function pickSurprise(categories: Category[], recent: string[], image: ImageCue, rng: () => number = Math.random): Category {
  if (!categories.length) throw new Error("Arcade has no categories right now.");
  const avoid = new Set(recent.filter(Boolean).slice(0, 3));
  let pool = categories.filter((item) => !avoid.has(item.categoryId));
  if (!pool.length) pool = categories;
  const weights = pool.map((item) => categoryWeight(item, image));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
