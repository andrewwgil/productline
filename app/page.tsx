"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import heroProducts from "@/public/hero/products.json";
import { MAX_PORTFOLIO_IMAGES } from "@/lib/limits";
import type { ItemStatus } from "@/lib/line";
import type { LinePlan, PlanItem, Portfolio, ProductCard } from "@/lib/types";

type Stage = "start" | "pick" | "reading" | "line";
type Plan = LinePlan & { notice?: string };
type Slot = { item: PlanItem; state: "starting" | "making" | "ready" | "failed"; jobId?: string; startedAt: number; product?: ProductCard; error?: string };

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|heic)$/i;
const ZIP_FILE = /\.zip$/i;
const POLL_MS = 4000;
const SAVE_KEY = "productline:line";
type Saved = { plan: Plan; slots: Slot[]; images: string[]; referenceIds: (string | null)[] };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error ?? r.statusText);
  return d;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (price: ProductCard["price"]) => price ? new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency || "USD", maximumFractionDigits: price.amount % 1 ? 2 : 0 }).format(price.amount) : null;
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export default function Home() {
  const [stage, setStage] = useState<Stage>("start");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [fromUpload, setFromUpload] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const refs = useRef<Promise<(string | null)[]> | null>(null);
  const [referenceIds, setReferenceIds] = useState<(string | null)[]>([]);
  const chosen = useMemo(() => (portfolio ? selected.map((i) => portfolio.images[i]).filter(Boolean) : []), [portfolio, selected]);

  function reset() {
    setStage("start"); setBusy(""); setErr(""); setNotice(""); setPortfolio(null); setSelected([]); setPlan(null); setSlots([]);
    refs.current = null;
    setReferenceIds([]);
    try { sessionStorage.removeItem(SAVE_KEY); } catch { /* storage blocked */ }
  }

  // A line survives a reload: restore it and keep polling its Arcade jobs.
  useEffect(() => {
    let saved: Saved | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) ?? "null"); } catch { /* storage blocked or corrupt */ }
    if (!saved?.plan || !Array.isArray(saved.slots)) return;
    const { plan: savedPlan, images, slots: savedSlots, referenceIds: ids = [] } = saved;
    refs.current = Promise.resolve(ids);
    setReferenceIds(ids);
    setPortfolio({ url: "", title: "", description: "", text: "", images });
    setSelected(images.map((_, i) => i));
    setPlan(savedPlan);
    setSlots(savedSlots.map((s) => s.state === "starting" ? { ...s, state: "failed", error: "Interrupted before Arcade started." } : s));
    setStage("line");
  }, []);

  useEffect(() => {
    if (stage !== "line" || !plan) return;
    const saved: Saved = { plan, slots, images: chosen, referenceIds };
    try { sessionStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch { /* storage full or blocked */ }
  }, [stage, plan, slots, chosen, referenceIds]);

  async function fromUrl() {
    if (!url.trim() || busy) return;
    setErr(""); setNotice(""); setBusy("Reading the page and pulling the artwork");
    try {
      const p = await post<Portfolio>("/api/scrape", { url });
      setPortfolio(p);
      setFromUpload(false);
      setSelected(p.images.slice(0, MAX_PORTFOLIO_IMAGES).map((_, i) => i));
      setStage("pick");
    } catch (e) { setErr(message(e)); }
    finally { setBusy(""); }
  }

  async function fromFiles(list: FileList | null) {
    const files = [...(list ?? [])];
    const zip = files.find((file) => ZIP_FILE.test(file.name) || file.type.includes("zip"));
    const images = files.filter((file) => file.type.startsWith("image/") || IMAGE_FILE.test(file.name));
    if (!zip && !images.length) { setErr("Choose images or a .zip"); return; }
    const picked = zip ? [zip] : images.slice(0, MAX_PORTFOLIO_IMAGES);
    setErr("");
    setNotice(!zip && images.length > MAX_PORTFOLIO_IMAGES ? `Using the first ${MAX_PORTFOLIO_IMAGES} of ${images.length} images.` : "");
    setBusy("Preparing your images");
    try {
      const body = new FormData();
      for (const file of picked) body.append("file", file, file.name);
      const r = await fetch("/api/upload", { method: "POST", body });
      const p = await r.json();
      if (!r.ok || p.error) throw new Error(p.error ?? r.statusText);
      setPortfolio(p);
      setFromUpload(true);
      const all = (p as Portfolio).images.map((_, i) => i);
      setSelected(all);
      await read(p, all, true);
    } catch (e) { setErr(message(e)); setBusy(""); }
  }

  async function read(p: Portfolio, indexes: number[], upload: boolean) {
    const images = indexes.map((i) => p.images[i]).filter(Boolean);
    if (!images.length) return;
    setErr(""); setBusy(""); setStage("reading");
    refs.current = post<{ referenceIds: (string | null)[] }>("/api/references", { images }).then((r) => r.referenceIds).catch(() => images.map(() => null));
    refs.current.then(setReferenceIds);
    try {
      const next = await post<Plan>("/api/direct", { ...p, images });
      setPlan(next);
      setSlots([]);
      setStage("line");
    } catch (e) {
      setErr(message(e));
      setStage(upload ? "start" : "pick");
    }
  }

  async function start(item: PlanItem, all: Plan) {
    const ids = (await refs.current) ?? [];
    const referenceIds = item.referenceIndexes.map((i) => ids[i]).filter((id): id is string => Boolean(id));
    try {
      const { jobId } = await post<{ jobId: string }>("/api/make", {
        item, referenceIds, colors: all.taste.palette.map((c) => c.hex), motifs: all.taste.motifs, modelId: "",
      });
      setSlots((cur) => cur.map((s) => s.item.key === item.key ? { ...s, state: "making", jobId } : s));
    } catch (e) {
      setSlots((cur) => cur.map((s) => s.item.key === item.key ? { ...s, state: "failed", error: message(e) } : s));
    }
  }

  function build() {
    if (!plan) return;
    const now = Date.now();
    setSlots(plan.items.map((item) => ({ item, state: "starting", startedAt: now })));
    plan.items.forEach((item) => start(item, plan));
  }

  function retry(key: string) {
    const slot = slots.find((s) => s.item.key === key);
    if (!slot || !plan) return;
    setSlots((cur) => cur.map((s) => s.item.key === key ? { item: s.item, state: "starting", startedAt: Date.now() } : s));
    start(slot.item, plan);
  }

  useEffect(() => { window.scrollTo(0, 0); }, [stage]);

  // Poll Arcade jobs while any product is still being made.
  const making = slots.some((s) => s.state === "making");
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  useEffect(() => {
    if (!making) return;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      await Promise.all(slotsRef.current.filter((s) => s.state === "making" && s.jobId).map(async (s) => {
        const r = await post<ItemStatus>("/api/make/status", { jobId: s.jobId }).catch(() => null);
        if (!r || r.status === "running") return;
        setSlots((cur) => cur.map((c) => c.jobId !== s.jobId ? c : r.status === "succeeded" ? { ...c, state: "ready", product: r.product } : { ...c, state: "failed", error: r.error }));
      }));
      inFlight = false;
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [making]);

  if (stage === "pick" && portfolio) return (
    <PickImages
      portfolio={portfolio}
      selected={selected}
      onToggle={(i) => setSelected((cur) => cur.includes(i) ? cur.filter((n) => n !== i) : cur.length < MAX_PORTFOLIO_IMAGES ? [...cur, i].sort((a, b) => a - b) : cur)}
      onRead={() => read(portfolio, selected, false)}
      onReset={reset}
      err={err}
    />
  );
  if (stage === "reading") return <Reading images={chosen} />;
  if (stage === "line" && plan) return (
    <Studio
      plan={plan}
      slots={slots}
      images={chosen}
      onBuild={build}
      onRetry={retry}
      onBack={fromUpload || !portfolio?.url ? reset : () => setStage("pick")}
      backLabel={fromUpload || !portfolio?.url ? "Start over" : "Change images"}
      onReset={reset}
    />
  );

  return (
    <main className="relative min-h-[max(100dvh,700px)] overflow-hidden bg-paper text-ink md:min-h-[max(100dvh,860px)]">
      <HeroProducts />
      <div className="relative z-20 mx-auto flex flex-col items-center px-6 pb-16 pt-10 md:pt-14">
        <p className="font-serif text-[1.65rem] tracking-[-0.03em]">Product Line</p>
        <h1 className="mt-[9vh] max-w-5xl text-center font-serif text-[clamp(2.75rem,6.4vw,6rem)] font-normal leading-[0.96] tracking-[-0.045em]">
          <span className="sr-only">Use your portfolio, taste, or inspiration. Find your product line.</span>
          <span aria-hidden="true">Use your <span className="whitespace-nowrap"><RotatingWord words={["portfolio", "taste", "inspiration"]} />.</span><br />Find your product line.</span>
        </h1>
        <form onSubmit={(e) => { e.preventDefault(); fromUrl(); }} className="mt-10 w-full max-w-lg">
          <label className="relative block">
            <span className="sr-only">Portfolio URL</span>
            <LinkIcon />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a URL to your portfolio"
              aria-label="Portfolio URL"
              inputMode="url"
              disabled={!!busy}
              className="h-14 w-full rounded-[32px] border border-field bg-white pl-12 pr-5 text-base text-[#242934] shadow-[0_3px_10px_#18232a02] outline-none transition placeholder:text-hint focus:border-focus focus:ring-[3px] focus:ring-green/5 disabled:opacity-60"
            />
          </label>
        </form>
        <DropZone disabled={!!busy} onFiles={fromFiles} />
        {busy && <p className="mt-6 flex items-center gap-2 text-sm text-muted" aria-live="polite"><Dots />{busy}</p>}
        {notice && !err && <p className="mt-3 text-sm text-muted">{notice}</p>}
        {err && <p className="mt-4 max-w-lg text-center text-[13px] leading-snug text-ink" role="alert">{err}</p>}
      </div>
    </main>
  );
}

/** Cycles the last word of the headline. Holds the first word when reduced motion is on. */
function RotatingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % words.length), 2600);
    return () => clearInterval(t);
  }, [words.length]);
  return <span key={words[i]} className="rotating-word inline-block">{words[i]}</span>;
}

