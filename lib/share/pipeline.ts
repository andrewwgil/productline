import { ArcadeError, call, getJob, getPattern, getProduct, isArcadeMock, listCategories, rid, startPattern, uploadReferenceImage, type CategoryDetail, type Job } from "@/lib/arcade";
import { ARCADE_LIBRARY_URL, arcadeLink, chooseCategory, cropFit, inspiredPrompt, targetRatio, type PatternFit } from "./choose";
import { bytesFromImageUrl, prepareShareImage } from "./image";
import { listShares, loadShare, persistence, rememberShare, saveShare } from "./store";
import type { ShareRecord, ShareStep, ShareView } from "./types";

const inflight = new Map<string, Promise<ShareRecord | null>>();
const TERMINAL = new Set<ShareStep>(["ready", "failed"]);
const SHARE_ID = /^shr_[0-9a-f-]{36}$/;

export class ShareInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function isShareId(id: string) {
  return SHARE_ID.test(id);
}

export function present(record: ShareRecord): ShareView {
  const { store, notice } = persistence();
  return {
    shareId: record.id,
    step: record.step,
    prompt: record.prompt,
    categoryId: record.categoryId,
    categoryName: record.categoryName,
    sourceThumb: record.sourceThumb,
    title: record.title ?? null,
    maker: record.maker ?? null,
    selectionLabel: record.selectionLabel ?? null,
    productId: record.productId ?? null,
    imageUrl: record.productImage ?? null,
    price: record.price ? { amount: record.price.amount, currency: record.price.currency } : null,
    arcadeUrl: record.step === "ready" ? (record.arcadeUrl || ARCADE_LIBRARY_URL) : null,
    error: record.error ?? null,
    warning: record.warning ?? null,
    visited: record.visited,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    store,
    notice,
  };
}

export async function recentShares() {
  return (await listShares()).map(present);
}

