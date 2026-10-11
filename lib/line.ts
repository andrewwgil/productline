import { ArcadeError, getJob, getPattern, getProduct, rid, startPattern } from "./arcade";
import type { PlanItem, ProductCard } from "./types";

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Start one Arcade job that designs the pattern and builds the product.
 * Print sends its references, palette and optional modelId. Jewelry sends prompt + categoryId only.
 * If Arcade rejects a jewelry prompt for its category (400), retry once with a plain prompt for that category.
 */
export async function startItem(item: PlanItem, opts: { referenceIds: string[]; colors: string[]; modelId?: string; motifs: string[] }): Promise<{ jobId: string; prompt: string }> {
  const base = { prompt: item.prompt, world: item.world, categoryId: item.categoryId, requestId: rid(item.world === "jewelry" ? "jwl" : "prt") };
  if (item.world === "print") {
    const job = await startPattern({ ...base, referenceIds: opts.referenceIds, colors: opts.colors.filter((hex) => HEX.test(hex)), modelId: opts.modelId });
    return { jobId: job.jobId, prompt: item.prompt };
  }
  try {
    const job = await startPattern(base);
    return { jobId: job.jobId, prompt: item.prompt };
  } catch (err) {
    if (!(err instanceof ArcadeError) || err.status !== 400) throw err;
    const plain = `A ${item.categoryName.toLowerCase().replace(/s$/, "")} inspired by ${opts.motifs.slice(0, 2).join(" and ") || "the artist's work"}, polished gold, clean and wearable`;
    const job = await startPattern({ ...base, prompt: plain, requestId: rid("jwl") });
    return { jobId: job.jobId, prompt: plain };
  }
}

const SPEC_LINE = /^\s*[-*•]\s*([^:]{2,40}):\s*(.+)$/;

/** Split Arcade's description into its intro paragraph and "- Label: Value" spec lines. */
export function parseDescription(text: string | null | undefined): { intro: string; specs: { label: string; value: string }[] } {
  const specs: { label: string; value: string }[] = [];
  const rest: string[] = [];
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = line.match(SPEC_LINE);
    if (m) specs.push({ label: m[1].trim(), value: m[2].trim() });
    else rest.push(line);
  }
  return { intro: rest.join("\n").trim(), specs };
}

/** Arcade sends care for every fabric in the category, one "**Fabric**" block each. Keep the blocks for this product's fabric. */
export function careFor(text: string | undefined, specs: { value: string }[]): string {
  const care = (text ?? "").trim();
  const blocks = care.split(/\r?\n\s*\r?\n/);
  const values = specs.map((spec) => spec.value.toLowerCase());
  const mine = blocks.filter((block) => {
    const head = block.match(/^\s*\*\*([^*]+?):?\*\*/)?.[1]?.trim().toLowerCase();
    return head ? values.some((value) => value.includes(head) || head.includes(value)) : false;
  });
  return mine.length ? mine.join("\n\n") : care;
}

export async function productCard(productId: string): Promise<ProductCard> {
  const product = await getProduct(productId);
  const pattern = product.patternId ? await getPattern(product.patternId).catch(() => null) : null;
  const imageUrl = product.imageUrl || product.images?.[0]?.url || pattern?.imageUrl || "";
  const amount = Number(product.unitPrice?.amount);
  const { intro, specs } = parseDescription(product.description);
  const discounts = (product.volumeDiscounts?.tiers ?? [])
    .map((tier) => ({ minSpend: Number(tier.minimumSpend), percent: Number(tier.discountPercent) }))
    .filter((tier) => Number.isFinite(tier.minSpend) && tier.percent > 0);
  return {
    productId: product.productId,
    patternId: product.patternId,
    title: product.title,
    imageUrl,
    images: (product.images ?? []).map((img) => img.url).filter(Boolean),
    price: product.unitPrice && Number.isFinite(amount) ? { amount, currency: product.unitPrice.currency ?? "USD" } : null,
    maker: product.maker?.name ?? null,
    patternImageUrl: pattern?.imageUrl ?? null,
    intro,
    specs,
    care: careFor(product.careInstructions, specs),
    discounts,
  };
}

export type ItemStatus = { status: "running" } | { status: "failed"; error: string } | { status: "succeeded"; product: ProductCard };

export async function itemStatus(jobId: string): Promise<ItemStatus> {
  const job = await getJob(jobId);
  if (job.status === "running") return { status: "running" };
  if (job.status === "failed") return { status: "failed", error: job.error?.message ?? "Arcade could not make this product" };
  const productId = job.result?.productId;
  if (!productId) return { status: "failed", error: "Arcade finished without a product" };
  return { status: "succeeded", product: await productCard(String(productId)) };
}