function DropZone({ disabled, onFiles }: { disabled: boolean; onFiles: (files: FileList | null) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles(e.dataTransfer.files); }}
      className={`mt-4 flex w-full max-w-lg cursor-pointer flex-col items-center rounded-[18px] border-[1.5px] border-dashed px-6 py-7 text-center transition ${over ? "border-focus bg-[#f5f7f4]" : "border-field bg-white/70 hover:border-[#c9cdc8] hover:bg-white"} ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 text-[#454e5f]">
        <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
      </svg>
      <span className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-[#242934]">Drop images here or click to upload</span>
      <span className="mt-1 text-[13px] text-hint">Add up to {MAX_PORTFOLIO_IMAGES} images</span>
      <input
        type="file"
        multiple
        accept="image/*,.zip,application/zip"
        disabled={disabled}
        className="sr-only"
        aria-label={`Upload up to ${MAX_PORTFOLIO_IMAGES} images`}
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
      />
    </label>
  );
}

function Dots() {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => <i key={i} className="kai-dot block h-[5px] w-[5px] rounded-full bg-[#6d747c]" style={{ animationDelay: `${i * 0.16}s` }} />)}
    </span>
  );
}

function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="mx-auto flex h-20 max-w-5xl items-center justify-between px-6">
      <span className="font-serif text-[1.4rem] tracking-[-0.03em]">Product Line</span>
      {right}
    </header>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="px-0.5 py-2 text-sm font-semibold tracking-[-0.01em] text-subtle hover:text-ink">{children}</button>;
}

function PickImages({ portfolio, selected, onToggle, onRead, onReset, err }: {
  portfolio: Portfolio; selected: number[]; onToggle: (i: number) => void; onRead: () => void; onReset: () => void; err: string;
}) {
  const full = selected.length >= MAX_PORTFOLIO_IMAGES;
  let host = portfolio.url;
  try { host = new URL(portfolio.url).hostname.replace(/^www\./, ""); } catch { /* keep the raw url */ }
  return (
    <main className="min-h-dvh bg-paper text-ink">
      <Header right={<TextButton onClick={onReset}>Start over</TextButton>} />
      <div className="mx-auto max-w-5xl px-6 pb-32 pt-8">
        <p className="text-sm text-muted">{host}</p>
        <h1 className="mt-2 font-serif text-[clamp(2rem,4.3vw,3.25rem)] font-normal leading-[1.05] tracking-[-0.04em]">Pick the work that sounds like you.</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
          Choose up to {MAX_PORTFOLIO_IMAGES}.
        </p>
        <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {portfolio.images.map((src, i) => {
            const on = selected.includes(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`Image ${i + 1}${on ? ", selected" : ""}`}
                  onClick={() => onToggle(i)}
                  disabled={!on && full}
                  className={`group relative block aspect-square w-full overflow-hidden rounded-[14px] border bg-white transition ${on ? "border-ink" : "border-[#e6e5e1] opacity-60 hover:opacity-100"} disabled:cursor-not-allowed disabled:hover:opacity-60`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <span className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${on ? "bg-ink text-white" : "border border-field bg-white/90 text-transparent"}`}>
                    {on ? selected.indexOf(i) + 1 : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <p className="text-sm text-muted" aria-live="polite">{selected.length} of {MAX_PORTFOLIO_IMAGES} picked{err && <span className="ml-3 text-ink">{err}</span>}</p>
          <button type="button" onClick={onRead} disabled={!selected.length} className="h-10 rounded-full bg-pill px-[18px] text-sm font-semibold tracking-[-0.01em] text-white hover:bg-pill-hover disabled:bg-[#e4e4e1] disabled:text-[#8d8d89]">
            Read my taste
          </button>
        </div>
      </div>
    </main>
  );
}

