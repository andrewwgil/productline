/** A scraped site or an upload. Images are normalized JPEG data URLs. */
export interface Portfolio { url: string; title: string; description: string; text: string; images: string[] }

export interface TasteProfile {
  brandName: string;
  tagline: string;
  /** One or two sentences on what the work looks and feels like. */
  brief: string;
  palette: { name: string; hex: string }[];
  motifs: string[];
  voice: { adjectives: string[]; sample: string };
}

/** One product the director wants Arcade to make. */
export interface PlanItem {
  key: string;
  world: "print" | "jewelry";
  categoryId: string;
  categoryName: string;
  /** The Arcade patterns/create prompt. */
  prompt: string;
  name: string;
  copy: string;
  /** Indexes into the selected portfolio images. Print only. */
  referenceIndexes: number[];
}

export interface LinePlan { taste: TasteProfile; items: PlanItem[]; director: "openai" | "rules" }

/** A finished Arcade product, as the storefront shows it. */
export interface ProductCard {
  productId: string;
  patternId: string;
  title: string;
  imageUrl: string;
  images: string[];
  price: { amount: number; currency: string } | null;
  maker: string | null;
}
