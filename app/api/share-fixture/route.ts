/** A fake post page so the mock path can resolve og:image, or the largest img. */
export function GET(req: Request) {
  const bare = new URL(req.url).searchParams.get("bare") === "1";
  const image = "/api/share-fixture/image";
  const tiny = "/api/share-fixture/image?tiny=1";
  const meta = bare ? "" : `<meta property="og:image" content="${image}"><meta name="twitter:image" content="${image}">`;
  const html = `<!doctype html><html><head><title>Linen on the table</title>${meta}</head><body><img src="${tiny}" width="16" height="16" alt="icon"><img src="${image}" width="1200" height="800" alt="linen"></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
