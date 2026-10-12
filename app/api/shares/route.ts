import { authorize, json, options } from "@/lib/share/http";
import { recentShares } from "@/lib/share/pipeline";
import { persistence } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return options(req);
}

export async function GET(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  const shares = await recentShares();
  const { store, notice } = persistence();
  return json(req, { shares, store, notice });
}
