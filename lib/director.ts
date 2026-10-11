import { listCategories, type Category } from "./arcade";
import { JEWELRY_PRODUCTS, MAX_PORTFOLIO_IMAGES, MAX_REFERENCE_IMAGES, PRINT_PRODUCTS } from "./limits";
import { chatJSON, isOpenAIConfigured, openAIModel, type OpenAIContent } from "./openai";
import { paletteFromSources } from "./palette";
import { localTaste } from "./taste";
import type { LinePlan, PlanItem, Portfolio, TasteProfile } from "./types";

const HEX = /^#[0-9a-f]{6}$/i;
const PALETTE_COUNT = 8;

const SYSTEM = `You are the creative director of a made-to-order product studio. An artist hands you their portfolio. You read the work closely and plan a small product line that Arcade will manufacture.

Look hard at the images: medium and technique (ink line, gouache, risograph, photography, collage, digital vector), line quality, recurring subjects, composition, scale, color, mood. Everything you write must be specific to this artist. Generic phrases like "vibrant colors" or "unique style" are failures.

brandName: the artist's or studio's name if the text or images show it, otherwise a short name drawn from the work.
tagline: under 8 words.
brief: two sentences on what the work looks and feels like, the way a curator would say it.
palette: exactly 8 colors that are truly in the work, including the smaller accents, not only the dominant fields. Darkest ink first, background last. Use the measured pixel palette as ground truth for hex values, and give each color an evocative name.
motifs: 4 to 6 short concrete motifs that recur in the work.
voice: 3 adjectives, and a 2-sentence sample in the artist's own voice.

products: exactly ${PRINT_PRODUCTS} print products, each in a different category, chosen because the work suits that object. Each prompt goes to Arcade's print-pattern generator together with up to 3 of the artist's images as references. Write it as a description of the artwork to print: subjects and motifs, how they are arranged (all-over repeat, tossed, border, single placement), technique and mark-making, scale, colors by name, background color. 250 to 600 characters. No words, letters, logos or signatures in the art. No product mechanics. Give each product a different take on the work.
referenceImages: the image numbers (1-based) that best match that product's prompt, up to 3. Across the products, use as many different images as you can.

jewelry: exactly ${JEWELRY_PRODUCTS} piece in one of the jewelry categories, chosen to suit the work. Its prompt goes to Arcade's jewelry designer with no images, and must clearly describe a piece of that exact category: the form, metal, stones or enamel, surface texture, and how the artist's motifs become physical shape. 150 to 500 characters.

name: 2 to 4 words in the brand's voice. copy: one or two sentences, at most 30 words, that would sit on a product page.
Never plan apparel.`;

type Directed = {
  brandName: string;
  tagline: string;
  brief: string;
  palette: { name: string; hex: string }[];
  motifs: string[];
  voice: { adjectives: string[]; sample: string };
  products: { category: string; prompt: string; name: string; copy: string; referenceImages: number[] }[];
  jewelry: { category: string; prompt: string; name: string; copy: string };
};

function schema(printNames: string[], jewelryNames: string[]) {
  const str = { type: "string" };
  const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
  return obj({
    brandName: str,
    tagline: str,
    brief: str,
    palette: { type: "array", items: obj({ name: str, hex: str }) },
    motifs: { type: "array", items: str },
    voice: obj({ adjectives: { type: "array", items: str }, sample: str }),
    products: { type: "array", items: obj({ category: { type: "string", enum: printNames }, prompt: str, name: str, copy: str, referenceImages: { type: "array", items: { type: "integer" } } }) },
    jewelry: obj({ category: { type: "string", enum: jewelryNames }, prompt: str, name: str, copy: str }),
  });
}

/** Spread references so each print product sees a different set of up to three images. */
export function rotateReferences(index: number, imageCount: number): number[] {
  if (!imageCount) return [];
  const picks = Array.from({ length: MAX_REFERENCE_IMAGES }, (_, k) => (index * MAX_REFERENCE_IMAGES + k) % imageCount);
  return [...new Set(picks)];
}

