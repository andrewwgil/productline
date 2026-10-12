"use client";

import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CARNIVAL,
  TIERS,
  displayName,
  fitsTier,
  tierById,
  type Catalog,
  type PrizeCategory,
  type PrizeModel,
  type PrizePalette,
  type PrizeProduct,
  type TierId,
} from "@/lib/arcade/prize-data";
import CabinetScene from "./cabinet";
import { playLand, playLever, playPeg, playWin, setArcadeMuted, startWhoosh, stopWhoosh, unlockArcadeAudio } from "./sounds";
import type { WheelSlice } from "./wheel-texture";

type Segment = WheelSlice & {
  kind: "item" | "style" | "color";
  item?: PrizeCategory;
  model?: PrizeModel;
  palette?: PrizePalette;
};

type Picks = { item?: PrizeCategory; style?: PrizeModel; palette?: PrizePalette };
type Phase = "loading" | "attract" | "ready" | "spinning" | "printing" | "reveal" | "error";
type Step = 0 | 1 | 2;

type JobState = {
  spinId: string;
  phase: "pattern" | "product";
  jobId: string;
  patternId?: string;
  productRequestId: string;
  pollMs: number;
  mock: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

async function post<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/arcade/spin-build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Arcade could not build this prize.");
  return data as T;
}

