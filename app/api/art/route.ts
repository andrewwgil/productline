import { productCard } from "@/lib/line";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Re-fetch product cards. Arcade image URLs are short-lived. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.productIds) ? body.productIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 12) : [];
  const products = await Promise.all(ids.map((id) => productCard(id).catch(() => null)));
  return Response.json({ products: products.filter(Boolean) });
}
