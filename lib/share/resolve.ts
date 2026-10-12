import * as cheerio from "cheerio";
import { bytesFromImageUrl, shareUrlAllowed } from "./image";

const SKIP = /\.svg($|\?)|logo|icon|sprite|pixel|avatar|favicon/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)($|\?)/i;
const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/i;

/** First http(s) URL in any of the shared fields. */
export function findPageUrl(...parts: Array<string | null | undefined>): string | null {
  for (const part of parts) {
    if (!part) continue;
    const trimmed = part.trim();
    const match = trimmed.match(URL_IN_TEXT);
    if (!match) continue;
    try {
      const url = new URL(match[0]);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch { /* keep looking */ }
  }
  return null;
}

/**
 * The picture a post or page is about: og:image, then twitter:image, then the largest img.
 * A URL that is already an image is returned as itself.
 */
export async function resolveMainImage(pageUrl: string, allowHost?: string | null): Promise<Buffer> {
  if (!shareUrlAllowed(pageUrl, allowHost)) throw new Error("That link is not reachable.");
  const res = await fetch(pageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 productline", Accept: "text/html,image/avif,image/webp,image/*,*/*" },
    signal: AbortSignal.timeout(12_000),
    redirect: "follow",
    cache: "no-store",
  });
  const finalUrl = res.url || pageUrl;
  if (!shareUrlAllowed(finalUrl, allowHost)) throw new Error("That link is not reachable.");
  if (!res.ok) throw new Error("Could not open that page.");
  const type = res.headers.get("content-type") || "";
  let path = "";
  try { path = new URL(pageUrl).pathname; } catch { /* ignore */ }
  if (type.startsWith("image/") || IMAGE_EXT.test(path)) {
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 32) throw new Error("Could not read that image.");
    if (bytes.length > 12 * 1024 * 1024) throw new Error("That image is larger than 12MB.");
    return bytes;
  }
  const html = await res.text();
  const imageUrl = pickImage(html, finalUrl);
  if (!imageUrl) throw new Error("That page has no image to save.");
  return bytesFromImageUrl(imageUrl, allowHost);
}

function pickImage(html: string, baseHref: string): string | null {
  const $ = cheerio.load(html);
  let base: URL;
  try { base = new URL(baseHref); } catch { return null; }
  const abs = (value?: string | null) => {
    if (!value) return null;
    try { return new URL(value.trim(), base).href; } catch { return null; }
  };
  const og = abs($('meta[property="og:image"], meta[property="og:image:url"]').first().attr("content"));
  if (og && !og.startsWith("data:")) return og;
  const twitter = abs($('meta[name="twitter:image"], meta[name="twitter:image:src"], meta[property="twitter:image"]').first().attr("content"));
  if (twitter && !twitter.startsWith("data:")) return twitter;

  let best: string | null = null;
  let bestScore = -1;
  $("img").each((_, el) => {
    const node = $(el);
    const fromSet = largestSrcset(node.attr("srcset"));
    const src = abs(node.attr("data-src") || fromSet?.url || node.attr("src"));
    if (!src || src.startsWith("data:") || SKIP.test(src)) return;
    const width = Number(node.attr("width")) || fromSet?.width || 0;
    const height = Number(node.attr("height")) || 0;
    const score = Math.max(width, 1) * Math.max(height, 1);
    if (score > bestScore) {
      bestScore = score;
      best = src;
    }
  });
  return best;
}

function largestSrcset(value?: string | null): { url: string; width: number } | null {
  if (!value) return null;
  let best: { url: string; width: number } | null = null;
  for (const part of value.split(",")) {
    const bits = part.trim().split(/\s+/);
    const url = bits[0];
    if (!url) continue;
    const descriptor = bits[1] || "";
    const width = descriptor.endsWith("w") ? Number(descriptor.slice(0, -1)) : descriptor.endsWith("x") ? Number(descriptor.slice(0, -1)) * 100 : 0;
    if (!best || width >= best.width) best = { url, width: Number.isFinite(width) ? width : 0 };
  }
  return best;
}
