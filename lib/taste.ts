import { paletteFromSources } from "./palette";
import type { Portfolio, TasteProfile } from "./types";

/** The rules-only read of a portfolio, used when no OpenAI key is set. */
export interface RuleTaste { taste: TasteProfile; patternPrompts: string[]; jewelryPrompt: string; preferredCategories: string[] }

const MOTIF_RULES: { test: RegExp; motif: string }[] = [
  { test: /light\s*bulb|lightbulb|bulb[-\s]?head/i, motif: "lightbulb-head" },
  { test: /\bglobe\b|world map|\batlas\b/i, motif: "globe" },
  { test: /\bbirds?\b/i, motif: "bird" },
  { test: /\bscript\b|calligraphy|hand[-\s]?letter/i, motif: "script" },
  { test: /\btype\b|typography|lettering|wordmark|\bfonts?\b/i, motif: "bold type" },
  { test: /floral|botanical|\bflowers?\b|\bblooms?\b/i, motif: "floral" },
  { test: /\bstripes?\b/i, motif: "stripes" },
  { test: /geometric|\bgrids?\b|\bcircles?\b/i, motif: "geometry" },
  { test: /\bwaves?\b|\bocean\b|\bwater\b/i, motif: "water" },
  { test: /\bsuns?\b|\bstars?\b/i, motif: "sun" },
  { test: /portrait|\bfaces?\b|\bfigures?\b/i, motif: "figures" },
  { test: /animals?|creatures?|\bcats?\b|\bdogs?\b/i, motif: "creatures" },
  { test: /abstract/i, motif: "abstract marks" },
  { test: /\bicons?\b|\bsymbols?\b/i, motif: "symbols" },
  { test: /landscape|\bmountains?\b/i, motif: "landscape" },
  { test: /streetwear|\bgraphics?\b|\bposters?\b/i, motif: "graphic marks" },
];

