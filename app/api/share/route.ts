import { after } from "next/server";
import { isArcadeMock } from "@/lib/arcade";
import { authorize, json, options } from "@/lib/share/http";
import { createShareFromRequest, present, ShareInputError, tick } from "@/lib/share/pipeline";
import type { ShareStep } from "@/lib/share/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return options(req);
}

/** Accepts the image and prompt, stores the share, and returns an id before Arcade finishes. */
export async function POST(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;
  try {
    const record = await createShareFromRequest(req);
    after(() => { void follow(record.id); });
    return json(req, present(record), 202);
  } catch (err) {
    const status = err instanceof ShareInputError ? err.status : 400;
    const message = err instanceof Error ? err.message : "Could not start that share.";
    return json(req, { error: message }, status);
  }
}

const WORKING = new Set<ShareStep>(["uploading", "designing", "building"]);

/** Poll Arcade from the server for about a minute. Later polls from the page resume the same share. */
async function follow(id: string, left = 8) {
  const record = await tick(id);
  if (!record || !WORKING.has(record.step) || left <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, isArcadeMock() ? 700 : 4000));
  await follow(id, left - 1);
}
