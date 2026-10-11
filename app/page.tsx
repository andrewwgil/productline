"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import heroProducts from "@/public/hero/products.json";
import { MAX_PORTFOLIO_IMAGES, MAX_REFERENCE_IMAGES } from "@/lib/limits";
import type { Collection, CollectionItem, Portfolio, TasteProfile } from "@/lib/types";

type Step = "idle" | "scrape" | "taste" | "review" | "generate" | "done" | "error";
type StyleModel = { modelId: string; name: string };
const STEPS: [Step, string][] = [["scrape", "Reading your vision"], ["taste", "Distilling your taste"], ["generate", "Building the business"]];
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif)$/i;
type FolderAttrs = React.InputHTMLAttributes<HTMLInputElement> & { webkitdirectory?: string; directory?: string };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error ?? r.statusText);
  return d;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || IMAGE_FILE.test(file.name);
}

const STUDIO_PHASES = ["Vision into repeats", "Scarves, pillows, linens", "Jewelry from that taste", "Opening the business"];

function voiceLines(taste: TasteProfile | null): string[] {
  if (!taste) return ["The work is still deciding what it wants to become."];
  const sentences = taste.voice.sample.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
  const motifs = taste.motifs.slice(0, 3).map((motif) => `${motif.charAt(0).toUpperCase()}${motif.slice(1)}.`);
  return [...new Set([...sentences, taste.tagline, ...motifs])].slice(0, 6);
}

function Making({ taste }: { taste: TasteProfile | null }) {
  const lines = voiceLines(taste);
  const copy = lines.length ? lines : ["The line is on its way."];
  const [phase, setPhase] = useState(0);
  const [line, setLine] = useState(0);
  useEffect(() => {
    const rotate = setInterval(() => setLine((n) => (n + 1) % copy.length), 4500);
    const steps = setInterval(() => setPhase((n) => Math.min(n + 1, STUDIO_PHASES.length - 1)), 18000);
    return () => { clearInterval(rotate); clearInterval(steps); };
  }, [copy.length]);
  return (
    <div className="mt-10 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
      <p className="text-xs uppercase tracking-[0.35em] text-orange-400">{taste ? taste.brandName : "In the studio"}</p>
      <p key={copy[line]} aria-live="polite" className="voice-line mt-4 min-h-16 font-serif text-2xl leading-snug md:text-3xl">{copy[line]}</p>
      <ol className="mt-6 space-y-3">
        {STUDIO_PHASES.map((label, i) => (
          <li key={label} className={`flex items-center gap-3 text-sm ${i > phase ? "text-neutral-600" : ""}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${i < phase ? "bg-green-400" : i === phase ? "animate-pulse bg-orange-400" : "bg-neutral-700"}`} />
            {label}
          </li>
        ))}
      </ol>
      <p className="mt-5 text-xs text-neutral-500">Building the business from this taste. Usually a minute or two.</p>
    </div>
  );
}

