"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { Collection, CollectionItem, Portfolio, TasteProfile } from "@/lib/types";

type Step = "idle" | "scrape" | "taste" | "generate" | "done" | "error";
const STEPS: [Step, string][] = [["scrape", "Reading portfolio"], ["taste", "Distilling taste"], ["generate", "Designing & building products"]];

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error ?? r.statusText);
  return d;
}

export default function Home() {
  const [url, setUrl] = useState("giveideaslife.com");
  const [step, setStep] = useState<Step>("idle");
  const [err, setErr] = useState("");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [taste, setTaste] = useState<TasteProfile | null>(null);
  const [col, setCol] = useState<Collection | null>(null);

  async function run() {
    setErr(""); setCol(null); setTaste(null);
    try {
      setStep("scrape"); const p = await post<Portfolio>("/api/scrape", { url }); setPortfolio(p);
      setStep("taste"); const { taste: t } = await post<{ taste: TasteProfile }>("/api/taste", p); setTaste(t);
      setStep("generate"); setCol(await post<Collection>("/api/collection", { taste: t }));
      setStep("done");
    } catch (e) { setErr(String(e)); setStep("error"); }
  }

  if (step === "done" && taste && col) return <Storefront taste={taste} col={col} portfolio={portfolio} onReset={() => setStep("idle")} />;

  return (
    <main className="min-h-screen bg-[#0e0e10] text-white">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <p className="text-xs uppercase tracking-[0.4em] text-orange-400">productline</p>
        <h1 className="mt-4 font-serif text-5xl leading-tight md:text-6xl">Bring your taste.<br />Leave with a brand.</h1>
        <p className="mt-6 max-w-xl text-lg text-neutral-400">Paste a portfolio. We read your palette, motifs and voice, then design a made-to-order product line with Arcade and open the store.</p>
        <form onSubmit={(e) => { e.preventDefault(); run(); }} className="mt-10 flex gap-3">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourportfolio.com" className="flex-1 rounded-full bg-white/10 px-6 py-4 outline-none ring-1 ring-white/20 focus:ring-orange-400" />
          <button disabled={["scrape", "taste", "generate"].includes(step)} className="rounded-full bg-orange-500 px-8 py-4 font-medium text-black hover:bg-orange-400 disabled:opacity-50">Build my line</button>
        </form>
        {step !== "idle" && (
          <ol className="mt-12 space-y-3">
            {STEPS.map(([s, label], i) => {
              const cur = STEPS.findIndex(([x]) => x === step);
              const state = step === "error" && i === Math.max(cur, 0) ? "err" : i < cur ? "done" : i === cur ? "now" : "todo";
              return <li key={s} className={`flex items-center gap-3 ${state === "todo" ? "text-neutral-600" : ""}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${state === "done" ? "bg-green-400" : state === "now" ? "animate-pulse bg-orange-400" : "bg-neutral-700"}`} />{label}
              </li>;
            })}
          </ol>
        )}
        {portfolio && step !== "idle" && <p className="mt-6 text-sm text-neutral-500">Found {portfolio.images.length} images on {portfolio.title}</p>}
        {taste && <div className="mt-4 flex gap-2">{taste.palette.map((c) => <span key={c.hex} title={c.name} className="h-8 w-8 rounded-full ring-1 ring-white/20" style={{ background: c.hex }} />)}</div>}
        {err && <p className="mt-6 rounded-lg bg-red-950 p-4 text-sm text-red-300">{err}</p>}
      </div>
    </main>
  );
}

function Storefront({ taste, col, portfolio, onReset }: { taste: TasteProfile; col: Collection; portfolio: Portfolio | null; onReset: () => void }) {
  const [ink, accent, accent2, , paper] = taste.palette.map((p) => p.hex);
  const [busy, setBusy] = useState<string | null>(null);
  async function buy(it: CollectionItem) {
    setBusy(it.productId);
    try { const { checkoutUrl } = await post<{ checkoutUrl: string }>("/api/checkout", { lines: [{ productId: it.productId, quantity: 1 }] }); window.location.href = checkoutUrl; }
    catch (e) { alert(String(e)); setBusy(null); }
  }
  const mocks = Object.entries(col.mock).filter(([, v]) => v).map(([k]) => k);
  return (
    <main style={{ background: paper, color: ink }} className="min-h-screen">
      {mocks.length > 0 && <div className="bg-black py-1 text-center text-xs text-white/70">Mock mode: {mocks.join(", ")}</div>}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-serif text-2xl font-bold tracking-tight">{taste.brandName}</span>
        <nav className="flex gap-6 text-sm"><a href="#shop">Shop</a><a href="#about">About</a><button onClick={onReset} className="opacity-60">New line ↺</button></nav>
      </header>
      <section className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl px-6">
        <div className="relative grid min-h-[420px] items-end overflow-hidden rounded-3xl p-10 md:p-16" style={{ background: `linear-gradient(135deg, ${accent}, ${accent2})` }}>
          {col.heroUrl ? <img src={col.heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> :
            <div className="absolute inset-0 grid grid-cols-3 opacity-40 mix-blend-multiply">{col.items.slice(0, 3).map((it) => <img key={it.productId} src={it.imageUrl} alt="" className="h-full w-full object-cover" />)}</div>}
          <div className="relative max-w-xl" style={{ color: paper }}>
            <p className="text-xs uppercase tracking-[0.4em]">The debut collection</p>
            <h1 className="mt-3 font-serif text-5xl leading-none md:text-7xl">{taste.tagline}</h1>
            <p className="mt-4 text-lg opacity-90">{taste.voice.sample}</p>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap gap-2">{taste.motifs.map((m) => <span key={m} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: ink }}>{m}</span>)}</div>
      </section>
      <section id="shop" className="mx-auto grid max-w-6xl gap-8 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {col.items.map((it) => (
          <article key={it.productId} className="group overflow-hidden rounded-2xl bg-white/60 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-xl">
            <div className="relative aspect-square overflow-hidden">
              <img src={it.lifestyleUrl ?? it.imageUrl} alt={it.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              <span className="absolute left-3 top-3 rounded-full px-3 py-1 text-[10px] uppercase tracking-widest" style={{ background: ink, color: paper }}>{it.world === "jewelry" ? "Fine jewelry" : it.categoryName}</span>
            </div>
            <div className="space-y-3 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-xl">{it.name}</h3>
                {it.price && <span className="font-medium">${it.price.amount}</span>}
              </div>
              <p className="text-sm opacity-75">{it.copy}</p>
              {it.maker && <p className="text-xs opacity-50">Made to order by {it.maker}</p>}
              <button onClick={() => buy(it)} disabled={!!busy} className="w-full rounded-full py-3 text-sm font-medium transition hover:opacity-90 disabled:opacity-50" style={{ background: accent, color: paper }}>
                {busy === it.productId ? "Opening checkout…" : "Buy now"}
              </button>
            </div>
          </article>
        ))}
      </section>
      <footer id="about" className="border-t px-6 py-10 text-center text-sm opacity-70" style={{ borderColor: ink }}>
        {taste.brandName}: {taste.voice.adjectives.join(" · ")}. Designed from {portfolio?.url ?? "the artist's portfolio"}, made with Arcade.
      </footer>
    </main>
  );
}
