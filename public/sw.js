/* Share to My Arcade. A share-target POST is saved immediately, then the confirmation opens. */
const CACHE = "share-to-my-arcade-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.headers.get("x-share-direct") === "1") return;
  const sharePost = event.request.method === "POST" && (url.pathname === "/api/share-target" || url.pathname === "/share");
  if (!sharePost) return;
  event.respondWith(receiveShare(event.request));
});

async function receiveShare(request) {
  const form = await request.formData();
  const forward = new URL("/api/share-target", request.url);
  try {
    const res = await fetch(forward, {
      method: "POST",
      headers: { "X-Share-Direct": "1" },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.shareId) {
      return Response.redirect(new URL(`/share?saved=${data.shareId}`, request.url), 303);
    }
  } catch { /* fall through and keep the payload for the page */ }
  return stash(request.url, form);
}

async function stash(pageUrl, form) {
  const file = form.get("image") || form.get("file");
  const meta = {
    title: String(form.get("title") || ""),
    text: String(form.get("text") || ""),
    url: String(form.get("url") || ""),
  };
  const cache = await caches.open(CACHE);
  if (file instanceof Blob && file.size) {
    const headers = new Headers({ "Content-Type": file.type || "application/octet-stream" });
    if (file instanceof File && file.name) headers.set("X-Share-Name", file.name);
    await cache.put(new Request(new URL("/_share/image", pageUrl)), new Response(file, { headers }));
  } else {
    await cache.delete(new Request(new URL("/_share/image", pageUrl)));
  }
  await cache.put(
    new Request(new URL("/_share/meta", pageUrl)),
    new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }),
  );
  return Response.redirect(new URL("/share?shared=1", pageUrl), 303);
}