function pickImages(list: FileList | File[]) {
  const images = [...list].filter(isImageFile);
  const files = [...images].sort((a, b) => b.size - a.size).slice(0, MAX_PORTFOLIO_IMAGES);
  files.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
  return { files, total: images.length };
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileLabel, setFileLabel] = useState("");
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [step, setStep] = useState<Step>("idle");
  const [err, setErr] = useState("");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [taste, setTaste] = useState<TasteProfile | null>(null);
  const [col, setCol] = useState<Collection | null>(null);
  const [models, setModels] = useState<StyleModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const working = step === "scrape" || step === "taste" || step === "generate";
  const shown = step !== "idle" && portfolio?.images.length ? portfolio.images : thumbs;

  useEffect(() => {
    const urls = files.filter(isImageFile).map((file) => URL.createObjectURL(file));
    setThumbs(urls);
    return () => urls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  }, [files]);

  function takeFolder(list: FileList | null) {
    const picked = pickImages(list ?? []);
    setFiles(picked.files);
    setPortfolio(null);
    setFileLabel(picked.total === 0 ? "No images in that folder" : picked.total > picked.files.length ? `${picked.files.length} of ${picked.total} images, largest first` : `${picked.files.length} image${picked.files.length === 1 ? "" : "s"} from folder`);
  }

  function takeZip(list: FileList | null) {
    const zip = [...(list ?? [])].find((file) => /\.zip$/i.test(file.name) || file.type === "application/zip");
    setFiles(zip ? [zip] : []);
    setPortfolio(null);
    setFileLabel(zip ? zip.name : "");
  }

  async function finish(p: Portfolio) {
    setPortfolio(p);
    setStep("taste");
    const tastePromise = post<{ taste: TasteProfile }>("/api/taste", p);
    const refsPromise = post<{ referenceIds: string[] }>("/api/references", { images: p.images.slice(0, MAX_REFERENCE_IMAGES) }).catch(() => ({ referenceIds: [] as string[] }));
    const modelsPromise = fetch("/api/models").then(async (response) => {
      const data = await response.json().catch(() => ({ items: [] }));
      const items = Array.isArray(data.items) ? data.items as StyleModel[] : [];
      return items.filter((model) => model?.modelId && model?.name);
    }).catch(() => [] as StyleModel[]);
    const { taste: nextTaste } = await tastePromise;
    setTaste(nextTaste);
    setModels(await modelsPromise);
    setModelId("");
    setReferenceIds((await refsPromise).referenceIds ?? []);
    setStep("review");
  }

  async function buildLine() {
    if (!taste) return;
    setErr("");
    try {
      setStep("generate");
      setCol(await post<Collection>("/api/collection", { taste, referenceIds, ...(modelId ? { modelId } : {}) }));
      setStep("done");
    } catch (e) { setErr(String(e)); setStep("error"); }
  }

  async function runUrl() {
    if (!url.trim()) return;
    setErr(""); setCol(null); setTaste(null); setPortfolio(null);
    try {
      setStep("scrape");
      await finish(await post<Portfolio>("/api/scrape", { url }));
    } catch (e) { setErr(String(e)); setStep("error"); }
  }

  async function runUpload() {
    if (!files.length) { setErr("Choose a folder of images or a .zip"); setStep("error"); return; }
    setErr(""); setCol(null); setTaste(null); setPortfolio(null);
    try {
      setStep("scrape");
      const body = new FormData();
      body.set("note", note);
      for (const file of files) body.append("file", file, file.webkitRelativePath || file.name);
      const response = await fetch("/api/upload", { method: "POST", body });
      const portfolioBody = await response.json();
      if (!response.ok || portfolioBody.error) throw new Error(portfolioBody.error ?? response.statusText);
      await finish(portfolioBody);
    } catch (e) { setErr(String(e)); setStep("error"); }
  }

  if (step === "review" && taste) return (
    <TasteReview
      taste={taste}
      models={models}
      modelId={modelId}
      onModel={setModelId}
      onBuild={buildLine}
      onReset={() => setStep("idle")}
    />
  );
  if (step === "generate" && taste) return (
    <main className="min-h-screen bg-[#0e0e10] text-white">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <Making taste={taste} />
      </div>
    </main>
  );
  if (step === "done" && taste && col) return <Storefront taste={taste} col={col} portfolio={portfolio} onReset={() => setStep("idle")} />;

  const status = STEPS.find(([name]) => name === step)?.[1];

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#fafaf8] text-[#161616]">
      <HeroProducts />
      <div className="relative z-20 mx-auto flex min-h-dvh flex-col items-center px-6 pb-16 pt-12 md:pt-16">
        <p className="font-serif text-[1.45rem] font-medium tracking-[-0.03em] text-[#1a1a1a]">Product Line</p>
        <h1 className="mt-[12vh] max-w-5xl text-center font-serif text-[clamp(2.75rem,6.4vw,6rem)] font-normal leading-[1.02] tracking-[-0.035em] text-[#141414]">
          Use your portfolio.<br />Find your product line.
        </h1>
        <form onSubmit={(e) => { e.preventDefault(); runUrl(); }} className="mt-10 w-full max-w-lg">
          <label className="relative block">
            <span className="sr-only">Portfolio URL</span>
            <LinkIcon />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a URL to your portfolio"
              aria-label="Portfolio URL"
              inputMode="url"
              disabled={working}
              className="h-14 w-full rounded-full border border-[#e4e4de] bg-white pl-12 pr-5 text-[15px] text-[#1a1a1a] shadow-[0_1px_2px_rgba(20,20,20,0.04)] outline-none placeholder:text-[#9b9b94] focus:border-[#cfcfc8] focus:ring-2 focus:ring-[#1c1c1c]/10 disabled:opacity-60"
            />
          </label>
        </form>
        <p className="mt-4 text-center text-sm text-[#8d8d86]">
          or{" "}
          <label className="cursor-pointer underline decoration-[#d5d5ce] underline-offset-4 hover:text-[#1a1a1a]">
            upload a folder
            <input
              type="file"
              multiple
              accept="image/*"
              disabled={working}
              className="sr-only"
              aria-label="Upload a folder of images"
              onChange={(e) => { const picked = e.target.files; if (picked?.length) takeFolder(picked); e.target.value = ""; }}
              {...({ webkitdirectory: "", directory: "" } as FolderAttrs)}
            />
          </label>
          {" "}or{" "}
          <label className="cursor-pointer underline decoration-[#d5d5ce] underline-offset-4 hover:text-[#1a1a1a]">
            a .zip
            <input type="file" accept=".zip,application/zip" disabled={working} className="sr-only" aria-label="Upload a zip of images" onChange={(e) => { const picked = e.target.files; if (picked?.length) takeZip(picked); e.target.value = ""; }} />
          </label>
        </p>
        {files.length > 0 && (
          <div className="mt-4 flex w-full max-w-lg flex-col items-center gap-3">
            <p className="text-sm text-[#6f6f68]">{fileLabel}</p>
            {shown.length > 0 && (
              <ul className="flex gap-2 overflow-x-auto">
                {shown.map((src, i) => (
                  <li key={`${i}-${src.slice(0, 24)}`} className="shrink-0">
                    <img src={src} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  </li>
                ))}
              </ul>
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" aria-label="Note or bio" className="h-10 w-full max-w-xs rounded-full border border-[#e4e4de] bg-white px-4 text-sm outline-none placeholder:text-[#9b9b94] focus:ring-2 focus:ring-[#1c1c1c]/10" />
            <button type="button" onClick={runUpload} disabled={working} className="text-sm text-[#1a1a1a] underline decoration-[#d5d5ce] underline-offset-4">Build from these files</button>
          </div>
        )}
        {status && <p className="mt-6 text-sm text-[#6f6f68]" aria-live="polite">{status}</p>}
        {err && <p className="mt-4 max-w-lg text-center text-sm text-red-700">{err}</p>}
      </div>
    </main>
  );
}

const HERO_SLOTS: { className: string; rot: string; delay: string; mobile?: boolean }[] = [
  { className: "left-[-7%] top-[16%] w-[min(28vw,300px)]", rot: "-7deg", delay: "0s" },
  { className: "left-[-2%] bottom-[-8%] w-[min(20vw,210px)]", rot: "5deg", delay: "-1.4s", mobile: true },
  { className: "left-[15%] bottom-[7%] w-[min(14vw,160px)]", rot: "-12deg", delay: "-2.2s", mobile: true },
  { className: "left-[34%] bottom-[-5%] w-[min(18vw,210px)]", rot: "3deg", delay: "-0.7s", mobile: true },
  { className: "left-[51%] bottom-[3%] w-[min(15vw,180px)]", rot: "-5deg", delay: "-2.8s" },
  { className: "right-[18%] bottom-[12%] w-[min(13vw,150px)]", rot: "9deg", delay: "-1.8s", mobile: true },
  { className: "right-[-8%] top-[20%] w-[min(24vw,270px)]", rot: "8deg", delay: "-0.3s" },
  { className: "right-[-1%] bottom-[-9%] w-[min(17vw,190px)]", rot: "-6deg", delay: "-3.1s", mobile: true },
  { className: "left-[7%] top-[24%] w-[min(12vw,140px)]", rot: "11deg", delay: "-1.1s" },
  { className: "right-[14%] top-[11%] w-[min(13vw,150px)]", rot: "-9deg", delay: "-2.5s" },
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
    <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b9b94]">
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" d="M10 13a5 5 0 0 0 7.07 0l1.42-1.41a5 5 0 0 0-7.08-7.08L10.5 5.4" />
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" d="M14 11a5 5 0 0 0-7.07 0L5.5 12.42a5 5 0 0 0 7.08 7.08l.91-.91" />
    </svg>
  );
}

