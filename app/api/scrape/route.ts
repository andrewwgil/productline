import { scrapePortfolio } from "@/lib/scrape";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || !url.trim()) return Response.json({ error: "Paste a portfolio URL" }, { status: 400 });
  try {
    const portfolio = await scrapePortfolio(url);
    if (!portfolio.images.length) return Response.json({ error: "No artwork images found on that page. Try a gallery page, or upload images instead." }, { status: 422 });
    return Response.json(portfolio);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
