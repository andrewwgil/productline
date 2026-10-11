import { extractTaste, isClaudeMock } from "@/lib/taste";
export const maxDuration = 60;
export async function POST(req: Request) {
  const portfolio = await req.json();
  try { return Response.json({ taste: await extractTaste(portfolio), mock: isClaudeMock() }); }
  catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
}
