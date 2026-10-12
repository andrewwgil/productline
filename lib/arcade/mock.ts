/* eslint-disable @typescript-eslint/no-unused-vars */
// Realistic mock of the Arcade API, used when ARCADE_API_KEY is unset.
import type { Category, CategoryDetail, Job } from "./types";

const g = globalThis as unknown as { __arcadeMock?: { jobs: Map<string, Job & { readyAt: number }>; patterns: Map<string, Record<string, unknown>>; products: Map<string, Record<string, unknown>> } };
const store = (g.__arcadeMock ??= { jobs: new Map(), patterns: new Map(), products: new Map() });
const id = () => crypto.randomUUID();
const DELAY = Number(process.env.MOCK_JOB_DELAY_MS ?? 600);

export const MOCK_CATEGORIES: (Category & { opts: Record<string, string[]>; price: number })[] = [
  { categoryId: "mock-pillow", name: "Decorative Pillows", imageUrl: null, world: "print", opts: { fabric: ["linen", "cotton velvet"], size: ["20x20", "18x18"] }, price: 120 },
  { categoryId: "mock-scarf", name: "Scarves", imageUrl: null, world: "print", opts: { fabric: ["silk twill", "silk chiffon"], size: ["35x35", "26x26"] }, price: 185 },
  { categoryId: "mock-napkins", name: "Napkins", imageUrl: null, world: "print", opts: { fabric: ["cotton", "linen"], size: ["20x20"] }, price: 68 },
  { categoryId: "mock-placemat", name: "Placemats", imageUrl: null, world: "print", opts: { fabric: ["linen", "cotton"], size: ["14x19"] }, price: 42 },
  { categoryId: "mock-lampshade", name: "Drum Lampshades", imageUrl: null, world: "print", opts: { size: ["12in", "16in"] }, price: 210 },
  { categoryId: "mock-towel", name: "Tea Towels", imageUrl: null, world: "print", opts: { fabric: ["linen"] }, price: 38 },
  { categoryId: "mock-pendant", name: "Pendant Necklace", imageUrl: null, world: "jewelry", category: { categoryId: "mock-necklaces", name: "Necklaces" }, opts: { metal: ["14k gold", "sterling silver"], chain: ["18in", "20in"] }, price: 260 },
  { categoryId: "mock-ring", name: "Rings", imageUrl: null, world: "jewelry", category: { categoryId: "mock-rings", name: "Rings" }, opts: { metal: ["14k gold", "sterling silver"], size: ["6", "7", "8"] }, price: 340 },
];

