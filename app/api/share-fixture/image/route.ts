import sharp from "sharp";

/** A small warm photograph stand-in. `?tiny=1` is the decoy the largest-img picker should skip. */
export async function GET(req: Request) {
  const tiny = new URL(req.url).searchParams.get("tiny") === "1";
  const width = tiny ? 16 : 640;
  const height = tiny ? 16 : 400;
  const jpeg = await sharp({
    create: { width, height, channels: 3, background: tiny ? "#111111" : "#c46a4a" },
  }).jpeg().toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
  });
}
