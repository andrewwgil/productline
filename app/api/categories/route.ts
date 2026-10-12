import { listCategories } from "@/lib/arcade";
import { authorize, json, options } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return options(req);
}

/** Proxy for Arcade categories/list. The key stays on the server. */
export async function GET(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  try {
    const items = await listCategories();
    return json(req, {
      categories: items.map((item) => ({
        categoryId: item.categoryId,
        name: item.name,
        imageUrl: item.imageUrl,
        world: item.world,
      })),
    });
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : "Could not load categories." }, 502);
  }
}
