// Shapes follow https://docs.arcade.ai/openapi.json.
export type World = "print" | "jewelry";
export type JobStatus = "running" | "succeeded" | "failed";
export interface Job {
  jobId: string;
  kind: "pattern" | "product" | "download";
  status: JobStatus;
  result: { patternId?: string; productId?: string; [k: string]: unknown } | null;
  error?: { message: string | null } | null;
}
export interface Category { categoryId: string; name: string; imageUrl: string | null; world: World; category?: { categoryId: string; name: string } }
export interface ArcadeModel { modelId: string; name: string }
export interface OptionValue { value: string; label: string; isDefault?: boolean; available: boolean }
export interface CategoryOption { key: string; label: string; values: OptionValue[] }
export interface CategoryDetail extends Category {
  options: CategoryOption[];
  selections: Record<string, string>;
  canManufacture: boolean;
}
export interface Pattern { patternId: string; imageUrl: string; thumbnailUrl: string; width: number; height: number; prompt: string | null }
export interface Product {
  productId: string;
  title: string;
  categoryId: string;
  patternId: string;
  imageUrl: string;
  images: { url: string }[];
  maker: { makerId: string; name: string } | null;
  selectionLabel?: string;
  unitPrice: { amount: string; currency: string | null } | null;
}
export interface Checkout { checkoutId: string; checkoutUrl: string }
export interface Order { orderId: string; status: string; [k: string]: unknown }
export interface CreatePatternInput {
  prompt: string;
  /** Jewelry takes prompt and categoryId only. Print takes everything. */
  world?: World;
  categoryId?: string;
  referenceIds?: string[];
  colors?: string[];
  modelId?: string;
  requestId?: string;
}
