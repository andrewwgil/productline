import { itemStatus } from "@/lib/line";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { jobId } = await req.json().catch(() => ({}));
  if (typeof jobId !== "string" || !jobId) return Response.json({ error: "jobId required" }, { status: 400 });
  try {
    return Response.json(await itemStatus(jobId));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
