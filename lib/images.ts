import JSZip from "jszip";
import sharp from "sharp";
import { MAX_PORTFOLIO_IMAGES } from "./limits";

const MAX_EDGE = 1568;
const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|tiff?)$/i;

const MEDIA = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
} as const;

type Passthrough = "image/jpeg" | "image/png" | "image/webp";

export interface RawImage {
  name: string;
  bytes: Buffer;
}

export interface PreparedImage {
  name: string;
  mediaType: Passthrough | "image/gif";
  bytes: Buffer;
  dataUrl: string;
}

export function isZipName(name: string, type = "") {
  return /\.zip$/i.test(name) || type === "application/zip" || type === "application/x-zip-compressed";
}

export function isImageName(name: string) {
  const base = name.split("/").pop() ?? name;
  if (!base || base.startsWith(".")) return false;
  if (name.includes("__MACOSX") || name.includes("/.")) return false;
  return IMAGE_EXT.test(base);
}

export async function imagesFromZip(bytes: Buffer): Promise<RawImage[]> {
  const zip = await JSZip.loadAsync(bytes);
  const out: RawImage[] = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !isImageName(name)) continue;
    const fileBytes = Buffer.from(await entry.async("uint8array"));
    if (fileBytes.length < 32) continue;
    out.push({ name, bytes: fileBytes });
  }
  return out;
}

/** Keep at most `cap` images. Extra files lose to the larger ones, then filename order is restored. */
export function selectImages(images: RawImage[], cap = MAX_PORTFOLIO_IMAGES): RawImage[] {
  const named = images.map((img, index) => ({ img, index }));
  named.sort((a, b) => a.img.name.localeCompare(b.img.name, undefined, { numeric: true }));
  if (named.length <= cap) return named.map((item) => item.img);
  const kept = new Set([...named].sort((a, b) => b.img.bytes.length - a.img.bytes.length).slice(0, cap).map((item) => item.index));
  return named.filter((item) => kept.has(item.index)).map((item) => item.img);
}

export async function prepareImage(bytes: Buffer): Promise<Omit<PreparedImage, "name"> | null> {
  try {
    const pipeline = sharp(bytes, { failOn: "none", animated: false, limitInputPixels: 40_000_000 }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height || meta.width < 8 || meta.height < 8) return null;
    const media = MEDIA[meta.format as keyof typeof MEDIA];
    const edge = Math.max(meta.width, meta.height);
    const passthrough = media === "image/jpeg" || media === "image/png" || media === "image/webp";
    if (passthrough && edge <= MAX_EDGE && bytes.length <= MAX_BYTES) {
      return { mediaType: media, bytes, dataUrl: `data:${media};base64,${bytes.toString("base64")}` };
    }
    let quality = 82;
    let out = await pipeline
      .clone()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    while (out.length > MAX_BYTES && quality > 50) {
      quality -= 10;
      out = await pipeline
        .clone()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    }
    return { mediaType: "image/jpeg", bytes: out, dataUrl: `data:image/jpeg;base64,${out.toString("base64")}` };
  } catch {
    return null;
  }
}

export async function prepareImages(images: RawImage[]): Promise<PreparedImage[]> {
  const selected = selectImages(images);
  const prepared = await Promise.all(selected.map(async (img) => {
    const next = await prepareImage(img.bytes);
    return next ? { name: img.name, ...next } : null;
  }));
  return prepared.filter((img): img is PreparedImage => img !== null);
}

export function parseDataUrl(src: string): { mediaType: string; bytes: Buffer } | null {
  const match = src.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  return { mediaType: match[1], bytes: Buffer.from(match[2].replace(/\s/g, ""), "base64") };
}
