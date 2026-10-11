import * as cheerio from "cheerio";
import { imagesFromUrls, isPublicHttpUrl } from "./images";
import { MAX_SCRAPE_CANDIDATES } from "./limits";
import type { Portfolio } from "./types";

/** Raw image URLs looked at per site. Icons and duplicates fall out before MAX_SCRAPE_CANDIDATES. */
const RAW_IMAGE_CAP = 40;

const SKIP = /\.svg($|\?)|logo|icon|sprite|pixel|avatar/i;

function isThin(portfolio: Portfolio) {
  // JS-rendered portfolios (giveideaslife.com) come back as a single og:image and almost no text.
  return portfolio.images.length <= 1 && portfolio.text.trim().length < 80;
}

async function scrapeStatic(url: URL): Promise<Portfolio> {
  let html = "";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 productline" }, signal: AbortSignal.timeout(12000) });
    html = await res.text();
  } catch {
    return { url: url.href, title: url.hostname, description: "", text: "", images: [] };
  }
  const $ = cheerio.load(html);
  const abs = (value?: string) => { try { return value ? new URL(value, url).href : null; } catch { return null; } };
  const imgs = new Set<string>();
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => { const next = abs($(el).attr("content")); if (next) imgs.add(next); });
  $("img").each((_, el) => {
    const srcset = $(el).attr("srcset")?.split(",").pop()?.trim().split(" ")[0];
    const next = abs($(el).attr("data-src") || srcset || $(el).attr("src"));
    if (next && !SKIP.test(next) && !next.startsWith("data:")) imgs.add(next);
  });
  $("script, style, noscript, nav, footer").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 6000);
  return {
    url: url.href,
    title: $("title").first().text().trim() || url.hostname,
    description: $('meta[name="description"], meta[property="og:description"]').first().attr("content") ?? "",
    text,
    images: [...imgs].slice(0, RAW_IMAGE_CAP),
  };
}

/** No-browser fallback: find artwork paths referenced inside the page's JS chunks. */
async function withScriptImages(url: URL, current: Portfolio): Promise<Portfolio> {
  try {
    const html = await (await fetch(url.href, { headers: { "user-agent": "Mozilla/5.0 productline" } })).text();
    const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => new URL(m[1], url).href).slice(0, 20);
    const found = new Set<string>();
    for (const src of scripts) {
      const js = await (await fetch(src)).text().catch(() => "");
      for (const m of js.matchAll(/["'](\/[^"'\s]+\.(?:svg|png|jpe?g|webp))["']/gi)) {
        if (!/favicon|icon|logo-?sm|sprite/i.test(m[1])) found.add(new URL(m[1], url).href);
      }
    }
    // one image per folder first so the pick spans the archive
    const byDir = new Map<string, string>();
    for (const f of found) { const d = f.split("/").slice(0, -1).join("/"); if (!byDir.has(d)) byDir.set(d, f); }
    const ordered = [...new Set([...byDir.values(), ...found])];
    if (!ordered.length) return current;
    return { ...current, images: [...new Set([...ordered, ...current.images])].slice(0, RAW_IMAGE_CAP) };
  } catch {
    return current;
  }
}

async function withRendered(url: URL, current: Portfolio): Promise<Portfolio> {
  if (!isThin(current)) return current;
  if (process.env.VERCEL) return withScriptImages(url, current); // no Chromium on Vercel functions
  try {
    const { scrapeRendered } = await import("./scrape-browser");
    const rendered = await scrapeRendered(url);
    const images = [...new Set([...rendered.images, ...current.images])].slice(0, RAW_IMAGE_CAP);
    const richer = rendered.images.length > current.images.length || rendered.text.trim().length > current.text.trim().length;
    if (!richer) return current;
    return {
      url: current.url,
      title: rendered.title || current.title,
      description: rendered.description || current.description,
      text: rendered.text.trim().length >= current.text.trim().length ? rendered.text : current.text,
      images,
    };
  } catch (err) {
    console.warn("headless scrape skipped:", err instanceof Error ? err.message : err);
    return current;
  }
}

/** Scrape a portfolio, then fetch and normalize its images so later steps never re-fetch the site. */
export async function scrapePortfolio(rawUrl: string): Promise<Portfolio> {
  const url = new URL(/^https?:\/\//.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`);
  if (!isPublicHttpUrl(url)) throw new Error("Use a public http or https portfolio URL");
  const found = await withRendered(url, await scrapeStatic(url));
  return { ...found, images: await imagesFromUrls(found.images, MAX_SCRAPE_CANDIDATES) };
}
