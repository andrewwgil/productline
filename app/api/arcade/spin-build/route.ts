import { loadCatalog, startSpin, tickSpin, type SpinStart, type SpinTick } from "@/lib/arcade/prize-server";
import { tierById } from "@/lib/arcade/prize-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Catalog for the prize wheel. The Arcade key stays on the server. */
export async function GET() {
  try {
    return Response.json(await loadCatalog());
  } catch (err) {
    return Response.json({ error: message(err) }, { status: 502 });
  }
}

/**
 * action "start" begins patterns/create.
 * action "tick" polls jobs/get and, for a print category, continues into products/create.
 * Jewelry never calls products/create.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request" }, { status: 400 });
  const action = (body as { action?: string }).action;
  try {
    if (action === "start") return Response.json(await startSpin(readStart(body as Record<string, unknown>)));
    if (action === "tick") return Response.json(await tickSpin(readTick(body as Record<string, unknown>)));
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: message(err) }, { status: 502 });
  }
}

function readStart(body: Record<string, unknown>): SpinStart {
  const tier = typeof body.tier === "string" ? body.tier : "";
  if (!tierById(tier)) throw new Error("Pick Under $20 or Under $50.");
  const categoryId = stringField(body.categoryId, "categoryId");
  const paletteId = stringField(body.paletteId, "paletteId");
  const modelId = typeof body.modelId === "string" && body.modelId ? body.modelId.slice(0, 128) : undefined;
  return { tier: tier as SpinStart["tier"], categoryId, paletteId, modelId };
}

function readTick(body: Record<string, unknown>): SpinTick {
  const world = body.world === "print" || body.world === "jewelry" ? body.world : undefined;
  const colors = Array.isArray(body.colors) ? body.colors.filter((color): color is string => typeof color === "string").slice(0, 8) : undefined;
  return {
    spinId: stringField(body.spinId, "spinId"),
    phase: body.phase === "product" ? "product" : "pattern",
    jobId: typeof body.jobId === "string" ? body.jobId : undefined,
    categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined,
    world,
    categoryName: typeof body.categoryName === "string" ? body.categoryName.slice(0, 120) : undefined,
    styleName: typeof body.styleName === "string" ? body.styleName.slice(0, 120) : undefined,
    paletteName: typeof body.paletteName === "string" ? body.paletteName.slice(0, 120) : undefined,
    colors,
    patternId: typeof body.patternId === "string" ? body.patternId : undefined,
    productRequestId: typeof body.productRequestId === "string" ? body.productRequestId : undefined,
  };
}

function stringField(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw new Error(`Missing ${name}.`);
  return value.trim();
}

function message(err: unknown) {
  return err instanceof Error ? err.message : "Arcade could not build this prize.";
}
