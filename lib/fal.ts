// Fal hooks: lifestyle product shots and a storefront hero. Mock returns null so the UI falls back to Arcade art.
export const isFalMock = () => !process.env.FAL_KEY;
const IMG_MODEL = process.env.FAL_IMAGE_MODEL ?? "fal-ai/flux/schnell";

export async function falImage(prompt: string, size: "square_hd" | "landscape_16_9" = "square_hd"): Promise<string | null> {
  if (isFalMock()) return null;
  try {
    const res = await fetch(`https://fal.run/${IMG_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image_size: size, num_images: 1 }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.images?.[0]?.url ?? null;
  } catch { return null; }
}
export const lifestyleShot = (product: string, brand: string, motifs: string[]) =>
  falImage(`Editorial lifestyle photo of a ${product} for the brand "${brand}", featuring ${motifs.slice(0, 2).join(" and ")}, soft natural light, styled interior, magazine quality`);
export const heroImage = (brand: string, tagline: string, palette: string[]) =>
  falImage(`Wide editorial campaign image for "${brand}": ${tagline}. Colors ${palette.join(", ")}. Styled home and accessories flat lay, art-directed`, "landscape_16_9");
