import { createPattern, getPattern, getProduct, isArcadeMock, listCategories, createProduct, type Category } from "./arcade";
import { heroImage, isFalMock, lifestyleShot } from "./fal";
import type { Collection, CollectionItem, TasteProfile } from "./types";

const patternImage = (p: Record<string, unknown>) =>
  (p.imageUrl as string) ?? (p.images as { url: string }[] | undefined)?.[0]?.url ?? (p.image as { url?: string } | undefined)?.url ?? "";

const APPAREL = /\b(apparel|clothing|garments?|streetwear|graphics?|merch|tees?|t-?shirts?|shirts?|hoodies?|sweatshirts?|jackets?|outerwear|hats?|caps|jerseys?|tops|bombers?)\b/i;
const HOME_PRINT = ["scarf", "pillow", "napkin", "table linen", "lampshade"];

/** Arcade has no apparel. Graphic and clothing work becomes home goods, still chosen from categories/list. */
export function preferencesForArcade(taste: Pick<TasteProfile, "preferredCategories" | "motifs" | "patternPrompts" | "jewelryPrompt">): string[] {
  const blob = [...taste.preferredCategories, ...taste.motifs, ...taste.patternPrompts, taste.jewelryPrompt].join("\n");
  const apparel = APPAREL.test(blob);
  const kept = taste.preferredCategories.map((pref) => pref.trim().toLowerCase()).filter((pref) => pref && !APPAREL.test(pref));
  return [...new Set(apparel ? [...HOME_PRINT, ...kept] : kept)];
}

function pickCategories(cats: Category[], prefs: string[], n = 4): Category[] {
  const print = cats.filter((c) => c.world === "print");
  const scored = print.map((c) => {
    const name = c.name.toLowerCase();
    return { c, s: prefs.findIndex((pref) => name.includes(pref)) };
  });
  const matched = scored.filter((item) => item.s >= 0).sort((a, b) => a.s - b.s).map((item) => item.c);
  const rest = scored.filter((item) => item.s < 0).map((item) => item.c);
  return [...matched, ...rest].slice(0, n);
}

function pickJewelry(cats: Category[], prompt: string): Category | undefined {
  const jewelry = cats.filter((c) => c.world === "jewelry");
  const text = prompt.toLowerCase();
  const hinted = jewelry.find((c) => {
    const word = c.name.toLowerCase().split(/\s+/).find((part) => part.length > 2) ?? "";
    return word.length > 2 && text.includes(word);
  });
  return hinted ?? jewelry[0];
}

function copyFor(t: TasteProfile, category: string, i: number): { name: string; copy: string } {
  const motif = t.motifs[i % Math.max(t.motifs.length, 1)] ?? "the studio mark";
  const titled = motif.replace(/^\w/, (c) => c.toUpperCase());
  const colors = t.palette.slice(0, 3).map((swatch) => swatch.name.toLowerCase()).join(", ");
  return {
    name: `${t.brandName} ${titled} ${category}`,
    copy: `${t.brandName} ${category.toLowerCase()} carries ${motif}, in ${colors}. Made to order.`,
  };
}

export async function refreshArtwork(items: { productId: string; patternId: string }[]) {
  return Promise.all(items.map(async (item) => {
    const [product, pattern] = await Promise.all([
      getProduct(item.productId).catch(() => null),
      item.patternId ? getPattern(item.patternId).catch(() => null) : Promise.resolve(null),
    ]);
    const fromPattern = pattern ? patternImage(pattern as Record<string, unknown>) : "";
    return { productId: item.productId, imageUrl: product?.images?.[0]?.url || fromPattern };
  }));
}

export async function generateCollection(t: TasteProfile, opts: { referenceIds?: string[]; modelId?: string; maxPrint?: number } = {}): Promise<Collection> {
  const colors = t.palette.map((swatch) => swatch.hex).filter((hex) => /^#[0-9a-f]{6}$/i.test(hex));
  const cats = await listCategories();
  const printCats = pickCategories(cats, preferencesForArcade(t), opts.maxPrint ?? 4);
  const jewelry = pickJewelry(cats, t.jewelryPrompt);

  // 1) print patterns. Jewelry never receives references, colors, or a model.
  const refs = opts.referenceIds?.filter(Boolean).slice(0, 3);
  const modelId = opts.modelId?.trim() || undefined;
  const patterns = await Promise.all(t.patternPrompts.map((prompt) =>
    createPattern({ prompt, colors, ...(refs?.length ? { referenceIds: refs } : {}), ...(modelId ? { modelId } : {}) }).then((j) => String(j.result?.patternId))));
  const patternImgs = await Promise.all(patterns.map(async (id) => patternImage(await getPattern(id) as Record<string, unknown>)));

  // 2) print products across categories (rotate patterns)
  const printItems = await Promise.all(printCats.map(async (c, i): Promise<CollectionItem> => {
    const pi = i % patterns.length;
    const prod = await createProduct(patterns[pi], c.categoryId);
    return {
      productId: prod.productId, categoryId: c.categoryId, categoryName: c.name, world: "print", patternId: patterns[pi],
      imageUrl: prod.images?.[0]?.url ?? patternImgs[pi], price: prod.price ?? null, maker: prod.maker?.name ?? null, ...copyFor(t, c.name, i),
    };
  }));

  // 3) one jewelry piece (design + build in one job)
  const items = [...printItems];
  if (jewelry) {
    const job = await createPattern({ prompt: t.jewelryPrompt, categoryId: jewelry.categoryId });
    const prod = await getProduct(String(job.result?.productId));
    items.push({
      productId: prod.productId, categoryId: jewelry.categoryId, categoryName: jewelry.name, world: "jewelry", patternId: String(job.result?.patternId),
      imageUrl: prod.images?.[0]?.url ?? "", price: prod.price ?? null, maker: prod.maker?.name ?? null, ...copyFor(t, jewelry.name, items.length),
    });
  }

  // Re-fetch pattern and product images. Arcade URLs are short-lived.
  const fresh = await refreshArtwork(items.map((item) => ({ productId: item.productId, patternId: item.patternId })));
  items.forEach((item) => {
    const next = fresh.find((shot) => shot.productId === item.productId);
    if (next?.imageUrl) item.imageUrl = next.imageUrl;
  });

  // Fal lifestyle shots only when FAL_KEY is set. Otherwise the storefront uses Arcade art.
  let heroUrl: string | undefined;
  if (!isFalMock()) {
    const [hero, ...shots] = await Promise.all([heroImage(t.brandName, t.tagline, colors), ...items.map((it) => lifestyleShot(it.categoryName, t.brandName, t.motifs))]);
    heroUrl = hero ?? undefined;
    items.forEach((it, i) => { if (shots[i]) it.lifestyleUrl = shots[i]!; });
  }

  return { items, heroUrl, mock: { arcade: isArcadeMock(), claude: false, fal: false } };
}
