import { after } from "next/server";
import { authorize, json, options } from "@/lib/share/http";
import { createShareFromRequest, followShare, present, ShareInputError } from "@/lib/share/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return options(req);
}

/** Accepts an image or a link, with no required prompt, and returns before Arcade finishes. */
export async function POST(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  try {
    const record = await createShareFromRequest(req);
    after(() => { void followShare(record.id); });
    return json(req, present(record), 202);
  } catch (err) {
    const status = err instanceof ShareInputError ? err.status : 400;
    const message = err instanceof Error ? err.message : "Could not start that share.";
    return json(req, { error: message }, status);
  }
}
