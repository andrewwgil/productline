import { uploadReferenceImage } from "@/lib/arcade";
import { parseDataUrl } from "@/lib/images";
import { MAX_PORTFOLIO_IMAGES } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Uploads each selected image as an Arcade reference. referenceIds[i] matches images[i], or null if it failed. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const images: string[] = Array.isArray(body.images) ? body.images.filter((src: unknown): src is string => typeof src === "string").slice(0, MAX_PORTFOLIO_IMAGES) : [];
  const referenceIds: (string | null)[] = new Array(images.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < images.length) {
      const i = next++;
      const parsed = parseDataUrl(images[i]);
      if (!parsed) continue;
      try {
        referenceIds[i] = await uploadReferenceImage(parsed.bytes, parsed.mediaType);
      } catch (err) {
        console.error(`reference ${i + 1} upload failed:`, err instanceof Error ? err.message : err);
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  return Response.json({ referenceIds });
}
