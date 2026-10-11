import Link from "next/link";
export default async function MockCheckout({ searchParams }: { searchParams: Promise<{ checkoutId?: string }> }) {
  const { checkoutId } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center bg-[#f4efe6] p-8 text-[#1b1b1f]">
      <div className="max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Mock checkout</p>
        <h1 className="mt-2 font-serif text-3xl">Order placed</h1>
        <p className="mt-3 text-neutral-600">Checkout <code>{checkoutId}</code>. With a real ARCADE_API_KEY, this opens Arcade&apos;s hosted checkout.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-black px-6 py-3 text-white">Back to the store</Link>
      </div>
    </main>
  );
}