export default function ArcadeExperience() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tier, setTier] = useState<TierId | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [nextStep, setNextStep] = useState<Step>(0);
  const [wheelStep, setWheelStep] = useState<Step>(0);
  const [locked, setLocked] = useState<Segment[] | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [product, setProduct] = useState<PrizeProduct | null>(null);
  const [error, setError] = useState("");
  const [spinKey, setSpinKey] = useState(0);
  const [target, setTarget] = useState(0);
  const [leverKey, setLeverKey] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [printPhase, setPrintPhase] = useState<"pattern" | "product">("pattern");
  const [flags, setFlags] = useState({ mobile: false, reduced: false });
  const [live, setLive] = useState("The cabinet is warming up.");
  const outcome = useRef<{ segs: Segment[]; index: number; step: Step } | null>(null);
  const picksRef = useRef(picks);
  picksRef.current = picks;
  const run = useRef(0);

  const reload = useCallback(() => {
    setLoadError("");
    setPhase("loading");
    fetch("/api/arcade/spin-build", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load the cabinet.");
        setCatalog(data as Catalog);
        setPhase("attract");
        setLive("Pick Under $20 or Under $50, then spin.");
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Could not load the cabinet.");
        setPhase("error");
      });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 760px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setFlags({ mobile: mobile.matches, reduced: reduced.matches });
    sync();
    mobile.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    return () => {
      mobile.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
      run.current += 1;
    };
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("productline:arcade-mute") === "1") {
        setMuted(true);
        setArcadeMuted(true);
      }
    } catch { /* storage blocked */ }
  }, []);

  const tierMax = tier ? tierById(tier)?.max ?? 50 : null;
  const liveSegments = useMemo(() => {
    if (!catalog) return [];
    if (nextStep === 1) {
      return catalog.models.map((model, index) => ({
        id: model.modelId,
        label: displayName(model.name),
        fills: [CARNIVAL[index % CARNIVAL.length]],
        kind: "style" as const,
        model,
      }));
    }
    if (nextStep === 2 && !locked) {
      return catalog.palettes.map((palette) => ({
        id: palette.id,
        label: palette.name,
        fills: palette.colors,
        kind: "color" as const,
        palette,
      }));
    }
    const rows = tierMax == null ? catalog.categories : catalog.categories.filter((category) => fitsTier(category.price, tierMax));
    return rows.map((category, index) => ({
      id: category.categoryId,
      label: category.name,
      fills: [CARNIVAL[index % CARNIVAL.length]],
      kind: "item" as const,
      item: category,
    }));
  }, [catalog, locked, nextStep, tierMax]);

  const segments = locked ?? liveSegments;
  const filteredEmpty = Boolean(tier && nextStep === 0 && catalog && !liveSegments.length && !locked);

  const marquee = phase === "printing"
    ? "Printing"
    : phase === "reveal"
      ? "Winner"
      : phase === "spinning"
        ? (["Item", "Style", "Color"] as const)[wheelStep]
        : !tier
          ? "Pick a tier"
          : (["Spin the item", "Spin the style", "Spin the color"] as const)[nextStep];

  function toggleMute() {
    unlockArcadeAudio();
    const next = !muted;
    setMuted(next);
    setArcadeMuted(next);
    try { sessionStorage.setItem("productline:arcade-mute", next ? "1" : "0"); } catch { /* storage blocked */ }
  }

  function chooseTier(id: TierId) {
    if (nextStep > 0 || spinning || phase === "printing") return;
    unlockArcadeAudio();
    setTier(id);
    setLocked(null);
    setPhase("ready");
    setError("");
    setLive(`${id === "20" ? "Under $20" : "Under $50"} selected.`);
  }

  function reset() {
    run.current += 1;
    stopWhoosh();
    setSpinning(false);
    setLocked(null);
    setNextStep(0);
    setWheelStep(0);
    setPicks({});
    setProduct(null);
    setError("");
    setPhase(tier ? "ready" : "attract");
    setLive(tier ? "Spin the item." : "Pick a price tier.");
  }

  async function build(current: Picks) {
    if (!current.item || !current.style || !current.palette || !tier) return;
    const token = ++run.current;
    const alive = () => run.current === token;
    setPhase("printing");
    setPrintPhase("pattern");
    setError("");
    setLive("The machine is printing your prize.");
    const startedAt = Date.now();
    try {
      let state = await post<JobState & { status?: string; error?: string }>({
        action: "start",
        tier,
        categoryId: current.item.categoryId,
        modelId: current.style.modelId,
        paletteId: current.palette.id,
      });
      if (!alive()) return;
      if (state.status === "failed") throw new Error(state.error || "Arcade could not start.");
      for (;;) {
        const tick = await post<JobState & { status: string; error?: string; product?: PrizeProduct }>({
          action: "tick",
          spinId: state.spinId,
          phase: state.phase,
          jobId: state.jobId,
          patternId: state.patternId,
          productRequestId: state.productRequestId,
          categoryId: current.item.categoryId,
          world: current.item.world,
          categoryName: current.item.name,
          styleName: displayName(current.style.name),
          paletteName: current.palette.name,
          colors: current.palette.colors,
        });
        if (!alive()) return;
        if (tick.status === "failed") throw new Error(tick.error || "Arcade could not make this prize.");
        if (tick.status === "succeeded" && tick.product) {
          const wait = 2400 - (Date.now() - startedAt);
          if (wait > 0) await sleep(wait);
          if (!alive()) return;
          setProduct(tick.product);
          setPhase("reveal");
          playWin();
          setLive(`${tick.product.title}, ${tick.product.price ? money(tick.product.price.amount, tick.product.price.currency) : "priced by Arcade"}.`);
          return;
        }
        state = {
          spinId: tick.spinId || state.spinId,
          phase: tick.phase || state.phase,
          jobId: tick.jobId || state.jobId,
          patternId: tick.patternId || state.patternId,
          productRequestId: tick.productRequestId || state.productRequestId,
          pollMs: tick.pollMs || state.pollMs,
          mock: tick.mock ?? state.mock,
        };
        setPrintPhase(state.phase);
        const pause = Math.max(state.mock ? 350 : 2000, state.pollMs || 3000);
        await sleep(pause);
      }
    } catch (err) {
      if (!alive()) return;
      setError(err instanceof Error ? err.message : "Arcade could not make this prize.");
      setPhase("error");
      setLive("The press stopped.");
    }
  }

  function spin() {
    if (!catalog || spinning || phase === "printing") return;
    const step = nextStep;
    const segs: Segment[] = step === 0
      ? (tierMax == null ? [] : catalog.categories.filter((category) => fitsTier(category.price, tierMax)).map((category, index) => ({
        id: category.categoryId,
        label: category.name,
        fills: [CARNIVAL[index % CARNIVAL.length]],
        kind: "item" as const,
        item: category,
      })))
      : step === 1
        ? catalog.models.map((model, index) => ({
          id: model.modelId,
          label: displayName(model.name),
          fills: [CARNIVAL[index % CARNIVAL.length]],
          kind: "style" as const,
          model,
        }))
        : catalog.palettes.map((palette) => ({
          id: palette.id,
          label: palette.name,
          fills: palette.colors,
          kind: "color" as const,
          palette,
        }));
    if (!segs.length) return;
    const index = Math.floor(Math.random() * segs.length);
    outcome.current = { segs, index, step };
    setLocked(segs);
    setWheelStep(step);
    setTarget(index);
    setSpinning(true);
    setSpinKey((value) => value + 1);
    setLeverKey((value) => value + 1);
    setPhase("spinning");
    unlockArcadeAudio();
    playLever();
    startWhoosh();
    setLive(`Spinning for ${["an item", "a style", "a color"][step]}.`);
  }

  function onLanded() {
    const landed = outcome.current;
    if (!landed) return;
    stopWhoosh();
    setSpinning(false);
    const segment = landed.segs[landed.index];
    const next = { ...picksRef.current };
    if (segment.item) next.item = segment.item;
    if (segment.model) next.style = segment.model;
    if (segment.palette) next.palette = segment.palette;
    picksRef.current = next;
    setPicks(next);
    playLand();
    if (landed.step < 2) {
      const following = (landed.step + 1) as Step;
      setNextStep(following);
      setPhase("ready");
      setLive(`${segment.label} locked. Spin for ${following === 1 ? "a style" : "a color"}.`);
      return;
    }
    setPhase("printing");
    setLive(`${segment.label} locked. The machine is printing your prize.`);
    void build(next);
  }

  function onPress() {
    if (phase === "reveal" || (phase === "error" && !picks.item)) {
      reset();
      return;
    }
    if (phase === "error" && picks.item && picks.style && picks.palette) {
      void build(picks);
      return;
    }
    if (!tier || phase === "spinning" || phase === "printing" || phase === "loading") return;
    spin();
  }

  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;
      event.preventDefault();
      pressRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const buttonLabel = phase === "spinning"
    ? "Spinning"
    : phase === "printing"
      ? "Printing"
      : phase === "reveal"
        ? "Spin again"
        : phase === "error"
          ? (picks.item ? "Try the press again" : "Spin again")
          : !tier
            ? "Pick a price"
            : (["Spin the item", "Spin the style", "Spin the color"] as const)[nextStep];

  const spinDisabled = phase === "spinning" || phase === "printing" || phase === "loading" || (!tier && phase !== "reveal" && phase !== "error") || filteredEmpty;
  const closest = filteredEmpty && catalog
    ? [...catalog.categories].sort((a, b) => a.price - b.price).slice(0, 3)
    : [];

  return (
    <main className="arcade-shell" data-phase={phase}>
      <header className="arcade-top">
        <Link href="/" className="arcade-brand">Product Line</Link>
        <p className="arcade-stage-label">{marquee}</p>
        <button type="button" className="arcade-mute" aria-pressed={muted} aria-label={muted ? "Unmute sound" : "Mute sound"} onClick={toggleMute}>
          <Speaker off={muted} />
        </button>
      </header>
      <div className="arcade-stage">
        <Canvas
          className="arcade-canvas"
          style={{ position: "absolute", inset: 0 }}
          dpr={flags.mobile ? [1, 1.25] : [1, 1.7]}
          gl={{ antialias: !flags.mobile, alpha: false, stencil: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
          camera={{ position: [0.28, 0.16, 6.7], fov: 32 }}
        >
          <CabinetScene
            segments={segments}
            marquee={marquee}
            spinning={spinning}
            spinKey={spinKey}
            targetIndex={target}
            idle={!tier && !spinning && phase !== "printing" && phase !== "reveal"}
            leverKey={leverKey}
            bloom={!flags.mobile && !flags.reduced}
            reducedMotion={flags.reduced}
            mobile={flags.mobile}
            onPeg={playPeg}
            onLanded={onLanded}
          />
        </Canvas>
        <div className="arcade-crt" />
        {phase === "printing" && (
          <div className="arcade-print" aria-live="polite">
            <h2>The machine is printing your prize</h2>
            <div className="arcade-paper">
              <strong>PRODUCT LINE</strong>
              ITEM {picks.item?.name}<br />
              STYLE {picks.style ? displayName(picks.style.name) : ""}<br />
              COLOR {picks.palette?.name}<br />
              {printPhase === "product" ? "The maker is at the press…" : "Laying down the pattern…"}
              <div className="arcade-scan" />
            </div>
          </div>
        )}
        {phase === "reveal" && product && (
          <div className="arcade-reveal" data-testid="reveal">
            {product.imageUrl && (
              // Arcade image URLs expire and the mock returns a data URL, so the optimizer cannot cache them.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt={product.title} />
            )}
            <p className="arcade-kicker">{product.categoryName} · {product.styleName} · {product.paletteName}</p>
            <h2>{product.title}</h2>
            <p className="arcade-price">{product.price ? money(product.price.amount, product.price.currency) : "Price from Arcade"}</p>
            <ul className="arcade-chips" aria-label="Palette">
              {product.colors.map((hex) => <li key={hex}><span className="arcade-swatch" style={{ background: hex }} />{hex}</li>)}
            </ul>
            <div className="arcade-actions">
              <a className="arcade-link" href={product.arcadeUrl} target="_blank" rel="noopener noreferrer">Open in Arcade</a>
              <button type="button" className="arcade-text" onClick={reset}>Spin again</button>
            </div>
          </div>
        )}
      </div>
      <footer className="arcade-deck">
        <div className="arcade-panel">
          <div className="arcade-tiers" role="group" aria-label="Price tier">
            {TIERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="arcade-tier"
                data-testid={`tier-${item.id}`}
                aria-pressed={tier === item.id}
                disabled={nextStep > 0 || spinning || phase === "printing" || phase === "reveal"}
                onClick={() => chooseTier(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {catalog && <p className="arcade-note">{catalog.priceNote}</p>}
          {filteredEmpty && (
            <p className="arcade-empty">
              Nothing on this wheel is {tier === "20" ? "under $20" : "under $50"}.
              {closest.length > 0 && ` Closest: ${closest.map((category) => `${category.name} ${money(category.price, category.currency)}${category.priceSource === "guess" ? " est." : ""}`).join(", ")}.`}
            </p>
          )}
          {(picks.item || picks.style || picks.palette) && phase !== "reveal" && (
            <ul className="arcade-chips">
              {picks.item && <li>Item · {picks.item.name} · {money(picks.item.price, picks.item.currency)}{picks.item.priceSource === "guess" ? " est." : ""}</li>}
              {picks.style && <li>Style · {displayName(picks.style.name)}</li>}
              {picks.palette && <li>Color · {picks.palette.name}</li>}
            </ul>
          )}
          {error && <p className="arcade-empty" role="alert">{error}</p>}
          {loadError && phase !== "reveal" && <p className="arcade-empty" role="alert">{loadError}</p>}
          <button type="button" className="arcade-spin" data-testid="spin" disabled={spinDisabled && phase !== "reveal" && phase !== "error"} onClick={onPress}>
            {buttonLabel}
          </button>
        </div>
      </footer>
      <p className="sr-only" aria-live="polite">{live}</p>
    </main>
  );
}

function Speaker({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 10v4h3l4 3V7L7 10H4z" />
      {off ? <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M16 10l5 5m0-5-5 5" /> : <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M16 9a4 4 0 0 1 0 6m2.5-8a7.5 7.5 0 0 1 0 10" />}
    </svg>
  );
}