function pickPrint(cats: Category[], prefs: string[], n: number): Category[] {
  const print = cats.filter((c) => c.world === "print");
  const rank = (c: Category) => { const i = prefs.findIndex((pref) => c.name.toLowerCase().includes(pref)); return i < 0 ? prefs.length : i; };
  return [...print].sort((a, b) => rank(a) - rank(b)).slice(0, n);
}

function pickJewelry(cats: Category[], prompt: string): Category | undefined {
  const jewelry = cats.filter((c) => c.world === "jewelry");
  const text = prompt.toLowerCase();
  return jewelry.find((c) => c.name.toLowerCase().split(/\s+/).some((word) => word.length > 3 && text.includes(word.replace(/s$/, "")))) ?? jewelry[0];
}

/** Arcade's category photo for prints. Jewelry has none in the API, so it uses Arcade's jewelry tiles in /public/categories. */
export function previewFor(c: Category): string | null {
  if (c.world === "print") return c.imageUrl;
  const group = `${c.category?.name ?? ""} ${c.name}`.toLowerCase();
  if (group.includes("earring")) return "/categories/earrings.jpg";
  if (group.includes("necklace") || group.includes("pendant")) return "/categories/necklaces.jpg";
  return "/categories/rings.jpg";
}

const titled = (value: string) => value.replace(/^\w/, (c) => c.toUpperCase());

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sameColor(a: string, b: string) {
  const [ar, ag, ab] = hexRgb(a);
  const [br, bg, bb] = hexRgb(b);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2 < 28 * 28;
}

/** Named colors first, then measured swatches that are actually different, up to eight. */
function takePalette(named: { name: string; hex: string }[], measured: { name: string; hex: string }[]) {
  const out: { name: string; hex: string }[] = [];
  for (const swatch of [...named, ...measured]) {
    const hex = swatch.hex.trim();
    if (!HEX.test(hex) || out.some((have) => sameColor(have.hex, hex))) continue;
    out.push({ name: swatch.name.trim() || hex, hex });
    if (out.length >= PALETTE_COUNT) break;
  }
  return out.sort((a, b) => {
    const [ar, ag, ab] = hexRgb(a.hex);
    const [br, bg, bb] = hexRgb(b.hex);
    return (ar * 299 + ag * 587 + ab * 114) - (br * 299 + bg * 587 + bb * 114);
  });
}

async function rulesPlan(p: Portfolio, cats: Category[]): Promise<LinePlan> {
  const rules = await localTaste(p);
  const { taste } = rules;
  const colors = taste.palette.slice(0, 3).map((swatch) => swatch.name.toLowerCase()).join(", ");
  const items: PlanItem[] = pickPrint(cats, rules.preferredCategories, PRINT_PRODUCTS).map((c, i) => {
    const motif = taste.motifs[i % Math.max(taste.motifs.length, 1)] ?? "the studio mark";
    return {
      key: `print-${i}`, world: "print", categoryId: c.categoryId, categoryName: c.name,
      prompt: rules.patternPrompts[i % rules.patternPrompts.length],
      name: `${titled(motif)} ${c.name.replace(/s$/, "")}`,
      copy: `${taste.brandName} ${c.name.toLowerCase()} carrying ${motif}, in ${colors}. Made to order.`,
      referenceIndexes: rotateReferences(i, p.images.length),
      previewUrl: previewFor(c),
    };
  });
  const jewelry = pickJewelry(cats, rules.jewelryPrompt);
  if (jewelry) items.push({
    key: "jewelry-0", world: "jewelry", categoryId: jewelry.categoryId, categoryName: jewelry.name, prompt: rules.jewelryPrompt,
    name: `${titled(taste.motifs[0] ?? "Studio")} ${jewelry.name.replace(/s$/, "")}`,
    copy: `${taste.brandName}'s ${taste.motifs[0] ?? "mark"}, cast as a ${jewelry.name.toLowerCase().replace(/s$/, "")}. Made to order.`,
    referenceIndexes: [],
    previewUrl: previewFor(jewelry),
  });
  return { taste, items, director: "rules" };
}

