export interface Portfolio { url: string; title: string; description: string; text: string; images: string[] }
export interface TasteProfile {
  brandName: string;
  tagline: string;
  palette: { name: string; hex: string }[];
  motifs: string[];
  voice: { adjectives: string[]; sample: string };
  patternPrompts: string[];
  jewelryPrompt: string;
  preferredCategories: string[];
}
export interface CollectionItem {
  productId: string;
  categoryId: string;
  categoryName: string;
  world: "print" | "jewelry";
  patternId: string;
  imageUrl: string;
  lifestyleUrl?: string;
  name: string;
  copy: string;
  price: { amount: number; currency: string } | null;
  maker: string | null;
}
export interface Collection { items: CollectionItem[]; heroUrl?: string; mock: { arcade: boolean; claude: boolean; fal: boolean } }
