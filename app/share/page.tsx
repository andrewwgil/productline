import type { Metadata } from "next";
import { Suspense } from "react";
import { ShareApp } from "./share-app";

export const metadata: Metadata = {
  title: "Share to Arcade",
  description: "See something you love. Get an original, priced Arcade product inspired by it.",
};

export default function SharePage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-paper" />}>
      <ShareApp />
    </Suspense>
  );
}
