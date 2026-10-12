/**
 * Server-side prize build. Uses the shared Arcade client (User-Agent, bearer key, mock).
 * Jewelry: patterns/create with categoryId only. Print: patterns/create, then products/create.
 */
import { readFileSync, writeFileSync } from "fs";
import {
  ArcadeError,
  call,
  getJob,
  getPattern,
  getProduct,
  isArcadeMock,
  listCategories,
  rid,
  startPattern,
} from "./client";
import type { CategoryDetail, Job } from "./types";
import { MOCK_CATEGORIES } from "./mock";
import {
  FALLBACK_MODELS,
  PALETTES,
  TIERS,
  displayName,
  fitsTier,
  guessPrice,
  paletteColors,
  tierById,
  type Catalog,
  type PrizeCategory,
  type PrizeModel,
  type PrizeProduct,
  type TierId,
  type World,
} from "./prize-data";

const PRICE_FILE = "/tmp/productline-arcade-prices.json";
const STUDIO = "https://studio.arcade.ai";
const ARCADE_HOST = /(^|\.)arcade\.ai$/i;

type Observed = { amount: number; currency: string };
type Phase = "pattern" | "product";

type Session = {
  spinId: string;
  phase: Phase;
  jobId: string;
  world: World;
  categoryId: string;
  categoryName: string;
  styleName: string;
  paletteName: string;
  colors: string[];
  patternId?: string;
  patternRequestId: string;
  productRequestId: string;
  productJobId?: string;
  result?: PrizeProduct;
  failure?: string;
};

type Memory = {
  prices: Map<string, Observed>;
  pricesLoaded: boolean;
  seedStarted: boolean;
  catalog?: { at: number; body: Catalog };
  sessions: Map<string, Session>;
  locks: Map<string, Promise<unknown>>;
};

const memory: Memory = ((globalThis as { __arcadePrize?: Memory }).__arcadePrize ??= {
  prices: new Map(),
  pricesLoaded: false,
  seedStarted: false,
  sessions: new Map(),
  locks: new Map(),
});

const CATALOG_TTL_MS = 2 * 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function loadPrices() {
  if (memory.pricesLoaded) return;
  memory.pricesLoaded = true;
  try {
    const parsed = JSON.parse(readFileSync(PRICE_FILE, "utf8")) as Record<string, Observed>;
    for (const [id, value] of Object.entries(parsed)) {
      if (value && Number.isFinite(value.amount) && value.amount > 0) memory.prices.set(id, value);
    }
  } catch {
    /* no cache yet */
  }
}

function savePrices() {
  try {
    writeFileSync(PRICE_FILE, JSON.stringify(Object.fromEntries(memory.prices)));
  } catch {
    /* ephemeral fs */
  }
}

export function rememberPrice(categoryId: string, amount: number, currency: string | null | undefined) {
  if (!categoryId || !Number.isFinite(amount) || amount <= 0) return;
  const observed = { amount, currency: currency || "USD" };
  memory.prices.set(categoryId, observed);
  const row = memory.catalog?.body.categories.find((category) => category.categoryId === categoryId);
  if (row) {
    row.price = observed.amount;
    row.currency = observed.currency;
    row.priceSource = "observed";
  }
  savePrices();
}

function priceFor(category: { categoryId: string; name: string; world: World }): Pick<PrizeCategory, "price" | "currency" | "priceSource"> {
  const observed = memory.prices.get(category.categoryId);
  if (observed) return { price: observed.amount, currency: observed.currency, priceSource: "observed" };
  if (isArcadeMock()) {
    const mock = MOCK_CATEGORIES.find((item) => item.categoryId === category.categoryId);
    if (mock) return { price: mock.price, currency: "USD", priceSource: "mock" };
  }
  return { price: guessPrice(category.name, category.world), currency: "USD", priceSource: "guess" };
}

async function listAll<T>(procedure: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const body: Record<string, unknown> = {};
    if (cursor) body.cursor = cursor;
    const response = await call<{ items?: T[]; nextCursor?: string | null }>(procedure, body);
    items.push(...(response.items ?? []));
    if (!response.nextCursor || response.nextCursor === cursor) break;
    cursor = response.nextCursor;
  }
  return items;
}

