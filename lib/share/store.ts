import { BlobNotFoundError, head, put } from "@vercel/blob";
import type { PendingShare, ShareRecord } from "./types";

type Driver = "kv" | "blob" | "memory";

interface MemoryStore {
  shares: Map<string, ShareRecord>;
  order: string[];
  pending: Map<string, PendingShare>;
}

const g = globalThis as unknown as { __productlineShares?: MemoryStore };
const memory = (g.__productlineShares ??= { shares: new Map(), order: [], pending: new Map() });

const SHARE_PREFIX = "productline:share:";
const INDEX_KEY = "productline:shares";
const PENDING_PREFIX = "productline:pending:";
const BLOB_INDEX = "productline/shares/index.json";
const MAX_SHARES = 40;

export function persistence(): { store: Driver; notice: string | null } {
  if (kvConfig()) return { store: "kv", notice: null };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      store: "blob",
      notice: "Shares are stored as JSON in Vercel Blob. Those blobs are public to anyone with the URL, and a public blob can lag about a minute. Prefer Vercel KV or Upstash.",
    };
  }
  return {
    store: "memory",
    notice: "Shares are stored in memory on this server and disappear when the process restarts. Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN), or BLOB_READ_WRITE_TOKEN, to keep them.",
  };
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis<T>(command: (string | number)[]): Promise<T> {
  const config = kvConfig();
  if (!config) throw new Error("KV is not configured");
  const res = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({})) as { result?: T; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || `KV ${res.status}`);
  return data.result as T;
}

async function readBlob<T>(pathname: string): Promise<T | null> {
  try {
    const meta = await head(pathname);
    const fresh = `${meta.url}${meta.url.includes("?") ? "&" : "?"}v=${Date.now()}`;
    const res = await fetch(fresh, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|404/i.test(message)) return null;
    throw err;
  }
}

async function writeBlob(pathname: string, value: unknown) {
  await put(pathname, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

export async function saveShare(record: ShareRecord) {
  const driver = persistence().store;
  if (driver === "kv") {
    await redis(["SET", SHARE_PREFIX + record.id, JSON.stringify(record)]);
    return;
  }
  if (driver === "blob") {
    await writeBlob(`productline/shares/${record.id}.json`, record);
    return;
  }
  memory.shares.set(record.id, record);
}

export async function loadShare(id: string): Promise<ShareRecord | null> {
  const driver = persistence().store;
  if (driver === "kv") {
    const raw = await redis<string | null>(["GET", SHARE_PREFIX + id]);
    return raw ? JSON.parse(raw) as ShareRecord : null;
  }
  if (driver === "blob") return readBlob<ShareRecord>(`productline/shares/${id}.json`);
  return memory.shares.get(id) ?? null;
}

export async function rememberShare(id: string) {
  const driver = persistence().store;
  if (driver === "kv") {
    await redis(["LPUSH", INDEX_KEY, id]);
    await redis(["LTRIM", INDEX_KEY, 0, MAX_SHARES - 1]);
    return;
  }
  if (driver === "blob") {
    const index = await readBlob<{ ids: string[] }>(BLOB_INDEX) ?? { ids: [] };
    index.ids = [id, ...index.ids.filter((item) => item !== id)].slice(0, MAX_SHARES);
    await writeBlob(BLOB_INDEX, index);
    return;
  }
  memory.order = [id, ...memory.order.filter((item) => item !== id)].slice(0, MAX_SHARES);
}

export async function listShareIds(): Promise<string[]> {
  const driver = persistence().store;
  if (driver === "kv") return redis<string[]>(["LRANGE", INDEX_KEY, 0, MAX_SHARES - 1]);
  if (driver === "blob") return (await readBlob<{ ids: string[] }>(BLOB_INDEX))?.ids ?? [];
  return memory.order;
}

export async function listShares(): Promise<ShareRecord[]> {
  const ids = await listShareIds();
  const records = await Promise.all(ids.map((id) => loadShare(id).catch(() => null)));
  return records.filter((record): record is ShareRecord => record !== null);
}

export async function savePending(pending: PendingShare) {
  const driver = persistence().store;
  if (driver === "kv") {
    await redis(["SET", PENDING_PREFIX + pending.id, JSON.stringify(pending), "EX", 60 * 30]);
    return;
  }
  if (driver === "blob") {
    await writeBlob(`productline/pending/${pending.id}.json`, pending);
    return;
  }
  memory.pending.set(pending.id, pending);
}

export async function loadPending(id: string): Promise<PendingShare | null> {
  const driver = persistence().store;
  let pending: PendingShare | null = null;
  if (driver === "kv") {
    const raw = await redis<string | null>(["GET", PENDING_PREFIX + id]);
    pending = raw ? JSON.parse(raw) as PendingShare : null;
  } else if (driver === "blob") {
    pending = await readBlob<PendingShare>(`productline/pending/${id}.json`);
  } else {
    pending = memory.pending.get(id) ?? null;
  }
  if (!pending) return null;
  if (Date.parse(pending.expiresAt) < Date.now()) return null;
  return pending;
}
