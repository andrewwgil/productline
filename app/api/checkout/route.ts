import { createCheckout } from "@/lib/arcade";
export async function POST(req: Request) {
  const { lines } = await req.json();
  try { return Response.json(await createCheckout(lines)); }
  catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
}
