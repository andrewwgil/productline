import { authorize, json, options } from "@/lib/share/http";
import { isShareId, present, tick } from "@/lib/share/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return options(req);
}

/** Advances the share one step and returns its status. Poll this while Arcade designs. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = authorize(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isShareId(id)) return json(req, { error: "Unknown share." }, 404);
  const record = await tick(id);
  if (!record) return json(req, { error: "Unknown share." }, 404);
  return json(req, present(record));
}
