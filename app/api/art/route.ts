import { refreshArtwork } from "@/lib/collection";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body.items) ? body.items : [];
  const items = raw
    .filter((item: { productId?: unknown }) => typeof item?.productId === "string")
    .slice(0, 12)
    .map((item: { productId: string; patternId?: unknown }) => ({
      productId: item.productId,
      patternId: typeof item.patternId === "string" ? item.patternId : "",
    }));
  try {
    return Response.json({ items: await refreshArtwork(items) });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
