import { after } from "next/server";
import { json } from "@/lib/share/http";
import { createShareFromRequest, followShare, present, ShareInputError } from "@/lib/share/pipeline";
import { loadPending } from "@/lib/share/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PENDING_ID = /^pend_[0-9a-f-]{36}$/;

/**
 * PWA share target. Accepts a file, a url, or text that contains a url.
 * No prompt. Returns immediately; the product is made in the background.
 * The service worker posts here with X-Share-Direct and reads the JSON.
 * A navigation POST (worker not installed yet) is redirected to the confirmation.
 */
export async function POST(req: Request) {
  try {
    const record = await createShareFromRequest(req);
    after(() => { void followShare(record.id); });
    if (req.headers.get("x-share-direct") === "1") return json(req, present(record), 202);
    return Response.redirect(new URL(`/share?saved=${record.id}`, req.url), 303);
  } catch (err) {
    const status = err instanceof ShareInputError ? err.status : 400;
    const message = err instanceof Error ? err.message : "Could not receive that share.";
    return json(req, { error: message }, status);
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!PENDING_ID.test(id)) return json(req, { error: "That share expired." }, 404);
  const pending = await loadPending(id);
  if (!pending) return json(req, { error: "That share expired. Try it again." }, 404);
  return json(req, { dataUrl: pending.dataUrl, title: pending.title, text: pending.text, url: pending.url });
}