function Reading({ images }: { images: string[] }) {
  const [line, setLine] = useState(0);
  const lines = ["Looking at the work", "Finding the palette", "Naming the motifs", "Choosing what Arcade should make", "Writing the prompts"];
  useEffect(() => { const t = setInterval(() => setLine((n) => Math.min(n + 1, lines.length - 1)), 3500); return () => clearInterval(t); }, [lines.length]);
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <div className="flex flex-col items-center text-center">
        <ul className="flex -space-x-6">
          {images.slice(0, 6).map((src, i) => (
            <li key={i} className="h-20 w-20 overflow-hidden rounded-[14px] border-2 border-paper bg-white shadow-[0_8px_24px_rgba(20,23,22,.12)]" style={{ rotate: `${(i - 2.5) * 4}deg` }}>
              <img src={src} alt="" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
        <h1 className="mt-10 font-serif text-[clamp(2rem,4vw,3rem)] font-normal tracking-[-0.04em]">Reading your taste</h1>
        <p key={line} className="voice-line mt-3 flex items-center gap-2 text-[15px] text-muted" aria-live="polite"><Dots />{lines[line]}</p>
      </div>
    </main>
  );
}

/** One screen for the line: each column previews its blank Arcade product, then shows it being made, then the finished product. */
function Studio({ plan, slots, images, onBuild, onRetry, onBack, backLabel, onReset }: {
  plan: Plan; slots: Slot[]; images: string[]; onBuild: () => void; onRetry: (key: string) => void; onBack: () => void; backLabel: string; onReset: () => void;
}) {
  const { taste } = plan;
  const [now, setNow] = useState(() => Date.now());
  const [buying, setBuying] = useState<string | null>(null);
  const [buyErr, setBuyErr] = useState("");
  const [fresh, setFresh] = useState<Record<string, ProductCard>>({});
  const [focused, setFocused] = useState<number | null>(null);
  const building = slots.length > 0;
  const pending = slots.filter((s) => s.state === "starting" || s.state === "making").length;
  const ready = slots.filter((s) => s.state === "ready").length;
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pending]);

  useEffect(() => {
    if (focused == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFocused(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  async function buy(productId: string) {
    setBuying(productId); setBuyErr("");
    // Open during the click so the browser always allows the new tab, then point it at checkout.
    const tab = window.open("about:blank", "_blank");
    try {
      const { checkoutUrl } = await post<{ checkoutUrl: string }>("/api/checkout", { lines: [{ productId, quantity: 1 }] });
      if (tab) {
        tab.opener = null;
        tab.location.href = checkoutUrl;
      } else {
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      tab?.close();
      setBuyErr(message(e));
    } finally {
      setBuying(null);
    }
  }

  // Arcade image URLs expire. Re-fetch a card once if its image stops loading.
  async function refresh(productId: string) {
    if (fresh[productId]) return;
    const { products } = await post<{ products: ProductCard[] }>("/api/art", { productIds: [productId] }).catch(() => ({ products: [] as ProductCard[] }));
    if (products[0]) setFresh((cur) => ({ ...cur, [productId]: products[0] }));
  }

  return (
    <main className="min-h-dvh bg-paper text-ink">
      <Header right={building ? <TextButton onClick={onReset}>New line</TextButton> : <TextButton onClick={onBack}>{backLabel}</TextButton>} />
      <section className="mx-auto max-w-6xl px-6 pt-8">
        <h1 className="font-serif text-[clamp(2.75rem,6vw,5rem)] font-normal leading-[0.96] tracking-[-0.045em]">{taste.brandName}</h1>
        {images.length > 0 && (
          <ul className="mt-6 flex gap-3 overflow-x-auto" aria-label="From the portfolio">
            {images.map((src, i) => (
              <li key={i} className="h-20 w-20 shrink-0 overflow-hidden rounded-[12px] border border-[#e6e5e1] bg-white">
                <button type="button" onClick={() => setFocused(i)} aria-label={`View portfolio image ${i + 1} larger`} className="block h-full w-full cursor-zoom-in">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-10 max-w-2xl">
          {taste.brief && <p className="text-base leading-relaxed text-[#1c1f23]">{taste.brief}</p>}
          {plan.notice && <p className={`${taste.brief ? "mt-4 " : ""}rounded-[14px] border border-line bg-white px-4 py-3 text-sm text-muted`}>{plan.notice}</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {taste.motifs.map((motif) => <span key={motif} className="rounded-full bg-chip px-3 py-1 text-xs text-chip-ink">{motif}</span>)}
        </div>

        <div className="mt-12 flex min-h-12 flex-wrap items-center justify-center gap-x-5 gap-y-3" aria-live="polite">
          {!building ? (
            <button type="button" onClick={onBuild} className="h-12 min-w-80 rounded-full bg-pill px-12 text-[15px] font-semibold tracking-[-0.01em] text-white hover:bg-pill-hover">Build the line</button>
          ) : pending ? (
            <p className="flex items-center gap-2 text-sm text-muted"><Dots />Arcade is making {pending} of {slots.length} products</p>
          ) : (
            <p className="text-sm text-muted">{ready} of {slots.length} products ready</p>
          )}
        </div>
        {buyErr && <p className="mt-2 text-[13px] text-ink" role="alert">{buyErr}</p>}
      </section>

      <section className="mx-auto grid max-w-6xl gap-x-8 gap-y-12 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {plan.items.map((item) => {
          const slot = slots.find((s) => s.item.key === item.key);
          const product = slot?.product ? fresh[slot.product.productId] ?? slot.product : undefined;
          const price = money(product?.price ?? null);
          const working = slot?.state === "starting" || slot?.state === "making";
          const refs = item.referenceIndexes.map((i) => images[i]).filter(Boolean);
          return (
            <article key={item.key} className="flex flex-col">
              <div className="relative aspect-square overflow-hidden rounded-[18px] border border-[#e6e5e1] bg-white">
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt={`A blank ${item.categoryName.toLowerCase()}`} className={`absolute inset-0 h-full w-full object-cover transition duration-700 ${working ? "scale-105 blur-[6px]" : ""}`} />
                ) : refs[0] && (
                  <img src={refs[0]} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-xl" />
                )}

                {!product && !working && slot?.state !== "failed" && (
                  <Inspiration refs={refs} palette={taste.palette} jewelry={item.world === "jewelry"} />
                )}

                {working && slot && (
                  <div className="making-veil explore-in absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <Dots />
                      <p className="mt-3 text-[13px] font-semibold tracking-[-0.01em]">{slot.state === "starting" ? "Sending to Arcade" : item.world === "jewelry" ? "Designing the piece" : "Designing the print"}</p>
                      <p className="mt-1 text-xs tabular-nums text-muted">{clock(now - slot.startedAt)}</p>
                    </div>
                  </div>
                )}

                {slot?.state === "failed" && (
                  <div className="absolute inset-0 grid place-items-center bg-white/90 p-6 text-center">
                    <div>
                      <p className="text-sm text-ink">Arcade couldn&apos;t make this one.</p>
                      <p className="mt-1 line-clamp-4 text-xs text-muted">{slot.error}</p>
                      <button type="button" onClick={() => onRetry(item.key)} className="mt-4 h-9 rounded-full bg-pill px-4 text-[13px] font-semibold text-white hover:bg-pill-hover">Try again</button>
                    </div>
                  </div>
                )}

                {product?.imageUrl && (
                  <img src={product.imageUrl} alt={item.name} onError={() => refresh(product.productId)} className="explore-in absolute inset-0 h-full w-full object-cover" />
                )}
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{item.categoryName}</p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-[22px] font-normal leading-tight tracking-[-0.03em]">{item.name}</h3>
                {price && <span className="text-[15px] text-[#252b37]">{price}</span>}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-subtle">{item.copy}</p>
              {product?.maker && <p className="mt-1 text-xs text-muted">Made to order by {product.maker}</p>}
              {!building && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-subtle hover:text-ink">Arcade prompt</summary>
                  <p className="mt-2 leading-relaxed text-muted">{item.prompt}</p>
                </details>
              )}
              {product && (
                <>
                  <button type="button" className="mt-4 h-10 rounded-full border border-ink bg-transparent text-sm font-semibold tracking-[-0.01em] text-ink hover:bg-ink/5">Add to Shopify</button>
                  <button type="button" onClick={() => buy(product.productId)} disabled={!!buying} className="mt-2 h-10 rounded-full bg-pill text-sm font-semibold tracking-[-0.01em] text-white hover:bg-pill-hover disabled:opacity-50">
                    {buying === product.productId ? "Opening checkout" : "Buy on Arcade"}
                  </button>
                </>
              )}
            </article>
          );
        })}
      </section>

      {focused != null && images[focused] && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#141716]/55 p-6 backdrop-blur-[2px]" onClick={() => setFocused(null)}>
          <img
            src={images[focused]}
            alt={`Portfolio image ${focused + 1}`}
            className="explore-in max-h-[85vh] max-w-[min(92vw,960px)] rounded-[18px] bg-white object-contain shadow-[0_24px_80px_rgba(20,23,22,.28)]"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

    </main>
  );
}

/** The work guiding a product, fanned in the corner of its blank photo. Jewelry has no references, so it shows the palette. */
function Inspiration({ refs, palette, jewelry }: { refs: string[]; palette: { name: string; hex: string }[]; jewelry: boolean }) {
  const tiles = jewelry || !refs.length ? palette.slice(0, 4).map((c) => ({ key: c.hex + c.name, bg: c.hex, src: "" })) : refs.slice(0, 3).map((src, i) => ({ key: `${i}`, bg: "#fff", src }));
  const mid = (tiles.length - 1) / 2;
  return (
    <div className="absolute bottom-3 left-3 flex items-end gap-2">
      <ul className="flex -space-x-4" aria-label={jewelry ? "Palette guiding this piece" : "Images guiding this print"}>
        {tiles.map((t, i) => (
          <li key={t.key} className="h-12 w-12 overflow-hidden rounded-[9px] border-2 border-white shadow-[0_6px_16px_rgba(20,23,22,.18)]" style={{ background: t.bg, rotate: `${(i - mid) * 6}deg` }}>
            {t.src && <img src={t.src} alt="" className="h-full w-full object-cover" />}
          </li>
        ))}
      </ul>
      <span className="mb-0.5 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold tracking-[-0.01em] text-subtle shadow-[0_1px_4px_rgba(20,23,22,.12)] backdrop-blur">
        {jewelry ? "From your palette" : "From your work"}
      </span>
    </div>
  );
}

const HERO_SLOTS: { className: string; rot: string; delay: string; mobile?: boolean }[] = [
  { className: "left-[-2%] top-[52%] w-[min(17vw,250px)]", rot: "-8deg", delay: "0s" },
  { className: "left-[18%] bottom-[11%] w-[min(10vw,150px)]", rot: "-6deg", delay: "-2.2s", mobile: true },
  { className: "left-[38%] bottom-[2%] w-[min(11vw,165px)]", rot: "4deg", delay: "-0.7s", mobile: true },
  { className: "right-[20%] bottom-[13%] w-[min(9.5vw,140px)]", rot: "6deg", delay: "-1.8s" },
  { className: "left-[4%] bottom-[-5%] w-[min(15vw,220px)]", rot: "9deg", delay: "-1.4s", mobile: true },
  { className: "left-[56%] bottom-[-4%] w-[min(10vw,150px)]", rot: "-3deg", delay: "-2.8s", mobile: true },
  { className: "right-[-3%] top-[48%] w-[min(16vw,240px)]", rot: "10deg", delay: "-0.3s" },
  { className: "right-[5%] bottom-[-4%] w-[min(11vw,165px)]", rot: "-8deg", delay: "-3.1s", mobile: true },
];

function HeroProducts() {
  return (
    <ul className="pointer-events-none absolute inset-0" aria-label="Arcade products">
      {heroProducts.map((product, index) => {
        const slot = HERO_SLOTS[index % HERO_SLOTS.length];
        return (
          <li key={product.href} className="contents">
            <a
              href={product.href}
              target="_blank"
              rel="noopener noreferrer"
              data-mobile={slot.mobile ? "true" : undefined}
              aria-label={`${product.title}. Opens on Arcade.`}
              className={`hero-item pointer-events-auto ${slot.className}`}
              style={{ ["--rot" as string]: slot.rot, ["--delay" as string]: slot.delay }}
            >
              <img src={product.imageUrl} alt={product.title} />
              <span className="hero-tip">{product.title}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#454e5f]">
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" d="M10 13a5 5 0 0 0 7.07 0l1.42-1.41a5 5 0 0 0-7.08-7.08L10.5 5.4" />
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" d="M14 11a5 5 0 0 0-7.07 0L5.5 12.42a5 5 0 0 0 7.08 7.08l.91-.91" />
    </svg>
  );
}
