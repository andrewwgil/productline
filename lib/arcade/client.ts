import { mockCall } from "./mock";
import type { Category, CategoryDetail, Checkout, CreatePatternInput, Job, Order, Pattern, Product, RefineOp } from "./types";

const BASE = process.env.ARCADE_BASE_URL ?? "https://platform.arcade.ai/v1";
export const ARCADE_USER_AGENT = "productline/1.0";
export const isArcadeMock = () => !process.env.ARCADE_API_KEY;
export const rid = (p = "pl") => `${p}-${crypto.randomUUID()}`;

export class ArcadeError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function call<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  if (isArcadeMock()) return (await mockCall(path, body)) as T;
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ARCADE_API_KEY}`, "Content-Type": "application/json", "User-Agent": ARCADE_USER_AGENT },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new ArcadeError(res.status, `Arcade ${path} ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

export async function waitForJob(jobId: string, { intervalMs = isArcadeMock() ? 200 : 3000, timeoutMs = 5 * 60_000 } = {}): Promise<Job> {
  const start = Date.now();
  for (;;) {
    const job = await call<Job>("jobs/get", { jobId });
    if (job.status === "succeeded") return job;
    if (job.status === "failed") throw new Error(`Job ${jobId} failed: ${job.error?.message ?? "unknown"}`);
    if (Date.now() - start > timeoutMs) throw new Error(`Job ${jobId} timed out`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export const listCategories = async () => (await call<{ items: Category[] }>("categories/list", {})).items;
export const getCategory = (categoryId: string, selections: Record<string, string> = {}) => call<CategoryDetail>("categories/get", { categoryId, selections });

export async function createPattern(input: CreatePatternInput): Promise<Job> {
  const { requestId = rid("pat"), ...rest } = input;
  const job = await call<Job>("patterns/create", { requestId, ...rest });
  return waitForJob(job.jobId);
}
export const getPattern = (patternId: string) => call<Pattern>("patterns/get", { patternId });

type UploadTicket = { uploadId: string; uploadUrl: string; requiredHeaders?: Record<string, string> };

/** PUT image bytes, then references/create. Tries the documented upload-url path, then createUpload. */
export async function uploadReferenceImage(bytes: Buffer, mediaType: string): Promise<string> {
  const body = { requestId: rid("upl"), mediaType, byteLength: bytes.length };
  let ticket: UploadTicket;
  try {
    ticket = await call<UploadTicket>("references/upload-url", body);
  } catch (err) {
    if (!(err instanceof ArcadeError) || (err.status !== 404 && err.status !== 405)) throw err;
    ticket = await call<UploadTicket>("references/createUpload", body);
  }
  const headers = { "Content-Type": mediaType, ...(ticket.requiredHeaders ?? {}) };
  const put = await fetch(ticket.uploadUrl, { method: "PUT", headers, body: new Uint8Array(bytes) });
  if (!put.ok) throw new Error(`Reference upload failed (${put.status})`);
  const created = await call<{ referenceId: string }>("references/create", { requestId: rid("ref"), uploadId: ticket.uploadId });
  return created.referenceId;
}

// Refine endpoint paths follow docs.arcade.ai/api-reference/refine/*; verify with the live key.
const REFINE_PATH: Record<RefineOp["op"], string> = { edit: "refine/edit", recolor: "refine/recolor", crop: "refine/crop", seamless: "refine/seamless", extend: "refine/extend", fix: "refine/fix" };
export async function refine(op: RefineOp): Promise<Job> {
  const { op: kind, ...body } = op;
  const job = await call<Job>(REFINE_PATH[kind], { requestId: rid("ref"), ...body });
  return waitForJob(job.jobId);
}

/** Resolve a complete, manufacturable selection, then build the product. */
export async function createProduct(patternId: string, categoryId: string, prefs: Record<string, string> = {}): Promise<Product> {
  const detail = await getCategory(categoryId, prefs);
  if (!detail.canManufacture) throw new Error(`Category ${categoryId} cannot manufacture selection`);
  const job = await call<Job>("products/create", { requestId: rid("prod"), patternId, categoryId, selections: detail.selections });
  const done = await waitForJob(job.jobId);
  return getProduct(String(done.result?.productId));
}
export const getProduct = (productId: string, quantity?: number) => call<Product>("products/get", { productId, ...(quantity ? { quantity } : {}) });

/** Quantity 1 cannot check out unless dropShip is true. */
export function checkoutBody(lines: { productId: string; quantity: number }[]) {
  const dropShip = lines.some((line) => Number(line.quantity) === 1);
  return { lines, dropShip };
}

export const createCheckout = (lines: { productId: string; quantity: number }[]) => {
  const body = checkoutBody(lines);
  if (body.lines.some((line) => Number(line.quantity) === 1) && body.dropShip !== true) throw new Error("quantity 1 requires dropShip: true");
  return call<Checkout>("checkouts/create", { requestId: rid("co"), ...body });
};
export const getOrder = (q: { checkoutId?: string; orderId?: string }) => call<Order>("orders/get", q);