function blank(input: { prompt: string; categoryId: string | null; imageBase64: string; sourceThumb: string }): ShareRecord {
  const now = new Date().toISOString();
  return {
    id: `shr_${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    step: "uploading",
    visited: ["uploading"],
    prompt: input.prompt,
    categoryId: input.categoryId,
    categoryName: null,
    sourceThumb: input.sourceThumb,
    imageBase64: input.imageBase64,
    retries: 0,
  };
}

export async function createShare(input: { bytes: Buffer; prompt: string; categoryId?: string | null }) {
  const prompt = input.prompt.trim().replace(/\s+/g, " ").slice(0, 700);
  if (!prompt) throw new ShareInputError("Add a short prompt, like “What would this look like as a pillow?”");
  const prepared = await prepareShareImage(input.bytes);
  const record = blank({ prompt, categoryId: input.categoryId || null, ...prepared });
  await saveShare(record);
  await rememberShare(record.id);
  return record;
}

export async function createShareFromRequest(req: Request) {
  const type = req.headers.get("content-type") || "";
  let prompt = "";
  let categoryId: string | null = null;
  let bytes: Buffer;
  if (type.includes("application/json")) {
    const body = await req.json().catch(() => ({})) as { prompt?: unknown; categoryId?: unknown; imageUrl?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt : "";
    categoryId = typeof body.categoryId === "string" ? body.categoryId : null;
    if (typeof body.imageUrl !== "string" || !body.imageUrl) throw new ShareInputError("Add an imageUrl or upload an image.");
    try {
      bytes = await bytesFromImageUrl(body.imageUrl);
    } catch (err) {
      throw new ShareInputError(err instanceof Error ? err.message : "Could not read that image.");
    }
  } else {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ShareInputError("Upload an image or send JSON with imageUrl.");
    }
    prompt = String(form.get("prompt") ?? "");
    const given = form.get("categoryId");
    categoryId = typeof given === "string" ? given : null;
    const file = form.get("image") ?? form.get("file");
    if (!(file instanceof File) || file.size <= 0) throw new ShareInputError("Add an image.");
    if (file.size > 8 * 1024 * 1024) throw new ShareInputError("That image is too large to upload. It is resized in the browser before it is sent.");
    bytes = Buffer.from(await file.arrayBuffer());
  }
  return createShare({ bytes, prompt, categoryId });
}

/** One step of the pipeline. Safe to call again: request ids are reused, and a lock skips overlapping runs. */
export function tick(id: string): Promise<ShareRecord | null> {
  const existing = inflight.get(id);
  if (existing) return existing;
  const run = advance(id).finally(() => inflight.delete(id));
  inflight.set(id, run);
  return run;
}

async function advance(id: string): Promise<ShareRecord | null> {
  const record = await loadShare(id);
  if (!record) return null;
  if (TERMINAL.has(record.step)) return refreshReady(record);
  if (record.lockUntil && record.lockUntil > Date.now()) return record;
  record.lockUntil = Date.now() + 45_000;
  await saveShare(record);
  try {
    if (record.step === "uploading") await uploadAndStart(record);
    if (record.step === "designing") await design(record);
    if (record.step === "building") await build(record);
    if (record.step !== "failed") record.warning = undefined;
  } catch (err) {
    const info = explain(err);
    if (info.retryable && (record.retries ?? 0) < 8) {
      record.retries = (record.retries ?? 0) + 1;
      record.warning = info.message;
    } else {
      move(record, "failed");
      record.error = info.message;
    }
  } finally {
    record.lockUntil = 0;
    record.updatedAt = new Date().toISOString();
    await saveShare(record);
  }
  return record;
}

async function uploadAndStart(record: ShareRecord) {
  if (!record.referenceId) {
    if (!record.imageBase64) throw new Error("The reference image is missing. Share it again.");
    const bytes = Buffer.from(record.imageBase64, "base64");
    if (!record.uploadRequestId) record.uploadRequestId = rid("upl");
    if (!record.refRequestId) record.refRequestId = rid("ref");
    await saveShare(record);
    try {
      record.referenceId = await uploadReferenceImage(bytes, "image/jpeg", { upload: record.uploadRequestId, create: record.refRequestId });
    } catch (err) {
      // createUpload returns 409 once its upload is saved. A new requestId uploads again; references/create still dedupes.
      if (!(err instanceof ArcadeError) || err.status !== 409) throw err;
      record.uploadRequestId = rid("upl");
      record.refRequestId = rid("ref");
      await saveShare(record);
      record.referenceId = await uploadReferenceImage(bytes, "image/jpeg", { upload: record.uploadRequestId, create: record.refRequestId });
    }
    record.imageBase64 = undefined;
  }
  if (!record.patternRequestId) record.patternRequestId = rid("pat");
  await saveShare(record);
  if (!record.patternJobId) {
    const job = await startPattern({
      prompt: inspiredPrompt(record.prompt),
      world: "print",
      referenceIds: [record.referenceId],
      requestId: record.patternRequestId,
    });
    record.patternJobId = job.jobId;
  }
  move(record, "designing");
  record.retries = 0;
}

async function design(record: ShareRecord) {
  if (!record.patternId) {
    if (!record.patternJobId) {
      move(record, "uploading");
      return;
    }
    const job = await getJob(record.patternJobId);
    if (job.status === "running") return;
    if (job.status === "failed") throw new Error(job.error?.message || "Arcade could not design this.");
    const patternId = job.result?.patternId;
    if (!patternId) throw new Error("Arcade finished the design without a pattern.");
    record.patternId = String(patternId);
    await saveShare(record);
  }
  if (!record.productJobId) await startProduct(record);
  move(record, "building");
  record.retries = 0;
}

async function startProduct(record: ShareRecord) {
  const categories = await listCategories();
  const category = chooseCategory(categories, record.prompt, record.categoryId);
  record.categoryId = category.categoryId;
  record.categoryName = category.name;
  const detail = await call<CategoryDetail>("categories/get", { categoryId: category.categoryId, selections: {} });
  if (!detail.canManufacture) throw new Error(`Arcade can't manufacture the default ${category.name} yet.`);
  if (detail.world !== "print") throw new Error("That category is not a print product.");
  const selections = detail.selections;
  let fit: PatternFit | { mode: "fill" } | undefined;
  const pattern = await getPattern(record.patternId!).catch(() => null);
  const ratio = targetRatio(selections);
  if (pattern?.width && pattern.height && ratio) fit = cropFit(pattern.width, pattern.height, ratio);
  if (!record.productRequestId) record.productRequestId = rid("prd");
  await saveShare(record);
  try {
    record.productJobId = (await createProduct(record, selections, fit)).jobId;
  } catch (err) {
    if (!(err instanceof ArcadeError) || err.status !== 400 || !/fit|aspect/i.test(err.message) || fit) throw err;
    record.productRequestId = rid("prd");
    await saveShare(record);
    record.productJobId = (await createProduct(record, selections, { mode: "fill" })).jobId;
  }
}

function createProduct(record: ShareRecord, selections: Record<string, string>, fit?: PatternFit | { mode: "fill" }) {
  return call<Job>("products/create", {
    requestId: record.productRequestId,
    patternId: record.patternId,
    categoryId: record.categoryId,
    selections,
    ...(fit ? { fit } : {}),
  });
}

async function build(record: ShareRecord) {
  if (!record.productJobId) {
    move(record, "designing");
    return;
  }
  const job = await getJob(record.productJobId);
  if (job.status === "running") return;
  if (job.status === "failed") throw new Error(job.error?.message || "Arcade could not build this product.");
  const productId = job.result?.productId;
  if (!productId) throw new Error("Arcade finished without a product.");
  record.productId = String(productId);
  await fillProduct(record);
  move(record, "ready");
  record.retries = 0;
  record.error = undefined;
  record.warning = undefined;
}

async function fillProduct(record: ShareRecord) {
  if (!record.productId) return;
  const product = await getProduct(record.productId);
  record.productImage = product.imageUrl || product.images?.[0]?.url || record.productImage;
  record.price = product.unitPrice ? { amount: product.unitPrice.amount, currency: product.unitPrice.currency } : null;
  record.title = product.title;
  record.maker = product.maker?.name ?? null;
  record.selectionLabel = product.selectionLabel;
  record.arcadeUrl = arcadeLink(product);
  record.imageFetchedAt = new Date().toISOString();
  if (!record.categoryName) record.categoryName = product.title;
}

async function refreshReady(record: ShareRecord) {
  if (record.step !== "ready" || !record.productId || isArcadeMock()) return record;
  const fetched = Date.parse(record.imageFetchedAt || record.updatedAt);
  if (Date.now() - fetched < 10 * 60_000) return record;
  try {
    await fillProduct(record);
    record.updatedAt = new Date().toISOString();
    await saveShare(record);
  } catch { /* keep the previous image */ }
  return record;
}

function move(record: ShareRecord, step: ShareStep) {
  record.step = step;
  if (!record.visited.includes(step)) record.visited.push(step);
}

function explain(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof ArcadeError) {
    if (err.status === 412) return { message: err.message, retryable: false };
    const retryable = err.status === 409 || err.status === 429 || err.status >= 500;
    return { message: err.message, retryable };
  }
  if (err instanceof ShareInputError) return { message: err.message, retryable: false };
  const message = err instanceof Error ? err.message : String(err);
  return { message, retryable: /timed out|fetch failed|network|ECONN|ETIMEDOUT|429|503|502/i.test(message) };
}
