import { startItem } from "@/lib/line";
import type { PlanItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Starts one product's Arcade job and returns its jobId. The client polls /api/make/status. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const item = body.item as PlanItem | undefined;
  if (!item?.categoryId || !item.prompt || (item.world !== "print" && item.world !== "jewelry")) return Response.json({ error: "Invalid product" }, { status: 400 });
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  try {
    return Response.json(await startItem(item, {
      referenceIds: strings(body.referenceIds),
      colors: strings(body.colors),
      motifs: strings(body.motifs),
      modelId: typeof body.modelId === "string" && body.modelId ? body.modelId : undefined,
    }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