const STOP = new Set(["the", "a", "an", "and", "or", "of", "for", "with", "from", "your", "this", "that", "into", "made", "artboard", "image", "img", "png", "jpg", "jpeg", "svg", "webp", "copy", "untitled", "layer", "group", "final", "portfolio", "uploaded", "files", "file", "www", "http", "https"]);

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function motifsFrom(text: string): string[] {
  const found: string[] = [];
  for (const rule of MOTIF_RULES) {
    if (rule.test.test(text) && !found.includes(rule.motif)) found.push(rule.motif);
  }
  if (found.includes("bird") && found.includes("script")) {
    const rest = found.filter((motif) => motif !== "bird" && motif !== "script");
    found.splice(0, found.length, "bird script", ...rest);
  }
  const phrases = new Map<string, number>();
  for (const chunk of text.split(/[.\n]/)) {
    const head = chunk.split(/[—–|:]/)[0]?.replace(/\.[a-z0-9]{2,4}$/i, "").trim() ?? "";
    const words = head.split(/\s+/).map((word) => word.replace(/[^a-z0-9'-]/gi, "")).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    if (words.some((word) => STOP.has(word.toLowerCase()) && words.length === 2)) continue;
    if (words.some((word) => /artboard|untitled|\d{3,}/i.test(word))) continue;
    const phrase = words.join(" ").toLowerCase();
    const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const phraseKey = compact(phrase);
    if (phrase.length > 32 || found.some((motif) => {
      const key = compact(motif);
      return phraseKey.includes(key) || key.includes(phraseKey);
    })) continue;
    phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
  }
  const extra = [...phrases.entries()].filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).map(([phrase]) => phrase);
  for (const phrase of extra) {
    if (found.length >= 6) break;
    if (!found.includes(phrase)) found.push(phrase);
  }
  return found.slice(0, 6);
}

function brandFrom(p: Portfolio) {
  let host = "portfolio";
  try { host = new URL(p.url).hostname.replace(/^www\./, ""); } catch { /* upload urls are still absolute */ }
  const uploadedTitle = p.title.trim();
  if (host.includes("giveideaslife")) return "Give Ideas Life";
  if (host === "upload.local") return uploadedTitle && uploadedTitle !== "Uploaded portfolio" ? uploadedTitle.slice(0, 48) : "Studio Upload";
  const stem = host.split(".")[0] ?? host;
  return stem.replace(/^\w/, (c) => c.toUpperCase());
}

const GRAPHIC = /type|script|lightbulb|globe|bird|graphic|poster|street/i;
const APPAREL = /\b(apparel|clothing|garments?|streetwear|graphics?|merch|tees?|t-?shirts?|shirts?|hoodies?|sweatshirts?|jackets?|outerwear)\b/i;

const PAPER_FALLBACK = [
  { name: "Ink Black", hex: "#1a1a1a" },
  { name: "Graphite", hex: "#4a4744" },
  { name: "Clay", hex: "#a56b45" },
  { name: "Stone", hex: "#b7aea2" },
  { name: "Cream", hex: "#f4efe6" },
];

function promptsFor(motifs: string[], palette: { name: string }[]) {
  const ink = palette[0]?.name.toLowerCase() ?? "ink";
  const accent = palette[1]?.name.toLowerCase() ?? "an accent";
  const accent2 = palette[2]?.name.toLowerCase() ?? accent;
  const paper = palette[palette.length - 1]?.name.toLowerCase() ?? "cream";
  const first = motifs[0] ?? "a drawn mark";
  const second = motifs[1] ?? first;
  const third = motifs[2] ?? second;
  return [
    `${capitalize(first)} and ${second}, ${ink} with ${accent} and ${accent2} on ${paper}, flat graphic, seamless repeat`,
    `A tossed repeat of ${second} and ${third}, ${accent} and ${accent2} on ${ink}, poster energy, seamless repeat`,
    `${capitalize(third)} over ${first}, ${ink} line on ${paper} with ${accent} accents, seamless repeat`,
  ].map((prompt) => prompt.slice(0, 300));
}

export async function localTaste(p: Portfolio): Promise<RuleTaste> {
  const note = [p.description, p.text].filter(Boolean).join("\n");
  const corpus = [p.title, note].filter(Boolean).join("\n");
  const motifs = motifsFrom(note);
  const motifList = motifs.length ? motifs : ["drawn marks"];
  const extracted = await paletteFromSources(p.images, 8);
  const palette = extracted.length >= 2 ? extracted : PAPER_FALLBACK;
  const graphic = GRAPHIC.test(corpus) || motifList.some((motif) => GRAPHIC.test(motif));
  const colorPhrase = palette.slice(0, 4).map((swatch) => swatch.name.toLowerCase()).join(", ");
  const motifPhrase = motifList.slice(0, 3).join(", ");
  const lead = p.description.trim().split(/[.\n]/).map((line) => line.trim()).find((line) => line.length > 18 && line.length < 140);
  const sample = lead
    ? `${lead.replace(/[.]+$/, "")}. ${capitalize(motifPhrase)} hold the line in ${colorPhrase}.`
    : `${capitalize(motifPhrase)} lead the line, in ${colorPhrase}. Made to live with.`;
  const apparel = APPAREL.test(corpus) || graphic;
  const tagline = graphic ? "Street graphics, made to live with." : motifList[0] ? `${capitalize(motifList[0])}, made to live with.` : "Your portfolio, made physical.";
  return {
    taste: {
      brandName: brandFrom(p),
      tagline,
      brief: `Work built on ${motifPhrase}, in ${colorPhrase}.`,
      palette,
      motifs: motifList.slice(0, 6),
      voice: { adjectives: graphic ? ["bold", "graphic", "direct"] : ["considered", "tactile", "clear"], sample },
    },
    patternPrompts: promptsFor(motifList, palette),
    jewelryPrompt: `A pendant shaped from ${motifList[0]}, polished metal with a ${palette[1]?.name.toLowerCase() ?? "enamel"} accent`,
    preferredCategories: apparel ? ["scarves", "decorative pillows", "napkins", "drum lampshades", "tea towels"] : ["scarves", "decorative pillows", "napkins", "drum lampshades"],
  };
}
