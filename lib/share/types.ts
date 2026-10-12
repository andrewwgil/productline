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
  prompt: string;
  categoryId: string | null;
  categoryName: string | null;
  /** Small JPEG data URL for the gallery. The shared image is a style reference, not the product. */
  sourceThumb: string;
  /** JPEG bytes, kept only until the Arcade reference exists. */
  imageBase64?: string;
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
