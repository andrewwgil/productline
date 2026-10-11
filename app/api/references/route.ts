import { isArcadeMock, uploadReferenceImage } from "@/lib/arcade";
import { parseDataUrl, prepareImage } from "@/lib/images";
import { MAX_REFERENCE_IMAGES } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

async function loadImage(src: string): Promise<{ bytes: Buffer; mediaType: string } | null> {
  if (src.startsWith("data:")) {
    const parsed = parseDataUrl(src);
    return parsed ? { bytes: parsed.bytes, mediaType: parsed.mediaType } : null;
  }
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const res = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0 productline" }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const prepared = await prepareImage(Buffer.from(await res.arrayBuffer()));
    return prepared ? { bytes: prepared.bytes, mediaType: prepared.mediaType } : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (isArcadeMock()) return Response.json({ referenceIds: [] });
  const body = await req.json().catch(() => ({}));
  const images = Array.isArray(body.images) ? body.images.filter((src: unknown): src is string => typeof src === "string").slice(0, MAX_REFERENCE_IMAGES) : [];
  const referenceIds: string[] = [];
  for (const src of images) {
    try {
      const image = await loadImage(src);
      if (!image) continue;
      referenceIds.push(await uploadReferenceImage(image.bytes, image.mediaType));
    } catch (err) {
      console.error("reference upload failed:", err instanceof Error ? err.message : err);
    }
  }
  return Response.json({ referenceIds });
}
