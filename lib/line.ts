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

export async function productCard(productId: string): Promise<ProductCard> {
  const product = await getProduct(productId);
  let imageUrl = product.imageUrl || product.images?.[0]?.url || "";
  if (!imageUrl && product.patternId) imageUrl = (await getPattern(product.patternId).catch(() => null))?.imageUrl ?? "";
  const amount = Number(product.unitPrice?.amount);
  return {
    productId: product.productId,
    patternId: product.patternId,
    title: product.title,
    imageUrl,
    images: (product.images ?? []).map((img) => img.url).filter(Boolean),
    price: product.unitPrice && Number.isFinite(amount) ? { amount, currency: product.unitPrice.currency ?? "USD" } : null,
    maker: product.maker?.name ?? null,
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
