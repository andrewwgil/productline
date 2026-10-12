import type { World } from "@/lib/arcade";

export type ShareStep = "uploading" | "designing" | "building" | "ready" | "failed";

export interface SharePrice {
  amount: string;
  currency: string | null;
}

/** One share, from the incoming image through a priced Arcade product. */
export interface ShareRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  step: ShareStep;
  visited: ShareStep[];
  /** Empty until a surprise category is chosen. */
  prompt: string;
  /** No prompt and no category: Arcade picks, and the reveal names it. */
  surprise: boolean;
  world: World | null;
  categoryId: string | null;
  categoryName: string | null;
  /** Page or post that was shared, when the image came from a link. */
  sourceUrl?: string;
  /** Host of this app, so a same-server fixture can be fetched. Other private hosts stay blocked. */
  allowHost?: string;
  /** Small JPEG data URL for the gallery. The shared image is a style reference, not the product. */
  sourceThumb: string;
  /** JPEG bytes, kept only until the Arcade reference exists (print) or the prompt is written (jewelry). */
  imageBase64?: string;
  width?: number;
  height?: number;
  palette?: string[];
  mood?: string;
  /** "Your surprise: a silk scarf, $185" once a surprise is priced. */
  reveal?: string;
  referenceId?: string;
  uploadRequestId?: string;
  refRequestId?: string;
  patternRequestId?: string;
  patternJobId?: string;
  patternId?: string;
  productRequestId?: string;
  productJobId?: string;
  productId?: string;
  productImage?: string;
  price?: SharePrice | null;
  title?: string;
  maker?: string | null;
  selectionLabel?: string;
  arcadeUrl?: string;
  imageFetchedAt?: string;
  error?: string;
  warning?: string;
  retries?: number;
  lockUntil?: number;
}

/** A file handed over by the system share sheet before the person adds a prompt. */
export interface PendingShare {
  id: string;
  createdAt: string;
  expiresAt: string;
  dataUrl: string;
  title: string;
  text: string;
  url: string;
}

export interface ShareView {
  shareId: string;
  step: ShareStep;
  prompt: string;
  surprise: boolean;
  world: World | null;
  reveal: string | null;
  sourceUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  sourceThumb: string;
  title: string | null;
  maker: string | null;
  selectionLabel: string | null;
  productId: string | null;
  imageUrl: string | null;
  price: SharePrice | null;
  arcadeUrl: string | null;
  error: string | null;
  warning: string | null;
  visited: ShareStep[];
  createdAt: string;
  updatedAt: string;
  store: "kv" | "blob" | "memory";
  notice: string | null;
}
