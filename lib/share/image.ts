import sharp from "sharp";
import { isPublicHttpUrl, parseDataUrl } from "@/lib/images";

const MAIN_EDGE = 1280;
const MAIN_BYTES = 1_100_000;
const THUMB_EDGE = 480;

export async function bytesFromImageUrl(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    const parsed = parseDataUrl(imageUrl);
    if (!parsed) throw new Error("Use a jpeg, png, gif, or webp image.");
    return parsed.bytes;
  }
  if (!isPublicHttpUrl(imageUrl)) throw new Error("That image URL is not reachable.");
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 productline" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Could not download that image.");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error("That image is larger than 12MB.");
  return bytes;
}

/** Rotate, flatten, and keep the reference under the upload budget. */
export async function prepareShareImage(bytes: Buffer): Promise<{ imageBase64: string; sourceThumb: string }> {
  let edge = MAIN_EDGE;
  let quality = 82;
  let jpeg: Buffer | null = null;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      jpeg = await sharp(bytes, { failOn: "none", animated: false, limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (jpeg.length <= MAIN_BYTES) break;
      if (quality > 58) quality -= 8;
      else edge = Math.round(edge * 0.8);
    }
  } catch {
    throw new Error("Could not read that image.");
  }
  if (!jpeg || jpeg.length < 32) throw new Error("Could not read that image.");
  const thumb = await sharp(jpeg).resize(THUMB_EDGE, THUMB_EDGE, { fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
  return {
    imageBase64: jpeg.toString("base64"),
    sourceThumb: `data:image/jpeg;base64,${thumb.toString("base64")}`,
  };
}
