import { chromium } from "playwright";
import type { Portfolio } from "./types";

const UI_ASSET = /favicon|sprite|pixel|spacer|spinner|analytics|1x1|badge/i;

interface Shot { src: string; w: number; h: number; alt: string }

function keepShot(shot: Shot) {
  if (!shot.src || shot.src.startsWith("data:")) return false;
  if (UI_ASSET.test(shot.src)) return false;
  if (shot.w > 0 && shot.h > 0 && shot.w < 48 && shot.h < 48) return false;
  return true;
}

/** One strong frame per directory, then other angles, capped at 24. */
function chooseShots(shots: Shot[], cap = 24): Shot[] {
  const usable = shots.filter(keepShot);
  const bestByDir = new Map<string, Shot>();
  for (const shot of usable) {
    const dir = shot.src.split("/").slice(0, -1).join("/") || shot.src;
    const prev = bestByDir.get(dir);
    if (!prev || shot.w * shot.h > prev.w * prev.h) bestByDir.set(dir, shot);
  }
  const picked = [...bestByDir.values()];
  if (picked.length > cap) return picked.slice(0, cap);
  const used = new Set(picked.map((shot) => shot.src));
  for (const shot of usable) {
    if (used.has(shot.src)) continue;
    picked.push(shot);
    if (picked.length >= cap) break;
  }
  return picked;
}

/** Headless render for sites whose artwork is injected by JavaScript. */
export async function scrapeRendered(url: URL): Promise<Portfolio> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
    await page.waitForFunction(() => document.querySelectorAll("img").length > 0, { timeout: 4000 }).catch(() => undefined);
    await page.evaluate(async () => {
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const height = () => Math.max(document.body?.scrollHeight ?? 0, document.documentElement?.scrollHeight ?? 0);
      for (let y = 0; y < height() && y < 8000; y += 700) {
        window.scrollTo(0, y);
        await wait(40);
      }
      window.scrollTo(0, 0);
    });
    const data = await page.evaluate(() => {
      const abs = (value: string | null | undefined) => {
        if (!value) return null;
        try { return new URL(value, location.href).href; } catch { return null; }
      };
      const shots: { src: string; w: number; h: number; alt: string }[] = [];
      const seen = new Set<string>();
      const add = (value: string | null | undefined, w = 0, h = 0, alt = "") => {
        const src = abs(value);
        if (!src || src.startsWith("data:") || seen.has(src)) return;
        seen.add(src);
        shots.push({ src, w, h, alt });
      };
      document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach((el) => add(el.getAttribute("content")));
      document.querySelectorAll("img").forEach((img) => {
        const srcset = img.getAttribute("srcset")?.split(",").pop()?.trim().split(/\s+/)[0];
        add(img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || srcset, img.naturalWidth, img.naturalHeight, img.alt || "");
      });
      const alts = [...new Set(shots.map((shot) => shot.alt.trim()).filter(Boolean))];
      const visible = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
      const description = document.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute("content") ?? "";
      return {
        title: document.title.trim(),
        description,
        text: [visible, alts.join(". ")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 6000),
        shots,
      };
    });
    const shots = chooseShots(data.shots);
    return {
      url: url.href,
      title: data.title || url.hostname,
      description: data.description,
      text: data.text,
      images: shots.map((shot) => shot.src),
    };
  } finally {
    await browser.close();
  }
}