function TasteReview({ taste, models, modelId, onModel, onBuild, onReset }: {
  taste: TasteProfile;
  models: StyleModel[];
  modelId: string;
  onModel: (id: string) => void;
  onBuild: () => void;
  onReset: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#0e0e10] text-white">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <p className="text-xs uppercase tracking-[0.4em] text-orange-400">Taste profile</p>
        <h1 className="mt-4 font-serif text-5xl leading-tight">{taste.brandName}</h1>
        <p className="mt-4 text-lg text-neutral-300">{taste.tagline}</p>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {taste.palette.map((swatch) => (
            <li key={`${swatch.name}-${swatch.hex}`} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
              <span className="h-10 w-10 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: swatch.hex }} />
              <span>
                <span className="block text-sm">{swatch.name}</span>
                <span className="block text-xs uppercase tracking-wider text-neutral-500">{swatch.hex}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          {taste.motifs.map((motif) => <span key={motif} className="rounded-full bg-white/10 px-3 py-1 text-sm">{motif}</span>)}
        </div>
        <p className="mt-6 font-serif text-2xl leading-snug">{taste.voice.sample}</p>
        <p className="mt-2 text-sm uppercase tracking-[0.2em] text-neutral-500">{taste.voice.adjectives.join(" · ")}</p>
        <fieldset className="mt-10">
          <legend className="text-xs uppercase tracking-[0.3em] text-neutral-500">Style</legend>
          <p className="mt-2 text-sm text-neutral-400">Your style uses the portfolio and this palette. A Canon model is optional.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" aria-pressed={modelId === ""} onClick={() => onModel("")} className={`rounded-full px-4 py-2 text-sm ${modelId === "" ? "bg-orange-500 text-black" : "bg-white/10 ring-1 ring-white/15"}`}>Your style</button>
            {models.map((model) => (
              <button type="button" key={model.modelId} aria-pressed={modelId === model.modelId} onClick={() => onModel(model.modelId)} className={`rounded-full px-4 py-2 text-sm ${modelId === model.modelId ? "bg-orange-500 text-black" : "bg-white/10 ring-1 ring-white/15"}`}>{model.name}</button>
            ))}
          </div>
        </fieldset>
        <div className="mt-8 flex items-center gap-4">
          <button type="button" onClick={onBuild} className="rounded-full bg-orange-500 px-8 py-4 font-medium text-black hover:bg-orange-400">Build the business</button>
          <button type="button" onClick={onReset} className="text-sm text-neutral-500">Start over</button>
        </div>
      </div>
    </main>
  );
}

function paletteRoles(palette: { hex: string }[]) {
  const hexes = palette.map((swatch) => swatch.hex);
  const ink = hexes[0] ?? "#111111";
  const paper = hexes[hexes.length - 1] ?? "#f4efe6";
  const light = (hex: string) => {
    const h = hex.replace("#", "");
    if (h.length < 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 210;
  };
  const accents = hexes.filter((hex) => hex !== ink && hex !== paper && !light(hex));
  return { ink, paper, accent: accents[0] ?? hexes[1] ?? ink, accent2: accents[1] ?? accents[0] ?? hexes[2] ?? ink };
}

function Storefront({ taste, col, portfolio, onReset }: { taste: TasteProfile; col: Collection; portfolio: Portfolio | null; onReset: () => void }) {
  const { ink, accent, accent2, paper } = paletteRoles(taste.palette);
  const [items, setItems] = useState(col.items);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    post<{ items: { productId: string; imageUrl: string }[] }>("/api/art", {
      items: col.items.map((item) => ({ productId: item.productId, patternId: item.patternId })),
    }).then((res) => {
      if (stop || !res.items) return;
      setItems((current) => current.map((item) => {
        const next = res.items.find((shot) => shot.productId === item.productId && shot.imageUrl);
        return next ? { ...item, imageUrl: next.imageUrl } : item;
      }));
    }).catch(() => {});
    return () => { stop = true; };
  }, [col]);
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
            <div className="absolute inset-0 grid grid-cols-3 opacity-40 mix-blend-multiply">{items.slice(0, 3).map((it) => <img key={it.productId} src={it.lifestyleUrl ?? it.imageUrl} alt="" className="h-full w-full object-cover" />)}</div>}
          <div className="relative max-w-xl" style={{ color: paper }}>
            <p className="text-xs uppercase tracking-[0.4em]">The debut collection</p>
            <h1 className="mt-3 font-serif text-5xl leading-none md:text-7xl">{taste.tagline}</h1>
            <p className="mt-4 text-lg opacity-90">{taste.voice.sample}</p>
          </div>
        </div>
      </section>
      {portfolio && portfolio.images.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pt-8">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] opacity-60">From the portfolio</p>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {portfolio.images.slice(0, 8).map((src, i) => (
              <li key={i} className="shrink-0"><img src={src} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-black/10" /></li>
            ))}
          </ul>
        </section>
      )}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap gap-2">{taste.motifs.map((m) => <span key={m} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: ink }}>{m}</span>)}</div>
      </section>
      <section id="shop" className="mx-auto grid max-w-6xl gap-8 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
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
        Built from {taste.brandName}&apos;s taste.
      </footer>
    </main>
  );
}
