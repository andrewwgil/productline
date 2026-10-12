"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShareHeader } from "@/components/share-header";
import { money } from "@/lib/share/money";
import type { ShareStep, ShareView } from "@/lib/share/types";

const WORKING = new Set<ShareStep>(["uploading", "designing", "building"]);
const LABEL: Record<ShareStep, string> = {
  uploading: "Uploading",
  designing: "Designing",
  building: "Building",
  ready: "Ready",
  failed: "Stopped",
};

export function Gallery() {
  const [shares, setShares] = useState<ShareView[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    async function load() {
      const token = localStorage.getItem("productline.shareToken") || "";
      const headers: Record<string, string> = token ? { "X-Share-Token": token } : {};
      const res = await fetch("/api/shares", { headers, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (stop) return;
      if (!res.ok) { setError(data.error || "Could not load shares."); return; }
      setNotice(data.notice ?? null);
      const list = (data.shares ?? []) as ShareView[];
      const active = list.filter((item) => WORKING.has(item.step));
      if (!active.length) { setShares(list); return; }
      const fresh = await Promise.all(active.map(async (item) => {
        const next = await fetch(`/api/share/${item.shareId}`, { headers, cache: "no-store" });
        const body = await next.json().catch(() => null);
        return next.ok && body?.shareId ? body as ShareView : item;
      }));
      const byId = new Map(fresh.map((item) => [item.shareId, item]));
      setShares(list.map((item) => byId.get(item.shareId) ?? item));
    }
    void load();
    const timer = window.setInterval(load, 4000);
    return () => { stop = true; window.clearInterval(timer); };
  }, []);

  return (
    <main className="min-h-dvh bg-paper text-ink">
      <ShareHeader current="gallery" />
      <div className="mx-auto w-full max-w-3xl px-5 pb-24">
        <h1 className="mt-4 font-serif text-[clamp(2.6rem,7vw,4.4rem)] font-normal leading-[1.02] tracking-[-0.045em]">My Arcade</h1>
        <p className="mt-4 max-w-lg font-serif text-[1.25rem] italic leading-snug text-subtle">
          Newest first. Each surprise names itself when the price is ready.
        </p>

        {!shares.length && !error && (
          <div className="mt-16 max-w-md">
            <p className="font-serif text-[1.8rem] leading-tight tracking-[-0.03em]">Nothing here yet.</p>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">When a photo becomes a product, it waits here with its price.</p>
            <Link href="/share" className="mt-6 inline-flex h-12 items-center rounded-full bg-pill px-5 font-serif text-[17px] text-white">Share to My Arcade</Link>
          </div>
        )}

        <ul className="mt-12 space-y-12">
          {shares.map((share) => {
            const price = money(share.price);
            return (
              <li key={share.shareId} className="grid gap-5 border-t border-line pt-8 sm:grid-cols-[148px_minmax(0,1fr)_minmax(180px,240px)] sm:items-start">
                <Link href={`/share?saved=${share.shareId}`} className="block">
                  {share.sourceThumb ? (
                    <img src={share.sourceThumb} alt="" className="aspect-square w-full rounded-[16px] border border-[#e6e5e1] object-cover sm:w-[148px]" />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center rounded-[16px] border border-dashed border-field bg-white text-sm text-hint sm:w-[148px]">Link</div>
                  )}
                  <span className="mt-2 block text-[12px] font-semibold tracking-[-0.01em] text-hint">Your share</span>
                </Link>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{LABEL[share.step]}</p>
                  <h2 className="mt-2 font-serif text-[1.7rem] leading-[1.15] tracking-[-0.03em]">
                    <Link href={`/share?saved=${share.shareId}`} className="hover:underline">{share.reveal || share.prompt || "Saved to My Arcade"}</Link>
                  </h2>
                  <p className="mt-2 font-serif text-[15px] italic text-subtle">Inspired by your share{share.categoryName ? ` · ${share.categoryName}` : ""}</p>
                  {share.step === "failed" && share.error && <p className="mt-3 text-sm text-ink">{share.error}</p>}
                </div>
                <div>
                  {share.imageUrl ? (
                    <img src={share.imageUrl} alt={share.title || "Arcade product"} className="aspect-square w-full rounded-[16px] border border-[#e6e5e1] bg-white object-cover" />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center rounded-[16px] border border-dashed border-field bg-white text-sm text-hint">
                      {share.step === "failed" ? "No product" : "Designing"}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    {price ? <p className="font-serif text-[1.45rem] tracking-[-0.03em]">{price}</p> : <span />}
                    {share.arcadeUrl && (
                      <a href={share.arcadeUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold tracking-[-0.01em] text-ink underline decoration-line underline-offset-4">
                        Open in Arcade
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {error && <p className="mt-8 text-sm" role="alert">{error}</p>}
        {notice && <p className="mt-16 text-[12px] leading-relaxed text-hint">{notice}</p>}
      </div>
    </main>
  );
}
