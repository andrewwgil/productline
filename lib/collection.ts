import { createPattern, createProduct, getPattern, getProduct, isArcadeMock, listCategories, type Category } from "./arcade";
import { heroImage, isFalMock, lifestyleShot } from "./fal";
import { isClaudeMock } from "./taste";
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
  const motif = t.motifs[i % t.motifs.length];
  return {
    name: `${t.brandName} ${["No. 1", "Spark", "Loop", "Draft", "Signal"][i % 5]} ${category}`,
    copy: `${t.voice.sample.split(".")[0]}. ${motif.replace(/^\w/, (c) => c.toUpperCase())}, in ${t.palette.slice(0, 3).map((p) => p.name.toLowerCase()).join(", ")}, made to order.`,
  };
}

export async function generateCollection(t: TasteProfile, opts: { referenceIds?: string[]; maxPrint?: number } = {}): Promise<Collection> {
  const colors = t.palette.map((p) => p.hex);
  const cats = await listCategories();
  const printCats = pickCategories(cats, preferencesForArcade(t), opts.maxPrint ?? 4);
  const jewelry = pickJewelry(cats, t.jewelryPrompt);

  // 1) patterns, in parallel
  const refs = opts.referenceIds?.filter(Boolean).slice(0, 3);
  const patterns = await Promise.all(t.patternPrompts.map((prompt) =>
    createPattern({ prompt, colors, ...(refs?.length ? { referenceIds: refs } : {}) }).then((j) => String(j.result?.patternId))));
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

  // 4) Fal media (optional)
  const [heroUrl, ...shots] = await Promise.all([heroImage(t.brandName, t.tagline, colors), ...items.map((it) => lifestyleShot(it.categoryName, t.brandName, t.motifs))]);
  items.forEach((it, i) => { if (shots[i]) it.lifestyleUrl = shots[i]!; });

  return { items, heroUrl: heroUrl ?? undefined, mock: { arcade: isArcadeMock(), claude: isClaudeMock(), fal: isFalMock() } };
}
