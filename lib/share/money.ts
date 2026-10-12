export function money(price: { amount: string | number; currency: string | null } | null | undefined) {
  if (!price) return null;
  const amount = Number(price.amount);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency || "USD",
    maximumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount);
}
