/**
 * Prize-wheel catalog data shared by the server route and the cabinet.
 * No Node or Arcade calls in this file.
 */

export const TAU = Math.PI * 2;

export type TierId = "20" | "50";
export type PriceSource = "observed" | "mock" | "guess";
export type World = "print" | "jewelry";

export const TIERS: { id: TierId; label: string; max: number }[] = [
  { id: "20", label: "Under $20", max: 20 },
  { id: "50", label: "Under $50", max: 50 },
];

export type PrizeCategory = {
  categoryId: string;
  name: string;
  world: World;
  /** USD (or `currency`) used to filter the item wheel. */
  price: number;
  currency: string;
  /**
   * `observed`: products/get on a real product in this category.
   * `mock`: the price lib/arcade/mock.ts will return for this category.
   * `guess`: BEST_GUESS_USD below. Not a quote from Arcade.
   */
  priceSource: PriceSource;
};

export type PrizeModel = { modelId: string; name: string; synthetic: boolean };
export type PrizePalette = { id: string; name: string; colors: string[] };

export type Catalog = {
  mock: boolean;
  priceNote: string;
  tiers: typeof TIERS;
  categories: PrizeCategory[];
  models: PrizeModel[];
  palettes: PrizePalette[];
};

export type PrizeProduct = {
  productId: string;
  title: string;
  imageUrl: string;
  price: { amount: number; currency: string } | null;
  arcadeUrl: string;
  categoryName: string;
  styleName: string;
  paletteName: string;
  colors: string[];
  world: World;
};

/** "Under $20" / "Under $50": the price must be strictly below the cap. */
export function fitsTier(amount: number, max: number) {
  return Number.isFinite(amount) && amount < max;
}

export function tierById(id: string) {
  return TIERS.find((tier) => tier.id === id);
}

export function mod(value: number, n: number) {
  return ((value % n) + n) % n;
}

/**
 * Wheel rotation that parks segment `index` under the top pointer.
 * Segment 0 sits on +X and angles increase counter-clockwise, matching the wheel texture.
 * The spin always travels forward.
 */
export function forwardLanding(current: number, index: number, count: number, extraTurns: number) {
  if (count < 1) return current;
  const slice = TAU / count;
  const desired = mod(Math.PI / 2 - (index + 0.5) * slice, TAU);
  let delta = desired - mod(current, TAU);
  if (delta < 0.001) delta += TAU;
  const turns = Math.max(0, extraTurns);
  return current + turns * TAU + delta;
}

export function displayName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (/\s/.test(trimmed) && /[A-Z]/.test(trimmed)) return trimmed;
  return trimmed.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * BEST-GUESS retail USD for an Arcade category.
 *
 * categories/list and products/list do not include unitPrice. The only live price
 * is products/get, and only after a product exists. Until then the wheel uses this
 * table. Observed products/get prices replace it (see prize-server.ts).
 *
 * Rows that match lib/arcade/mock.ts use that file's prices so the demo and the
 * mock product agree. Every other row is an estimate of typical Arcade retail for
 * that kind of good, not a number returned by the API.
 */
const BEST_GUESS_USD: { test: RegExp; usd: number }[] = [
  { test: /ribbon scarf|skinny scarf|hair scarf/, usd: 46 },
  { test: /cocktail napkin/, usd: 32 },
  { test: /tea towel|dish towel|kitchen towel/, usd: 38 },
  { test: /decorative pillow|throw pillow|pillow/, usd: 120 },
  { test: /drum lamp|lampshade|lamp shade/, usd: 210 },
  { test: /placemat/, usd: 42 },
  { test: /napkin/, usd: 68 },
  { test: /table runner/, usd: 58 },
  { test: /scarf/, usd: 185 },
  { test: /bandan+a/, usd: 28 },
  { test: /pocket square/, usd: 24 },
  { test: /coaster/, usd: 18 },
  { test: /greeting card|postcard|note card/, usd: 14 },
  { test: /sticker/, usd: 9 },
  { test: /wrapping paper|gift wrap/, usd: 16 },
  { test: /enamel pin|\bpin\b/, usd: 16 },
  { test: /charm/, usd: 18 },
  { test: /earring/, usd: 96 },
  { test: /pendant/, usd: 260 },
  { test: /necklace/, usd: 220 },
  { test: /bracelet/, usd: 180 },
  { test: /\bring\b/, usd: 340 },
  { test: /bedding|duvet|quilt/, usd: 240 },
  { test: /blanket|\bthrow\b/, usd: 140 },
  { test: /\brug\b/, usd: 320 },
  { test: /curtain|drape/, usd: 160 },
  { test: /ceramic|vase/, usd: 88 },
  { test: /towel/, usd: 36 },
];

