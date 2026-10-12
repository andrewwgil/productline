import sharp from "sharp";
import { isPublicHttpUrl, parseDataUrl } from "@/lib/images";

const MAIN_EDGE = 1280;
const MAIN_BYTES = 1_100_000;
const THUMB_EDGE = 480;

export interface PreparedShare {
  imageBase64: string;
  sourceThumb: string;
  width: number;
  height: number;
  palette: string[];
  mood: string;
}

/** Public http(s), or the same host that received this share (so a local fixture works). */
export function shareUrlAllowed(value: string, allowHost?: string | null) {
  if (isPublicHttpUrl(value)) return true;
  if (!allowHost) return false;
  try {
    const url = new URL(value);
    const host = allowHost.split(",")[0].trim().toLowerCase();
    return url.host.toLowerCase() === host || url.hostname.toLowerCase() === host;
  } catch {
    return false;
  }
}

export async function bytesFromImageUrl(imageUrl: string, allowHost?: string | null): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    const parsed = parseDataUrl(imageUrl);
    if (!parsed) throw new Error("Use a jpeg, png, gif, or webp image.");
    return parsed.bytes;
  }
  if (!shareUrlAllowed(imageUrl, allowHost)) throw new Error("That image URL is not reachable.");
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 productline" },
    signal: AbortSignal.timeout(12_000),
    redirect: "follow",
    cache: "no-store",
  });
  if (!shareUrlAllowed(res.url || imageUrl, allowHost)) throw new Error("That image URL is not reachable.");
  if (!res.ok) throw new Error("Could not download that image.");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error("That image is larger than 12MB.");
  return bytes;
}

/** Rotate, flatten, and keep the reference under the upload budget. */
export async function prepareShareImage(bytes: Buffer): Promise<PreparedShare> {
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
  const meta = await sharp(jpeg).metadata();
  const sample = await sharp(jpeg).resize(24, 24, { fit: "cover" }).removeAlpha().raw().toBuffer();
  const { palette, mood } = readMood(sample);
  const thumb = await sharp(jpeg).resize(THUMB_EDGE, THUMB_EDGE, { fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
  return {
    imageBase64: jpeg.toString("base64"),
    sourceThumb: `data:image/jpeg;base64,${thumb.toString("base64")}`,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    palette,
    mood,
  };
}

function readMood(rgb: Buffer): { palette: string[]; mood: string } {
  const cells = new Map<string, { r: number; g: number; b: number; n: number }>();
  let satSum = 0;
  let lightSum = 0;
  let warm = 0;
  let cool = 0;
  let count = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    const max = Math.max(r, g, b);
    const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
    satSum += sat;
    lightSum += (r + g + b) / 3 / 255;
    if (r >= b) warm += 1;
    else cool += 1;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const cell = cells.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    cell.r += r;
    cell.g += g;
    cell.b += b;
    cell.n += 1;
    cells.set(key, cell);
    count += 1;
  }
  if (!count) return { palette: [], mood: "muted" };
  const palette = [...cells.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((cell) => hex(cell.r / cell.n, cell.g / cell.n, cell.b / cell.n));
  const sat = satSum / count;
  const light = lightSum / count;
  const tone = sat > 0.45 ? "vivid" : sat < 0.22 ? "muted" : "soft";
  const shade = light < 0.35 ? "dark" : light > 0.75 ? "pale" : "";
  const temp = warm >= cool ? "warm" : "cool";
  const hues = [...new Set(palette.map((color) => hueName(color)))].filter((name) => name && name !== "gray").slice(0, 3);
  const mood = [temp, tone, shade, hues.join(" and ")].filter(Boolean).join(", ");
  return { palette, mood };
}

function hex(r: number, g: number, b: number) {
  const channel = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function hueName(color: string) {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 18) return "gray";
  if (r > 80 && g > 50 && b < 90 && r >= g && r > b && g > b) return "brown";
  let h = 0;
  const d = max - min;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "teal";
  if (h < 255) return "blue";
  if (h < 320) return "purple";
  return "pink";
}
