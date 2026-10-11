import * as cheerio from "cheerio";
import type { Portfolio } from "./types";

const SKIP = /\.svg($|\?)|logo|icon|sprite|pixel|avatar/i;

function isThin(portfolio: Portfolio) {
  return portfolio.images.length <= 1 || portfolio.text.trim().length < 80;
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
    images: [...imgs].slice(0, 24),
  };
}

async function withRendered(url: URL, current: Portfolio): Promise<Portfolio> {
  if (!isThin(current)) return current;
  try {
    const { scrapeRendered } = await import("./scrape-browser");
    const rendered = await scrapeRendered(url);
    const images = [...new Set([...rendered.images, ...current.images])].slice(0, 24);
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

export async function scrapePortfolio(rawUrl: string): Promise<Portfolio> {
  const url = new URL(/^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  return withRendered(url, await scrapeStatic(url));
}
