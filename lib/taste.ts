import { isSvgSource, svgSourceToPng } from "./images";
import { MAX_PORTFOLIO_IMAGES } from "./limits";
import type { Portfolio, TasteProfile } from "./types";

export const isClaudeMock = () => !process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

const SYSTEM = `You are a creative director turning an artist's portfolio into a product line brand.
Return ONLY JSON matching: {"brandName":string,"tagline":string,"palette":[{"name":string,"hex":"#rrggbb"}] (5 colors, last = background),"motifs":string[] (4-6),"voice":{"adjectives":string[3],"sample":string (2 sentences in the artist's voice)},"patternPrompts":string[3] (Arcade print-pattern prompts, <300 chars, rich in motif/palette/technique),"jewelryPrompt":string,"preferredCategories":string[]}. Arcade has no apparel: never ask for tees, hoodies, or jackets. For clothing, graphics, or streetwear, preferredCategories must be scarf, pillow, napkins or table linens, and lampshade.`;

function visionBlock(src: string): unknown | null {
  const data = src.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (data) return { type: "image", source: { type: "base64", media_type: data[1], data: data[2] } };
  if (isSvgSource(src)) return null;
  if (/^https?:\/\//i.test(src)) return { type: "image", source: { type: "url", url: src } };
  return null;
}

async function visionBlocks(images: string[]): Promise<unknown[]> {
  const blocks = await Promise.all(images.slice(0, MAX_PORTFOLIO_IMAGES).map(async (src) => {
    if (!isSvgSource(src)) return visionBlock(src);
    const png = await svgSourceToPng(src);
    return png ? { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } } : null;
  }));
  return blocks.filter(Boolean);
}

export async function extractTaste(p: Portfolio): Promise<TasteProfile> {
  if (isClaudeMock()) return mockTaste(p);
  const content: unknown[] = await visionBlocks(p.images);
  content.push({ type: "text", text: `Portfolio: ${p.url}\nTitle: ${p.title}\nDescription: ${p.description}\nText: ${p.text.slice(0, 4000)}` });
  const call = async (withImages: boolean) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: withImages ? content : content.slice(-1) }] }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const txt: string = data.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)) as TasteProfile;
  };
  try { return await call(true); } catch { return call(false); } // retry without images if any image URL is rejected
}

export function mockTaste(p: Portfolio): TasteProfile {
  let host = "portfolio";
  try { host = new URL(p.url).hostname.replace(/^www\./, ""); } catch { /* upload urls are still absolute */ }
  const isGil = host.includes("giveideaslife");
  const uploadedTitle = p.title.trim();
  const brandName = isGil
    ? "Give Ideas Life"
    : host === "upload.local"
      ? (uploadedTitle && uploadedTitle !== "Uploaded portfolio" ? uploadedTitle.slice(0, 48) : "Studio Upload")
      : host.split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
  return {
    brandName,
    tagline: isGil ? "Street graphics, made to live with." : "Your portfolio, made physical.",
    palette: [
      { name: "Ink Black", hex: "#111111" }, { name: "White", hex: "#ffffff" },
      { name: "Cobalt", hex: "#2643e9" }, { name: "Signal Red", hex: "#ff2d1f" },
      { name: "Sun Yellow", hex: "#ffd000" }, { name: "Cream", hex: "#f4efe6" },
    ],
    motifs: ["bold type", "lightbulb-head", "globe", "bird script"],
    voice: { adjectives: ["bold", "graphic", "direct"], sample: "Ideas leave the page. Bold type, a lightbulb-head, a globe, and bird script go out in ink black, cobalt, signal red, and sun yellow." },
    patternPrompts: [
      "Bold condensed type and a lightbulb-head character, ink black and white with cobalt and signal red hits, sun yellow sparks on cream, flat streetwear graphic, seamless repeat",
      "A globe and bird script tossed with heavy lettering, cobalt, signal red, and sun yellow on ink black, graphic poster energy, seamless repeat",
      "Bird script over a simple globe, ink black line on cream with cobalt and signal red accents, streetwear graphic, tossed layout",
    ],
    jewelryPrompt: "A chunky signet ring stamped with a lightbulb-head, graphic and bold, polished gold with a cobalt enamel hit",
    preferredCategories: ["scarf", "pillow", "napkins", "lampshade", "rug"],
  };
}
