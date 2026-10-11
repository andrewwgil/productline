import { getOrder } from "@/lib/arcade";
export async function POST(req: Request) {
  try { return Response.json(await getOrder(await req.json())); }
  catch (e) { return Response.json({ error: String(e) }, { status: 404 }); }
}
