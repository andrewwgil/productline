import Link from "next/link";
export default async function MockCheckout({ searchParams }: { searchParams: Promise<{ checkoutId?: string }> }) {
  const { checkoutId } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center bg-paper p-8 text-ink">
      <div className="max-w-md rounded-[18px] border border-[#e0e3df] bg-white p-8 text-center shadow-[0_20px_80px_#14231c22]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green">Mock checkout</p>
        <h1 className="mt-2 font-serif text-3xl font-normal tracking-[-0.03em]">Order placed</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#69726c]">Checkout <code>{checkoutId}</code>. With a real ARCADE_API_KEY, this opens Arcade&apos;s hosted checkout.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-full bg-pill px-[18px] text-sm font-semibold tracking-[-0.01em] text-white hover:bg-pill-hover">Back to the store</Link>
      </div>
    </main>
  );
}
