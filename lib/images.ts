import JSZip from "jszip";
import sharp from "sharp";
import { MAX_PORTFOLIO_IMAGES } from "./limits";

const NORMAL_EDGE = 1024;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|tiff?)$/i;

export interface RawImage {
  name: string;
  bytes: Buffer;
}

export interface PreparedImage {
  name: string;
  mediaType: "image/jpeg";
  bytes: Buffer;
  dataUrl: string;
  width: number;
  height: number;
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

/** Rotate, flatten onto white, fit inside 1024px, and re-encode as JPEG. Images smaller than minEdge are dropped. */
export async function normalizeImage(bytes: Buffer, minEdge = 64): Promise<Omit<PreparedImage, "name"> | null> {
  try {
    const { data, info } = await sharp(bytes, { failOn: "none", animated: false, limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: NORMAL_EDGE, height: NORMAL_EDGE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (Math.min(info.width, info.height) < minEdge) return null;
    return { mediaType: "image/jpeg", bytes: data, dataUrl: `data:image/jpeg;base64,${data.toString("base64")}`, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export async function prepareImages(images: RawImage[]): Promise<PreparedImage[]> {
  const selected = selectImages(images);
  const prepared = await Promise.all(selected.map(async (img) => {
    const next = await normalizeImage(img.bytes);
    return next ? { name: img.name, ...next } : null;
  }));
  return prepared.filter((img): img is PreparedImage => img !== null);
}

/** 8x8 grayscale average hash, so the same artwork at two sizes counts once. */
async function fingerprint(bytes: Buffer): Promise<string> {
  const px = await sharp(bytes).resize(8, 8, { fit: "fill" }).grayscale().raw().toBuffer();
  const mean = px.reduce((sum, v) => sum + v, 0) / px.length;
  return [...px].map((v) => (v > mean ? "1" : "0")).join("");
}

/** Fetch scraped image URLs, drop icons and duplicates, and keep the first `cap` real images in page order. */
export async function imagesFromUrls(urls: string[], cap: number, minEdge = 240): Promise<string[]> {
  const out: (string | null)[] = new Array(urls.length).fill(null);
  const prints: (string | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      try {
        const raw = isSvgSource(urls[i]) ? await svgSourceToPng(urls[i]) : await bytesFromSource(urls[i]);
        const img = raw && await normalizeImage(raw, minEdge);
        if (!img) continue;
        out[i] = img.dataUrl;
        prints[i] = await fingerprint(img.bytes);
      } catch { /* unreachable image */ }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  const seen = new Set<string>();
  const kept: string[] = [];
  out.forEach((dataUrl, i) => {
    if (!dataUrl || kept.length >= cap) return;
    const key = prints[i] ?? dataUrl.slice(-64);
    if (seen.has(key)) return;
    seen.add(key);
    kept.push(dataUrl);
  });
  return kept;
}

const SVG_URL = /\.svg(?:$|[?#])/i;

export function isSvgSource(src: string) {
  return src.slice(0, 96).toLowerCase().startsWith("data:image/svg+xml") || SVG_URL.test(src);
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[?::1?\]?|\[?f[cd][0-9a-f]*:.*)$/i;

/** Literal hostnames only; this does not resolve DNS. */
export function isPublicHttpUrl(value: string | URL): boolean {
  try {
    const url = typeof value === "string" ? new URL(value) : value;
    return (url.protocol === "http:" || url.protocol === "https:") && !PRIVATE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

async function bytesFromSource(src: string): Promise<Buffer | null> {
  if (src.startsWith("data:")) {
    const base64 = src.match(/^data:[^,]*;base64,([A-Za-z0-9+/=\s]+)$/);
    if (base64) return Buffer.from(base64[1].replace(/\s/g, ""), "base64");
    const raw = src.match(/^data:[^,]*,([\s\S]+)$/);
    if (!raw) return null;
    try { return Buffer.from(decodeURIComponent(raw[1])); } catch { return Buffer.from(raw[1]); }
  }
  if (!isPublicHttpUrl(src)) return null;
  const res = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0 productline" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  return bytes.length > 8 * 1024 * 1024 ? null : bytes;
}

/** Downscale a portfolio image to raw RGB. Transparent pixels are flattened onto white. */
export async function rasterPixels(src: string, edge = 96): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    const bytes = await bytesFromSource(src);
    if (!bytes) return null;
    const { data, info } = await sharp(bytes, {
      failOn: "none",
      animated: false,
      limitInputPixels: 40_000_000,
      ...(isSvgSource(src) ? { density: 144 } : {}),
    })
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true, kernel: "nearest" })
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height || info.channels < 3 || data.length < 3) return null;
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/** Rasterize an SVG URL or data URL to PNG. GPT and Arcade references cannot take SVG. */
export async function svgSourceToPng(src: string): Promise<Buffer | null> {
  try {
    const bytes = await bytesFromSource(src);
    if (!bytes) return null;
    const png = await sharp(bytes, { density: 192, failOn: "none", limitInputPixels: 40_000_000 })
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return png.length > 32 ? png : null;
  } catch {
    return null;
  }
}

export function parseDataUrl(src: string): { mediaType: string; bytes: Buffer } | null {
  const match = src.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  return { mediaType: match[1], bytes: Buffer.from(match[2].replace(/\s/g, ""), "base64") };
}
