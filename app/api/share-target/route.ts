import { prepareShareImage } from "@/lib/share/image";
import { json } from "@/lib/share/http";
import { loadPending, savePending } from "@/lib/share/store";
import type { PendingShare } from "@/lib/share/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PENDING_ID = /^pend_[0-9a-f-]{36}$/;

/**
 * Fallback for the PWA share target when the service worker is not controlling the page yet.
 * The worker intercepts this POST and hands the file to /share itself.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "Share an image." }, 400);
  }
  const file = form.get("image") ?? form.get("file");
  const title = String(form.get("title") ?? "").slice(0, 200);
  const text = String(form.get("text") ?? "").slice(0, 500);
  const sharedUrl = String(form.get("url") ?? "").slice(0, 500);
  if (!(file instanceof File) || file.size <= 0) {
    return json(req, { error: "Share an image." }, 400);
  }
  if (file.size > 12 * 1024 * 1024) return json(req, { error: "That image is too large." }, 400);
  try {
    const prepared = await prepareShareImage(Buffer.from(await file.arrayBuffer()));
    const pending: PendingShare = {
      id: `pend_${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      dataUrl: `data:image/jpeg;base64,${prepared.imageBase64}`,
      title,
      text,
      url: sharedUrl,
    };
    await savePending(pending);
    return Response.redirect(new URL(`/share?pending=${pending.id}`, req.url), 303);
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : "Could not receive that share." }, 400);
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!PENDING_ID.test(id)) return json(req, { error: "That share expired." }, 404);
  const pending = await loadPending(id);
  if (!pending) return json(req, { error: "That share expired. Try it again." }, 404);
  return json(req, { dataUrl: pending.dataUrl, title: pending.title, text: pending.text, url: pending.url });
}
