import { scrapePortfolio } from "@/lib/scrape";
export async function POST(req: Request) {
  const { url } = await req.json();
  if (!url) return Response.json({ error: "url required" }, { status: 400 });
  return Response.json(await scrapePortfolio(url));
}
