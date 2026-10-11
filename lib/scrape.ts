import * as cheerio from "cheerio";
import type { Portfolio } from "./types";

export async function scrapePortfolio(rawUrl: string): Promise<Portfolio> {
  const url = new URL(/^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  let html = "";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 productline" }, signal: AbortSignal.timeout(12000) });
    html = await res.text();
  } catch {
    return { url: url.href, title: url.hostname, description: "", text: "", images: [] };
  }
  const $ = cheerio.load(html);
  const abs = (s?: string) => { try { return s ? new URL(s, url).href : null; } catch { return null; } };
  const imgs = new Set<string>();
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, e) => { const u = abs($(e).attr("content")); if (u) imgs.add(u); });
  $("img").each((_, e) => {
    const srcset = $(e).attr("srcset")?.split(",").pop()?.trim().split(" ")[0];
    const u = abs($(e).attr("data-src") || srcset || $(e).attr("src"));
    if (u && !/\.svg($|\?)|logo|icon|sprite|pixel|avatar/i.test(u) && !u.startsWith("data:")) imgs.add(u);
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