const GUESS_PRINT_DEFAULT = 64;
const GUESS_JEWELRY_DEFAULT = 200;

export function guessPrice(name: string, world: World) {
  const haystack = name.toLowerCase();
  for (const row of BEST_GUESS_USD) {
    if (row.test.test(haystack)) return row.usd;
  }
  return world === "jewelry" ? GUESS_JEWELRY_DEFAULT : GUESS_PRINT_DEFAULT;
}

/** Used only when models/list is empty (the mock returns none). Never sent as a live modelId. */
export const FALLBACK_MODELS: PrizeModel[] = [
  "Batik",
  "Chinoiserie",
  "Art Nouveau",
  "Japanese Woodblock",
  "Toile",
  "Italian Silk",
  "William Morris",
  "Art Deco",
  "Ikat",
  "Paisley",
  "Shibori",
  "Suzani",
  "Damask",
  "Block Print",
  "Marbled Paper",
  "Persian Miniature",
  "Delft",
  "Kente",
  "Provençal",
  "Liberty Floral",
  "Medieval Illumination",
  "Op Art",
  "Memphis",
  "Secession",
  "Madhubani",
  "Portuguese Tile",
].map((name) => ({
  modelId: `fallback:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  name,
  synthetic: true,
}));

export const PALETTES: PrizePalette[] = [
  { id: "marquee-neon", name: "Marquee Neon", colors: ["#ff2bd6", "#3dfff2", "#ffe56a", "#1a0a24", "#ff6b3d"] },
  { id: "midnight-velvet", name: "Midnight Velvet", colors: ["#2a1848", "#6b2d5b", "#c9a36a", "#f3e6d0", "#140e18"] },
  { id: "citrus-peel", name: "Citrus Peel", colors: ["#f26b1d", "#f2c14e", "#5c8a3a", "#fff4e0", "#7a2e12"] },
  { id: "ink-ivory", name: "Ink and Ivory", colors: ["#14120f", "#f4efe6", "#5c564c", "#b7a99a", "#8c2f2f"] },
  { id: "riviera", name: "Riviera", colors: ["#1f6f8b", "#f26d6d", "#f4d7b0", "#f7f3ea", "#0e3a4a"] },
  { id: "forest-floor", name: "Forest Floor", colors: ["#2f4a34", "#8a9a5b", "#c4a46a", "#6b3e2e", "#e7e1d1"] },
  { id: "rouge-atelier", name: "Rouge Atelier", colors: ["#8e1d2c", "#e7b7b0", "#1c1a17", "#d4a054", "#f6f1ea"] },
  { id: "porcelain", name: "Porcelain", colors: ["#d7e4ea", "#e7c1c8", "#b7c7b0", "#f7f5f2", "#6d7c8a"] },
];

export const CARNIVAL = ["#c81d4a", "#f2c14e", "#1f7a6b", "#e07a2f", "#3d4c9e", "#d4527a", "#7a2ea0", "#efe6d4", "#0e6b8a", "#b6432f"];

const HEX = /^#[0-9a-f]{6}$/i;

export function paletteColors(colors: string[]) {
  return colors.filter((hex) => HEX.test(hex)).slice(0, 6);
}
