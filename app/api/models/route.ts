import { listModels } from "@/lib/arcade";

export async function GET() {
  try {
    const items = await listModels();
    return Response.json({
      items: items
        .filter((model) => model?.modelId && model?.name)
        .map((model) => ({ modelId: model.modelId, name: model.name })),
    });
  } catch {
    return Response.json({ items: [] });
  }
}