export function svgArt(seed: string, colors: string[], label = ""): string {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pal = colors.length ? colors : ["#1f2937", "#f59e0b", "#f3efe6", "#be123c"];
  const shapes: string[] = [];
  for (let i = 0; i < 14; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const x = h % 400, y = (h >> 8) % 400, r = 20 + ((h >> 4) % 70), c = pal[(h >> 3) % pal.length];
    shapes.push(i % 3 ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".85"/>` : `<rect x="${x}" y="${y}" width="${r * 1.4}" height="${r * 1.4}" fill="${c}" transform="rotate(${h % 90} ${x} ${y})"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="${pal[pal.length - 1]}"/>${shapes.join("")}${label ? `<text x="200" y="385" font-family="Georgia" font-size="16" text-anchor="middle" fill="${pal[0]}">${label.replace(/[<&]/g, "")}</text>` : ""}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function newJob(kind: Job["kind"], result: Job["result"]): Job {
  const job = { jobId: id(), kind, status: "running" as const, result: null, error: null, readyAt: Date.now() + DELAY, final: result };
  store.jobs.set(job.jobId, job as never);
  return { jobId: job.jobId, kind, status: "running", result: null };
}

export async function mockCall(path: string, body: Record<string, unknown>): Promise<unknown> {
  switch (path) {
    case "jobs/get": {
      const j = store.jobs.get(String(body.jobId)) as (Job & { readyAt: number; final: Job["result"] }) | undefined;
      if (!j) throw new Error("job not found");
      if (Date.now() >= j.readyAt) { j.status = "succeeded"; j.result = j.final; }
      return { jobId: j.jobId, kind: j.kind, status: j.status, result: j.result };
    }
    case "models/list":
      return { items: [] };
    case "categories/list":
      return { items: MOCK_CATEGORIES.map(({ opts: _o, price: _p, ...c }) => c) };
    case "categories/get": {
      const c = MOCK_CATEGORIES.find((x) => x.categoryId === body.categoryId);
      if (!c) throw new Error("category not found");
      const sent = (body.selections ?? {}) as Record<string, string>;
      const selections: Record<string, string> = {};
      const options = Object.entries(c.opts).map(([key, vals]) => {
        selections[key] = sent[key] && vals.includes(sent[key]) ? sent[key] : vals[0];
        return { key, label: key, values: vals.map((v, i) => ({ value: v, label: v, isDefault: i === 0, available: true })) };
      });
      const { opts: _o, price: _p, ...base } = c;
      return { ...base, options, selections, canManufacture: true } satisfies CategoryDetail;
    }
    case "patterns/create": {
      const category = body.categoryId ? MOCK_CATEGORIES.find((item) => item.categoryId === body.categoryId) : undefined;
      const refs = body.referenceIds as unknown[] | undefined;
      if (category?.world === "jewelry" && ((refs && refs.length > 0) || body.colors || body.modelId)) {
        throw new Error("jewelry patterns/create takes a prompt and categoryId only");
      }
      const patternId = "pat_" + id().slice(0, 12);
      const colors = (body.colors as string[]) ?? [];
      const art = svgArt(patternId, colors);
      store.patterns.set(patternId, { patternId, prompt: body.prompt, imageUrl: art, thumbnailUrl: art, width: 1024, height: 1024, colors });
      const result: Record<string, string> = { patternId };
      if (body.categoryId) result.productId = makeProduct(patternId, String(body.categoryId), {});
      return newJob(body.categoryId ? "product" : "pattern", result);
    }
    case "patterns/get":
      return store.patterns.get(String(body.patternId)) ?? { patternId: body.patternId, imageUrl: svgArt(String(body.patternId), []) };
    case "products/create": {
      const category = MOCK_CATEGORIES.find((item) => item.categoryId === body.categoryId);
      if (category?.world === "jewelry") throw new Error("products/create refuses a jewelry category");
      return newJob("product", { productId: makeProduct(String(body.patternId), String(body.categoryId), body.selections as Record<string, string>) });
    }
    case "products/get":
      return store.products.get(String(body.productId)) ?? { productId: body.productId };
    case "references/createUpload":
      return { uploadId: "upl_" + id().slice(0, 12), uploadUrl: "mock://upload", method: "PUT", requiredHeaders: { "Content-Type": String(body.mediaType) }, expiresAt: new Date(Date.now() + 600_000).toISOString() };
    case "references/create":
      return { referenceId: "ref_" + String(body.uploadId).slice(4) };
    case "checkouts/create": {
      const lines = (body.lines as { quantity?: number }[] | undefined) ?? [];
      if (lines.some((line) => Number(line.quantity) === 1) && body.dropShip !== true) throw new Error("quantity 1 requires dropShip: true");
      const checkoutId = String(Date.now());
      return { checkoutId, checkoutUrl: `/checkout/mock?checkoutId=${checkoutId}` };
    }
    case "orders/get":
      return { orderId: "ord_" + String(body.checkoutId ?? body.orderId), status: "paid", lines: [] };
    default:
      if (path.startsWith("patterns/refine/")) {
        const src = store.patterns.get(String(body.patternId));
        const patternId = "pat_" + id().slice(0, 12);
        store.patterns.set(patternId, { ...(src ?? {}), patternId, imageUrl: svgArt(patternId, (src?.colors as string[]) ?? []), parent: body.patternId });
        return newJob("pattern", { patternId });
      }
      throw new Error(`mock: unsupported ${path}`);
  }
}

function makeProduct(patternId: string, categoryId: string, selections: Record<string, string>): string {
  const c = MOCK_CATEGORIES.find((x) => x.categoryId === categoryId);
  const pat = store.patterns.get(patternId);
  const productId = id();
  const imageUrl = (pat?.imageUrl as string) ?? svgArt(productId, []);
  store.products.set(productId, {
    productId, categoryId, patternId, selections, title: c?.name ?? "Product", selectionLabel: Object.values(selections).join(", "),
    imageUrl, images: [{ url: imageUrl }],
    maker: { makerId: "mk_mock", name: c?.world === "jewelry" ? "Atelier Ochoa, LA" : "Studio Lino, Portugal" },
    unitPrice: { amount: String(c?.price ?? 100), currency: "USD" },
  });
  return productId;
}
