import { mockCall } from "./mock";
import type { Category, Checkout, CreatePatternInput, Job, Order, Pattern, Product } from "./types";

const BASE = process.env.ARCADE_BASE_URL ?? "https://platform.arcade.ai/v1";
export const ARCADE_USER_AGENT = "productline/1.0";
export const isArcadeMock = () => !process.env.ARCADE_API_KEY;
export const rid = (p = "pl") => `${p}-${crypto.randomUUID()}`;

export class ArcadeError extends Error {
  constructor(public status: number, public code: string, msg: string) { super(msg); }
}

const RETRYABLE = new Set([409, 429, 500, 502, 503, 504]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST a procedure. 409, 429 and 5xx are retried with the same body, so the requestId keeps it idempotent. */
export async function call<T>(path: string, body: Record<string, unknown> = {}, attempts = 3): Promise<T> {
  if (isArcadeMock()) return (await mockCall(path, body)) as T;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.ARCADE_API_KEY}`, "Content-Type": "application/json", "User-Agent": ARCADE_USER_AGENT },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text) as T;
    let code = "";
    let message = text;
    try { ({ code = "", message = text } = JSON.parse(text)); } catch { /* not JSON */ }
    if (RETRYABLE.has(res.status) && attempt < attempts) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * attempt);
      continue;
    }
    throw new ArcadeError(res.status, code, `Arcade ${path} ${res.status}: ${message}`);
  }
}

export const getJob = (jobId: string) => call<Job>("jobs/get", { jobId });

export async function waitForJob(jobId: string, { intervalMs = isArcadeMock() ? 200 : 3000, timeoutMs = 5 * 60_000 } = {}): Promise<Job> {
  const start = Date.now();
  for (;;) {
    const job = await getJob(jobId);
    if (job.status === "succeeded") return job;
    if (job.status === "failed") throw new Error(job.error?.message ?? `Job ${jobId} failed`);
    if (Date.now() - start > timeoutMs) throw new Error(`Job ${jobId} timed out`);
    await wait(intervalMs);
  }
}

export const listCategories = async () => (await call<{ items: Category[] }>("categories/list", {})).items;

/** Jewelry is prompt + categoryId only. Print may add references, palette colors, and a modelId. */
export function patternBody(input: CreatePatternInput, requestId = rid("pat")): Record<string, unknown> {
  const prompt = input.prompt.slice(0, 1000);
  if (input.world === "jewelry") return { requestId, prompt, categoryId: input.categoryId };
  const referenceIds = input.referenceIds?.filter(Boolean).slice(0, 3);
  return {
    requestId,
    prompt,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(referenceIds?.length ? { referenceIds } : {}),
    ...(input.colors?.length ? { colors: input.colors } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
  };
}

/** Starts a pattern job. With a categoryId the job also builds the product. */
export const startPattern = (input: CreatePatternInput) => call<Job>("patterns/create", patternBody(input, input.requestId));
export const getPattern = (patternId: string) => call<Pattern>("patterns/get", { patternId });
export const getProduct = (productId: string) => call<Product>("products/get", { productId });

type UploadTicket = { uploadId: string; uploadUrl: string; requiredHeaders: Record<string, string> };

/** references/createUpload, PUT the bytes, then references/create. */
export async function uploadReferenceImage(bytes: Buffer, mediaType: string): Promise<string> {
  const ticket = await call<UploadTicket>("references/createUpload", { requestId: rid("upl"), mediaType, byteLength: bytes.length });
  if (!isArcadeMock()) {
    const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": mediaType, ...ticket.requiredHeaders }, body: new Uint8Array(bytes) });
    if (!put.ok) throw new Error(`Reference upload failed (${put.status})`);
  }
  const created = await call<{ referenceId: string }>("references/create", { requestId: rid("ref"), uploadId: ticket.uploadId });
  return created.referenceId;
}

/** Quantity 1 cannot check out unless dropShip is true. */
export function checkoutBody(lines: { productId: string; quantity: number }[]) {
  const dropShip = lines.some((line) => Number(line.quantity) === 1);
  return { lines, dropShip };
}

export const createCheckout = (lines: { productId: string; quantity: number }[]) =>
  call<Checkout>("checkouts/create", { requestId: rid("co"), ...checkoutBody(lines) });
export const getOrder = (q: { checkoutId?: string; orderId?: string }) => call<Order>("orders/get", q);
