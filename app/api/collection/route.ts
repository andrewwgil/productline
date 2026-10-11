import { generateCollection } from "@/lib/collection";
export const maxDuration = 300;
export async function POST(req: Request) {
  const { taste, referenceIds, modelId } = await req.json();
  try { return Response.json(await generateCollection(taste, { referenceIds, modelId: typeof modelId === "string" ? modelId : undefined })); }
  catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
}
