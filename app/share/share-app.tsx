"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShareHeader } from "@/components/share-header";
import { money } from "@/lib/share/money";
import { shrinkImage } from "@/lib/shrink-image";
import type { ShareStep, ShareView } from "@/lib/share/types";

const CHIPS = [
  { label: "Pillow", prompt: "What would this look like as a pillow?", match: /pillow/i },
  { label: "Scarf", prompt: "What would this look like as a silk scarf?", match: /scarf/i },
  { label: "Napkins", prompt: "What would this look like as dinner napkins?", match: /napkin/i },
  { label: "Placemat", prompt: "What would this look like as a placemat?", match: /placemat|place mat|table linen/i },
  { label: "Ring", prompt: "What would this look like as a ring?", match: /ring/i },
];

const BEATS = [
  { step: "uploading", label: "Reference" },
  { step: "designing", label: "Design" },
  { step: "building", label: "Product" },
] as const;

const COPY: Record<ShareStep, string> = {
  uploading: "Reading what you shared.",
  designing: "Designing an original, inspired by your share.",
  building: "Building a real product and reading its price.",
  ready: "It’s in your Arcade account, ready to buy or sample.",
  failed: "Something stopped the make.",
};

interface CategoryOption { categoryId: string; name: string; world: string }
interface InstallPrompt extends Event { prompt: () => Promise<void> }

const TOKEN_KEY = "productline.shareToken";
const WORKING = new Set<ShareStep>(["uploading", "designing", "building"]);