async function seedObservedPrices() {
  const listed = await listAll<{ productId?: string; categoryId?: string }>("products/list");
  const picks: { productId: string; categoryId: string }[] = [];
  const seen = new Set<string>();
  for (const item of listed) {
    if (!item.productId || !item.categoryId || seen.has(item.categoryId)) continue;
    seen.add(item.categoryId);
    picks.push({ productId: item.productId, categoryId: item.categoryId });
    if (picks.length >= 6) break;
  }
  await Promise.all(
    picks.map(async (pick) => {
      try {
        const product = await getProduct(pick.productId);
        const amount = Number(product.unitPrice?.amount);
        rememberPrice(product.categoryId || pick.categoryId, amount, product.unitPrice?.currency);
      } catch {
        /* this product has no price yet; the guess remains */
      }
    }),
  );
}

function priceNote(categories: PrizeCategory[], mock: boolean) {
  if (mock) {
    return "Demo cabinet. Prices match the Arcade mock. A live ARCADE_API_KEY uses products/get, then the best-guess list until a real price is cached.";
  }
  const sources = new Set(categories.map((category) => category.priceSource));
  if (sources.has("observed") && sources.has("guess")) {
    return "Some prices are from Arcade. The rest are best-guess estimates, marked until a product in that category is priced.";
  }
  if (sources.has("guess")) {
    return "Arcade does not list a price on categories. These are best-guess estimates until a built product reports one.";
  }
  return "Prices from Arcade.";
}

export async function loadCatalog(): Promise<Catalog> {
  loadPrices();
  const cached = memory.catalog;
  if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.body;

  if (!isArcadeMock() && !memory.seedStarted) {
    memory.seedStarted = true;
    const seeding = seedObservedPrices().catch(() => undefined);
    await Promise.race([seeding, sleep(3500)]);
  }

  const categories = await listCategories();
  let models: PrizeModel[] = [];
  try {
    const live = await listAll<{ modelId: string; name: string }>("models/list");
    models = live
      .filter((model) => model.modelId && model.name)
      .map((model) => ({ modelId: model.modelId, name: model.name, synthetic: false }));
  } catch {
    models = [];
  }
  if (!models.length) models = FALLBACK_MODELS;

  const priced: PrizeCategory[] = categories.map((category) => ({
    categoryId: category.categoryId,
    name: category.name,
    world: category.world,
    ...priceFor(category),
  }));

  const body: Catalog = {
    mock: isArcadeMock(),
    priceNote: priceNote(priced, isArcadeMock()),
    tiers: TIERS,
    categories: priced,
    models,
    palettes: PALETTES,
  };
  memory.catalog = { at: Date.now(), body };
  return body;
}

function arcadeLink(product: object) {
  const record = product as Record<string, unknown>;
  for (const key of ["productUrl", "url", "studioUrl", "href", "webUrl"]) {
    const value = record[key];
    if (typeof value !== "string") continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && ARCADE_HOST.test(url.hostname)) return value;
    } catch {
      /* keep looking */
    }
  }
  return STUDIO;
}

function promptFor(input: { world: World; categoryName: string; styleName: string; paletteName: string; colors: string[] }) {
  const colors = input.colors.join(", ");
  if (input.world === "jewelry") {
    return `A wearable ${input.categoryName.toLowerCase()} with ornament in the spirit of ${input.styleName}. ${input.paletteName} colors: ${colors}. Polished, clean, and ready to wear. No text or logos.`.slice(0, 1000);
  }
  return `An original print for a ${input.categoryName} in a ${input.styleName} style. Use the ${input.paletteName} palette (${colors}). Ornamental, balanced, and ready to print on cloth. No words, letters, logos, or signatures.`.slice(0, 1000);
}