async function openAIPlan(p: Portfolio, cats: Category[], measured: { name: string; hex: string }[]): Promise<LinePlan> {
  const print = cats.filter((c) => c.world === "print");
  const jewelry = cats.filter((c) => c.world === "jewelry");
  const content: OpenAIContent[] = [{
    type: "text",
    text: [
      `Portfolio: ${p.url}`,
      `Title: ${p.title}`,
      p.description && `Description: ${p.description}`,
      p.text && `Page text: ${p.text.slice(0, 3000)}`,
      measured.length ? `Measured pixel palette: ${measured.map((c) => c.hex).join(", ")}` : "",
      `${p.images.length} portfolio images follow, numbered.`,
    ].filter(Boolean).join("\n"),
  }];
  p.images.forEach((url, i) => {
    content.push({ type: "text", text: `Image ${i + 1}:` });
    content.push({ type: "image_url", image_url: { url, detail: "low" } });
  });

  const out = await chatJSON<Directed>(SYSTEM, content, "product_line", schema(print.map((c) => c.name), jewelry.map((c) => c.name)));

  const palette = takePalette(out.palette, measured);
  const taste: TasteProfile = {
    brandName: out.brandName.trim() || "Studio",
    tagline: out.tagline.trim(),
    brief: out.brief.trim(),
    palette: palette.length >= 3 ? palette : measured.slice(0, PALETTE_COUNT),
    motifs: out.motifs.map((m) => m.trim()).filter(Boolean).slice(0, 6),
    voice: { adjectives: out.voice.adjectives.slice(0, 3), sample: out.voice.sample.trim() },
  };

  const used = new Set<string>();
  const items: PlanItem[] = [];
  for (const product of out.products) {
    const c = print.find((cat) => cat.name === product.category);
    if (!c || used.has(c.categoryId) || items.length >= PRINT_PRODUCTS) continue;
    used.add(c.categoryId);
    const refs = [...new Set(product.referenceImages.map((n) => n - 1).filter((n) => n >= 0 && n < p.images.length))].slice(0, MAX_REFERENCE_IMAGES);
    items.push({
      key: `print-${items.length}`, world: "print", categoryId: c.categoryId, categoryName: c.name,
      prompt: product.prompt.trim(), name: product.name.trim(), copy: product.copy.trim(),
      referenceIndexes: refs.length ? refs : rotateReferences(items.length, p.images.length),
      previewUrl: previewFor(c),
    });
  }
  if (!items.length) throw new Error("OpenAI planned no usable print products");
  const j = jewelry.find((cat) => cat.name === out.jewelry.category) ?? jewelry[0];
  if (j) items.push({
    key: "jewelry-0", world: "jewelry", categoryId: j.categoryId, categoryName: j.name,
    prompt: out.jewelry.prompt.trim(), name: out.jewelry.name.trim(), copy: out.jewelry.copy.trim(), referenceIndexes: [],
    previewUrl: previewFor(j),
  });
  return { taste, items, director: "openai" };
}

/** Read the portfolio and plan the line. GPT directs when OPENAI_API_KEY is set; rules otherwise or on failure. */
export async function directLine(p: Portfolio): Promise<LinePlan & { notice?: string }> {
  const portfolio = { ...p, images: p.images.slice(0, MAX_PORTFOLIO_IMAGES) };
  const cats = await listCategories();
  if (!isOpenAIConfigured()) return rulesPlan(portfolio, cats);
  try {
    const measured = await paletteFromSources(portfolio.images, PALETTE_COUNT);
    return await openAIPlan(portfolio, cats, measured);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`OpenAI director (${openAIModel()}) failed, using rules:`, reason);
    return { ...(await rulesPlan(portfolio, cats)), notice: `GPT could not plan this line (${reason.slice(0, 160)}). Used rules instead.` };
  }
}