export function ShareApp() {
  const params = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [prompt, setPrompt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [share, setShare] = useState<ShareView | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [over, setOver] = useState(false);
  const [token, setToken] = useState("");
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(params.get("saved") || params.get("id"));
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(false);

  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    const saved = token || (typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) || "" : "");
    if (saved) headers["X-Share-Token"] = saved;
    return headers;
  }, [token]);

  const remember = useCallback((data: ShareView) => {
    setShare(data);
    setActiveId(data.shareId);
    if (data.sourceThumb) setPreview((current) => current || data.sourceThumb);
    const url = new URL(window.location.href);
    url.searchParams.set("saved", data.shareId);
    url.searchParams.delete("id");
    url.searchParams.delete("pending");
    url.searchParams.delete("shared");
    window.history.replaceState(null, "", url);
  }, []);

  const send = useCallback(async (next: { file?: File | null; url?: string }) => {
    setSending(true);
    setError("");
    try {
      const headers = authHeaders();
      let res: Response;
      if (next.file) {
        const body = new FormData();
        body.set("image", next.file, next.file.name);
        if (prompt.trim()) body.set("prompt", prompt.trim());
        if (categoryId) body.set("categoryId", categoryId);
        res = await fetch("/api/share", { method: "POST", headers, body });
      } else if (next.url) {
        res = await fetch("/api/share", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            url: next.url,
            ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
            ...(categoryId ? { categoryId } : {}),
          }),
        });
      } else {
        throw new Error("Add a photo or a link.");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save that.");
      remember(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSending(false);
    }
  }, [authHeaders, categoryId, prompt, remember]);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY) || "";
    setToken(saved);
    const iosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setIos(iosDevice);
    setInstalled(standalone);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  useEffect(() => {
    const headers = authHeaders();
    fetch("/api/shares", { headers })
      .then((res) => res.json())
      .then((data) => setNotice(data.notice ?? null))
      .catch(() => setNotice(null));
    fetch("/api/categories", { headers })
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, [authHeaders]);

  useEffect(() => {
    const id = params.get("saved") || params.get("id");
    if (id) setActiveId(id);
  }, [params]);

  useEffect(() => {
    if (!activeId) return;
    let stop = false;
    let timer = 0;
    async function poll() {
      const res = await fetch(`/api/share/${activeId}`, { headers: authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (stop) return;
      if (!res.ok) { setError(data.error || "That share is gone."); return; }
      setShare(data);
      if (data.sourceThumb) setPreview((current) => current || data.sourceThumb);
      if (WORKING.has(data.step)) timer = window.setTimeout(poll, 2000);
    }
    void poll();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [activeId, authHeaders]);

  useEffect(() => {
    if (!share || !WORKING.has(share.step)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [share]);

  useEffect(() => {
    const pending = params.get("pending");
    if (!pending || started.current) return;
    started.current = true;
    fetch(`/api/share-target?id=${encodeURIComponent(pending)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(async ({ ok, data }) => {
        if (!ok || !data.dataUrl) { setError(data.error || "That share expired."); return; }
        const blob = await (await fetch(data.dataUrl)).blob();
        const next = await shrinkImage(new File([blob], "shared.jpg", { type: "image/jpeg" })).catch(() => new File([blob], "shared.jpg", { type: "image/jpeg" }));
        setFile(next);
        setPreview(URL.createObjectURL(next));
        if (data.text || data.title) setNote([data.title, data.text].filter(Boolean).join(" — "));
        await send({ file: next });
      })
      .catch(() => setError("Could not open that share."));
  }, [params, send]);

  useEffect(() => {
    if (params.get("shared") !== "1" || !("caches" in window) || started.current) return;
    started.current = true;
    caches.open("share-to-my-arcade-v1").then(async (cache) => {
      const image = await cache.match("/_share/image");
      const metaRes = await cache.match("/_share/meta");
      const meta = metaRes ? await metaRes.json().catch(() => ({})) as { title?: string; text?: string; url?: string } : {};
      const caption = [meta.title, meta.text].filter(Boolean).join(" — ");
      if (caption) setNote(caption);
      if (image) {
        const blob = await image.blob();
        const name = image.headers.get("X-Share-Name") || "shared.jpg";
        const next = await shrinkImage(new File([blob], name, { type: blob.type || "image/jpeg" })).catch(() => new File([blob], name, { type: blob.type || "image/jpeg" }));
        setFile(next);
        setPreview(URL.createObjectURL(next));
        await send({ file: next });
        return;
      }
      const url = meta.url || (meta.text?.match(/https?:\/\/\S+/)?.[0] ?? "");
      if (url) {
        setLink(url);
        await send({ url });
      }
    }).catch(() => { /* the server share target already saved it when the worker was quiet */ });
  }, [params, send]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith("image/"));
      const pasted = item?.getAsFile();
      if (pasted) { event.preventDefault(); void take(pasted); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function take(next: File) {
    setError("");
    setShare(null);
    const shrunk = await shrinkImage(next, next.name).catch(() => next);
    setFile(shrunk);
    setPreview((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(shrunk);
    });
  }

  function applyChip(chip: (typeof CHIPS)[number]) {
    setPrompt(chip.prompt);
    const match = categories.find((item) => chip.match.test(item.name));
    if (match) setCategoryId(match.categoryId);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;
    if (!file && !link.trim()) { setError("Add a photo or paste a link."); return; }
    await send(file ? { file } : { url: link.trim() });
  }

  function saveToken(value: string) {
    setToken(value);
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }

  const working = share ? WORKING.has(share.step) : false;
  const price = money(share?.price);
  const beat = share ? BEATS.findIndex((item) => item.step === share.step) : -1;
  const ack = share && (working || share.step === "ready");

  return (
    <main className={`min-h-dvh bg-paper text-ink ${install || ios ? "pb-28" : ""}`}>
      <ShareHeader current="share" />
      <div className="mx-auto w-full max-w-xl px-5 pb-24">
        <h1 className="mt-4 font-serif text-[clamp(2.6rem,8vw,4.4rem)] font-normal leading-[1.02] tracking-[-0.045em]">
          Share to My Arcade.
        </h1>
        <p className="mt-4 max-w-md font-serif text-[1.35rem] italic leading-snug tracking-[-0.02em] text-subtle">
          A photo, a screenshot, or a post. One tap. A surprise product appears in your account.
        </p>

        <form onSubmit={save} className="mt-8">
          <label
            onDragOver={(event) => { event.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              const dropped = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
              if (dropped) void take(dropped);
            }}
            className={`relative block cursor-pointer overflow-hidden rounded-[22px] border bg-white transition ${over ? "border-focus" : "border-[#e6e5e1]"} ${preview ? "" : "border-dashed"}`}
          >
            {preview ? (
              <img src={preview} alt="The photo you shared" className="aspect-[4/5] w-full object-cover sm:aspect-square" />
            ) : (
              <span className="flex aspect-[4/5] flex-col items-center justify-center px-8 text-center sm:aspect-[5/4]">
                <span className="font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">Drop a photo, or paste one.</span>
                <span className="mt-2 text-sm text-muted">Or share a post from Instagram, X, or Pinterest.</span>
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (next) void take(next);
                event.target.value = "";
              }}
            />
          </label>
          {note && <p className="mt-3 text-sm text-muted">Shared note · {note}</p>}

          <label className="mt-4 block">
            <span className="sr-only">Post or page link</span>
            <input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Or paste a post or page link"
              inputMode="url"
              className="h-12 w-full rounded-full border border-field bg-white px-4 text-[15px] outline-none placeholder:text-hint focus:border-focus"
            />
          </label>

          {(!share || share.step === "failed") && (
            <button type="submit" disabled={sending} className="mt-4 h-14 w-full rounded-full bg-pill font-serif text-[18px] tracking-[-0.01em] text-white hover:bg-pill-hover disabled:opacity-50">
              {sending ? "Saving" : "Save to My Arcade"}
            </button>
          )}

          <details className="mt-5 border-t border-line pt-4">
            <summary className="cursor-pointer text-[13px] font-semibold tracking-[-0.01em] text-subtle">Customize</summary>
            <label className="mt-4 block">
              <span className="font-serif text-sm italic text-subtle">Prompt, if you want one</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                maxLength={700}
                placeholder="Leave this empty for a surprise"
                className="mt-2 w-full resize-none rounded-[18px] border border-field bg-white px-4 py-3 font-serif text-[1.2rem] leading-snug tracking-[-0.02em] text-ink outline-none transition placeholder:text-hint focus:border-focus focus:ring-[3px] focus:ring-green/5"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {CHIPS.map((chip) => {
                const on = prompt === chip.prompt;
                return (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => applyChip(chip)}
                    aria-pressed={on}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold tracking-[-0.01em] transition ${on ? "bg-pill text-white" : "bg-chip text-chip-ink hover:bg-[#e7e7e4]"}`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <label className="mt-5 block">
              <span className="text-[13px] font-semibold tracking-[-0.01em] text-subtle">Category</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="mt-2 h-12 w-full appearance-none rounded-full border border-field bg-white px-4 text-[15px] outline-none focus:border-focus"
              >
                <option value="">Surprise me</option>
                {categories.map((item) => (
                  <option key={item.categoryId} value={item.categoryId}>
                    {item.name}{item.world === "jewelry" ? " · jewelry" : ""}
                  </option>
                ))}
              </select>
            </label>
          </details>
        </form>

        {ack && share?.surprise && working && (
          <section className="mt-10" aria-live="polite">
            <p className="font-serif text-[1.85rem] leading-tight tracking-[-0.03em]">Saved to My Arcade.</p>
            <p className="mt-2 font-serif text-[1.25rem] italic text-subtle">Your surprise is being made.</p>
          </section>
        )}

        {share && working && (
          <section className={`mt-8 ${share.surprise ? "" : "mt-10"}`} aria-live="polite">
            <ol className="grid grid-cols-3 gap-3">
              {BEATS.map((item, index) => {
                const done = beat > index || share.step === "ready";
                const current = item.step === share.step;
                return (
                  <li key={item.step}>
                    <div className={`h-[2px] ${done || current ? "bg-green" : "bg-line"}`} />
                    <p className={`mt-2 text-[12px] font-semibold tracking-[-0.01em] ${current ? "text-ink" : "text-hint"}`}>{item.label}</p>
                  </li>
                );
              })}
            </ol>
            {!share.surprise && <p className="mt-6 font-serif text-[1.65rem] leading-tight tracking-[-0.03em]">Saved to My Arcade.</p>}
            <p className="mt-3 font-serif text-[1.15rem] leading-snug text-subtle">{COPY[share.step]}</p>
            <p className="mt-2 text-sm tabular-nums text-muted">{clock(now - Date.parse(share.createdAt))}</p>
            {share.warning && <p className="mt-3 text-sm text-subtle">{share.warning}</p>}
          </section>
        )}

        {share?.step === "failed" && (
          <p className="mt-8 font-serif text-[1.25rem] leading-snug text-ink" role="alert">{share.error || COPY.failed}</p>
        )}

        {share?.step === "ready" && (
          <Result share={share} price={price} />
        )}

        {error && <p className="mt-6 text-sm text-ink" role="alert">{error}</p>}

        <details className="mt-12 border-t border-line pt-5">
          <summary className="cursor-pointer text-[13px] font-semibold tracking-[-0.01em] text-subtle">Access token</summary>
          <p className="mt-3 text-sm leading-relaxed text-muted">Only needed when this server has SHARE_TOKEN set. The Arcade key never leaves the server.</p>
          <input
            value={token}
            onChange={(event) => saveToken(event.target.value.trim())}
            placeholder="X-Share-Token"
            autoComplete="off"
            className="mt-3 h-11 w-full rounded-full border border-field bg-white px-4 text-sm outline-none focus:border-focus"
          />
        </details>

        {(notice || share?.notice) && <p className="mt-8 text-[12px] leading-relaxed text-hint">{notice || share?.notice}</p>}
      </div>

      {!installed && (install || ios) && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
            <p className="font-serif text-[16px] tracking-[-0.02em]">Install, then share from any app.</p>
            {install ? (
              <button type="button" onClick={() => void install.prompt()} className="h-10 shrink-0 rounded-full bg-pill px-4 text-sm font-semibold text-white">Install</button>
            ) : (
              <button type="button" onClick={() => setShowInstall((value) => !value)} className="h-10 shrink-0 rounded-full bg-pill px-4 text-sm font-semibold text-white">How</button>
            )}
          </div>
          {showInstall && (
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
              In Safari, tap Share, then Add to Home Screen. iOS does not hand a photo or a link to the installed page from the share sheet. Android does: choose My Arcade.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function Result({ share, price }: { share: ShareView; price: string | null }) {
  return (
    <article className="mt-10">
      {share.reveal ? (
        <h2 className="font-serif text-[clamp(1.8rem,5vw,2.6rem)] font-normal leading-[1.08] tracking-[-0.04em]">{share.reveal}</h2>
      ) : (
        <>
          <p className="font-serif text-sm uppercase tracking-[0.08em] text-muted">{share.categoryName || "Product"}</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <h2 className="font-serif text-[clamp(2rem,6vw,3rem)] font-normal leading-[1.02] tracking-[-0.04em]">{share.title || share.categoryName}</h2>
            {price && <p className="font-serif text-[2rem] leading-none tracking-[-0.03em]">{price}</p>}
          </div>
        </>
      )}
      {share.imageUrl && (
        <img src={share.imageUrl} alt={share.title || "The Arcade product"} className="mt-6 aspect-square w-full rounded-[18px] border border-[#e6e5e1] bg-white object-cover" />
      )}
      {share.sourceThumb && (
        <div className="mt-5 flex items-center gap-3">
          <img src={share.sourceThumb} alt="" className="h-14 w-14 rounded-[12px] border border-white object-cover shadow-[0_6px_16px_rgba(20,23,22,.12)]" />
          <p className="font-serif text-[15px] italic leading-snug text-subtle">Inspired by your share. Your photo set the colors and the mood. This one is an original.</p>
        </div>
      )}
      {share.selectionLabel && <p className="mt-4 text-sm text-muted">{share.selectionLabel}</p>}
      {share.maker && <p className="mt-1 text-sm text-muted">Made to order by {share.maker}.</p>}
      {share.arcadeUrl && (
        <a href={share.arcadeUrl} target="_blank" rel="noopener noreferrer" className="mt-6 flex h-14 items-center justify-center rounded-full bg-pill font-serif text-[18px] tracking-[-0.01em] text-white hover:bg-pill-hover">
          Open in Arcade
        </a>
      )}
    </article>
  );
}

function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
