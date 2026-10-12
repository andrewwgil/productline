/* Share to Arcade. Receives a PWA share-target POST and hands the file to /share. */
const CACHE = "share-to-arcade-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const sharePost = event.request.method === "POST" && (url.pathname === "/api/share-target" || url.pathname === "/share");
  if (!sharePost) return;
  event.respondWith(receiveShare(event.request));
});

async function receiveShare(request) {
  const form = await request.formData();
  const file = form.get("image") || form.get("file");
  const meta = {
    title: String(form.get("title") || ""),
    text: String(form.get("text") || ""),
    url: String(form.get("url") || ""),
  };
  const cache = await caches.open(CACHE);
  if (file instanceof Blob && file.size) {
    const headers = new Headers({
      "Content-Type": file.type || "application/octet-stream",
    });
    if (file instanceof File && file.name) headers.set("X-Share-Name", file.name);
    await cache.put(new Request(new URL("/_share/image", request.url)), new Response(file, { headers }));
  } else {
    await cache.delete(new Request(new URL("/_share/image", request.url)));
  }
  await cache.put(
    new Request(new URL("/_share/meta", request.url)),
    new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }),
  );
  return Response.redirect(new URL("/share?shared=1", request.url), 303);
}
