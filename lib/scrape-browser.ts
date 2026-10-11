import { chromium } from "playwright";
import type { Portfolio } from "./types";

const SKIP = /\.svg($|\?)|logo|icon|sprite|pixel|avatar|favicon|spinner|badge/i;

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
    await page.evaluate(async () => {
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const height = () => Math.max(document.body?.scrollHeight ?? 0, document.documentElement?.scrollHeight ?? 0);
      for (let y = 0; y < height() && y < 8000; y += 700) {
        window.scrollTo(0, y);
        await wait(60);
      }
      window.scrollTo(0, 0);
    });
    const data = await page.evaluate(() => {
      const abs = (value: string | null | undefined) => {
        if (!value) return null;
        try { return new URL(value, location.href).href; } catch { return null; }
      };
      const images = new Set<string>();
      const add = (value: string | null | undefined) => {
        const next = abs(value);
        if (next && !next.startsWith("data:")) images.add(next);
      };
      document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach((el) => add(el.getAttribute("content")));
      document.querySelectorAll("img").forEach((img) => {
        add(img.currentSrc || img.getAttribute("src"));
        add(img.getAttribute("data-src"));
        add(img.getAttribute("data-lazy-src"));
        const srcset = img.getAttribute("srcset");
        if (srcset) add(srcset.split(",").pop()?.trim().split(/\s+/)[0]);
      });
      document.querySelectorAll("source").forEach((el) => {
        const srcset = el.getAttribute("srcset");
        if (srcset) add(srcset.split(",").pop()?.trim().split(/\s+/)[0]);
      });
      const description = document.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute("content") ?? "";
      return {
        title: document.title.trim(),
        description,
        text: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 6000),
        images: [...images],
      };
    });
    return {
      url: url.href,
      title: data.title || url.hostname,
      description: data.description,
      text: data.text,
      images: data.images.filter((src) => !SKIP.test(src)).slice(0, 24),
    };
  } finally {
    await browser.close();
  }
}
