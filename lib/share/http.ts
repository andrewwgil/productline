import { timingSafeEqual } from "crypto";

export function corsHeaders(req: Request): Headers {
  const headers = new Headers();
  const origin = req.headers.get("origin") ?? "";
  const allowed = origin.startsWith("chrome-extension://")
    || origin.startsWith("http://localhost")
    || origin.startsWith("http://127.0.0.1");
  if (allowed) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Share-Token");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return headers;
}

export function json(req: Request, body: unknown, status = 200) {
  const headers = corsHeaders(req);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { status, headers });
}

export function options(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** When SHARE_TOKEN is set, require it in X-Share-Token. Unset means the routes are open. */
export function authorize(req: Request): Response | null {
  const expected = process.env.SHARE_TOKEN;
  if (!expected) return null;
  const got = req.headers.get("x-share-token") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return json(req, { error: "This server expects an X-Share-Token header." }, 401);
  }
  return null;
}
