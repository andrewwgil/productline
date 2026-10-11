export type World = "print" | "jewelry";
export type JobStatus = "running" | "succeeded" | "failed";
export interface Job {
  jobId: string;
  kind: "pattern" | "product" | "download";
  status: JobStatus;
  result: { patternId?: string; productId?: string; [k: string]: unknown } | null;
  error?: { message: string } | null;
}
export interface Category { categoryId: string; name: string; imageUrl: string | null; world: World }
export interface ArcadeModel { modelId: string; name: string }
export interface OptionValue { value: string; label?: string; available: boolean }
export interface CategoryOption { key: string; name?: string; values: OptionValue[] }
export interface CategoryDetail extends Category {
  options: CategoryOption[];
  selections: Record<string, string>;
  canManufacture: boolean;
}
export interface Pattern { patternId: string; prompt?: string; imageUrl?: string; images?: { url: string }[]; [k: string]: unknown }
export interface Product {
  productId: string;
  categoryId?: string;
  name?: string;
  images?: { url: string }[];
  maker?: { name: string } | null;
  price?: { amount: number; currency: string } | null;
  [k: string]: unknown;
}
export interface Checkout { checkoutId: string; checkoutUrl: string }
export interface Order { orderId: string; status: string; [k: string]: unknown }
export interface CreatePatternInput {
  prompt: string;
  referenceIds?: string[];
  colors?: string[];
  modelId?: string;
  categoryId?: string;
  requestId?: string;
}
export type RefineOp =
  | { op: "edit"; patternId: string; instruction: string }
  | { op: "recolor"; patternId: string; colors: unknown }
  | { op: "crop"; patternId: string; rect: { x: number; y: number; width: number; height: number } }
  | { op: "seamless"; patternId: string; [k: string]: unknown }
  | { op: "extend"; patternId: string; [k: string]: unknown }
  | { op: "fix"; patternId: string };
