import { createCheckout } from "@/lib/arcade";

export async function POST(req: Request) {
  const { lines } = await req.json().catch(() => ({}));
  const clean = Array.isArray(lines)
    ? lines.filter((line) => typeof line?.productId === "string").map((line) => ({ productId: line.productId as string, quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)) }))
    : [];
  if (!clean.length) return Response.json({ error: "Nothing to check out" }, { status: 400 });
  try { return Response.json(await createCheckout(clean)); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
}
