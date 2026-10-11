import { createPattern, createProduct, getPattern, getProduct, isArcadeMock, listCategories, type Category } from "./arcade";
import { heroImage, isFalMock, lifestyleShot } from "./fal";
import { isClaudeMock } from "./taste";
import type { Collection, CollectionItem, TasteProfile } from "./types";

const patternImage = (p: Record<string, unknown>) =>
  (p.imageUrl as string) ?? (p.images as { url: string }[] | undefined)?.[0]?.url ?? (p.image as { url?: string } | undefined)?.url ?? "";

function pickCategories(cats: Category[], prefs: string[], n = 4): Category[] {
  const print = cats.filter((c) => c.world === "print");
  const scored = print.map((c) => ({ c, s: prefs.findIndex((p) => c.name.toLowerCase().includes(p.toLowerCase())) }));
  return [...scored.filter((x) => x.s >= 0).sort((a, b) => a.s - b.s), ...scored.filter((x) => x.s < 0)].slice(0, n).map((x) => x.c);
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
  const printCats = pickCategories(cats, t.preferredCategories, opts.maxPrint ?? 4);
  const jewelry = cats.find((c) => c.world === "jewelry");

  // 1) patterns, in parallel
  const patterns = await Promise.all(t.patternPrompts.map((prompt) =>
    createPattern({ prompt, colors, referenceIds: opts.referenceIds?.slice(0, 3) }).then((j) => String(j.result?.patternId))));
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
