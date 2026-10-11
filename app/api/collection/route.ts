import { generateCollection } from "@/lib/collection";
export const maxDuration = 300;
export async function POST(req: Request) {
  const { taste, referenceIds } = await req.json();
  try { return Response.json(await generateCollection(taste, { referenceIds })); }
  catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
}