async function toProduct(productId: string, session: Session): Promise<PrizeProduct> {
  const product = await getProduct(productId);
  const amount = Number(product.unitPrice?.amount);
  if (Number.isFinite(amount)) rememberPrice(product.categoryId || session.categoryId, amount, product.unitPrice?.currency);
  let imageUrl = product.imageUrl || product.images?.[0]?.url || "";
  if (!imageUrl && product.patternId) {
    const pattern = await getPattern(product.patternId).catch(() => null);
    imageUrl = pattern?.imageUrl || "";
  }
  return {
    productId: product.productId,
    title: product.title || session.categoryName,
    imageUrl,
    price: Number.isFinite(amount) ? { amount, currency: product.unitPrice?.currency || "USD" } : null,
    arcadeUrl: arcadeLink(product),
    categoryName: session.categoryName,
    styleName: session.styleName,
    paletteName: session.paletteName,
    colors: session.colors,
    world: session.world,
  };
}

async function startProductJob(session: Session) {
  const detail = await call<CategoryDetail>("categories/get", { categoryId: session.categoryId, selections: {} });
  if (detail.world === "jewelry") throw new Error("Jewelry is made from the pattern. products/create does not build it.");
  if (!detail.canManufacture) throw new Error(`Arcade can't manufacture the default ${detail.name || session.categoryName} yet.`);
  const selections = detail.selections ?? {};
  const base = {
    patternId: session.patternId,
    categoryId: session.categoryId,
    selections,
  };
  try {
    return await call<Job>("products/create", { requestId: session.productRequestId, ...base, fit: { mode: "fill" } });
  } catch (err) {
    if (!(err instanceof ArcadeError) || err.status !== 400 || !/fit|aspect|ratio/i.test(err.message)) throw err;
    return await call<Job>("products/create", { requestId: `${session.productRequestId}-nofit`, ...base });
  }
}

export type SpinStart = {
  tier: TierId;
  categoryId: string;
  modelId?: string;
  paletteId: string;
};

function fail(message: string): { status: "failed"; error: string } {
  return { status: "failed", error: message };
}

export async function startSpin(input: SpinStart) {
  const tier = tierById(input.tier);
  if (!tier) return fail("Pick Under $20 or Under $50.");
  const catalog = await loadCatalog();
  const category = catalog.categories.find((item) => item.categoryId === input.categoryId);
  if (!category) return fail("That item is not on the wheel.");
  if (!fitsTier(category.price, tier.max)) return fail(`${category.name} is $${category.price}, outside ${tier.label}.`);
  const palette = catalog.palettes.find((item) => item.id === input.paletteId);
  if (!palette) return fail("That palette is not on the wheel.");
  const colors = paletteColors(palette.colors);
  if (!colors.length) return fail("That palette has no colors.");
  const model = catalog.models.find((item) => item.modelId === input.modelId);
  const styleName = displayName(model?.name || "Arcade classic");
  const liveModelId = model && !model.synthetic ? model.modelId : undefined;

  const session: Session = {
    spinId: rid("spin"),
    phase: "pattern",
    jobId: "",
    world: category.world,
    categoryId: category.categoryId,
    categoryName: category.name,
    styleName,
    paletteName: palette.name,
    colors,
    patternRequestId: rid(category.world === "jewelry" ? "jwl" : "pat"),
    productRequestId: rid("whl"),
  };
  const prompt = promptFor(session);
  const job = await startPattern({
    prompt,
    world: category.world,
    categoryId: category.categoryId,
    requestId: session.patternRequestId,
    ...(category.world === "print" ? { colors, modelId: liveModelId } : {}),
  });
  session.jobId = job.jobId;
  memory.sessions.set(session.spinId, session);
  trimSessions();
  return running(session);
}

export type SpinTick = {
  spinId: string;
  phase?: Phase;
  jobId?: string;
  categoryId?: string;
  world?: World;
  categoryName?: string;
  styleName?: string;
  paletteName?: string;
  colors?: string[];
  patternId?: string;
  productRequestId?: string;
};

