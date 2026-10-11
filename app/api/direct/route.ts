import { directLine } from "@/lib/director";
import type { Portfolio } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Portfolio | null;
  if (!body || !Array.isArray(body.images) || !body.images.length) return Response.json({ error: "Pick at least one image" }, { status: 400 });
  try {
    return Response.json(await directLine(body));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