function running(session: Session) {
  return {
    status: "running" as const,
    spinId: session.spinId,
    phase: session.phase,
    jobId: session.jobId,
    patternId: session.patternId,
    productRequestId: session.productRequestId,
    mock: isArcadeMock(),
    pollMs: isArcadeMock() ? 400 : 3000,
  };
}

function revive(body: SpinTick): Session | null {
  if (!body.spinId || !body.jobId || (body.world !== "print" && body.world !== "jewelry")) return null;
  if (!body.categoryId || !body.categoryName) return null;
  const session: Session = {
    spinId: body.spinId,
    phase: body.phase === "product" ? "product" : "pattern",
    jobId: body.jobId,
    world: body.world,
    categoryId: body.categoryId,
    categoryName: body.categoryName,
    styleName: body.styleName || "Arcade classic",
    paletteName: body.paletteName || "Palette",
    colors: paletteColors(body.colors ?? []),
    patternId: body.patternId,
    patternRequestId: rid("pat"),
    productRequestId: body.productRequestId || rid("whl"),
    productJobId: body.phase === "product" ? body.jobId : undefined,
  };
  memory.sessions.set(session.spinId, session);
  return session;
}

async function advance(session: Session) {
  if (session.result) return { status: "succeeded" as const, product: session.result, mock: isArcadeMock(), pollMs: running(session).pollMs };
  if (session.failure) return { ...fail(session.failure), mock: isArcadeMock(), pollMs: running(session).pollMs };

  const job = await getJob(session.jobId);
  if (job.status === "running") return running(session);
  if (job.status === "failed") {
    session.failure = job.error?.message || "Arcade could not make this prize.";
    return { ...fail(session.failure), mock: isArcadeMock(), pollMs: running(session).pollMs };
  }

  if (session.phase === "pattern") {
    const patternId = job.result?.patternId ? String(job.result.patternId) : "";
    const productId = job.result?.productId ? String(job.result.productId) : "";
    if (session.world === "jewelry") {
      if (!productId) {
        session.failure = "Arcade finished the jewelry design without a product.";
        return { ...fail(session.failure), mock: isArcadeMock(), pollMs: running(session).pollMs };
      }
      session.result = await toProduct(productId, session);
      return { status: "succeeded" as const, product: session.result, mock: isArcadeMock(), pollMs: running(session).pollMs };
    }
    if (!patternId) {
      if (productId) {
        session.result = await toProduct(productId, session);
        return { status: "succeeded" as const, product: session.result, mock: isArcadeMock(), pollMs: running(session).pollMs };
      }
      session.failure = "Arcade finished the pattern without an id.";
      return { ...fail(session.failure), mock: isArcadeMock(), pollMs: running(session).pollMs };
    }
    session.patternId = patternId;
    if (!session.productJobId) {
      const productJob = await startProductJob(session);
      session.productJobId = productJob.jobId;
    }
    session.phase = "product";
    session.jobId = session.productJobId;
    return running(session);
  }

  const productId = job.result?.productId ? String(job.result.productId) : "";
  if (!productId) {
    session.failure = "Arcade finished the build without a product.";
    return { ...fail(session.failure), mock: isArcadeMock(), pollMs: running(session).pollMs };
  }
  session.result = await toProduct(productId, session);
  return { status: "succeeded" as const, product: session.result, mock: isArcadeMock(), pollMs: running(session).pollMs };
}

export function tickSpin(body: SpinTick) {
  const existing = memory.sessions.get(body.spinId);
  const session = existing ?? revive(body);
  if (!session) return Promise.resolve(fail("That spin expired. Spin again."));
  const previous = memory.locks.get(session.spinId) ?? Promise.resolve();
  const run = previous.then(() => advance(session), () => advance(session));
  memory.locks.set(session.spinId, run.then(() => undefined, () => undefined));
  return run;
}

function trimSessions() {
  if (memory.sessions.size <= 40) return;
  const extra = memory.sessions.size - 40;
  const ids = [...memory.sessions.keys()].slice(0, extra);
  for (const id of ids) {
    memory.sessions.delete(id);
    memory.locks.delete(id);
  }
}
